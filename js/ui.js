/**
 * VideoWall Pro — UI Manager
 *
 * Owns all user-interface concerns that are not part of an individual player:
 *   - Settings panel (open / close, form bindings, all setting changes)
 *   - Theme application
 *   - Toast notification queue
 *   - Shared clock tick (one setInterval for all overlays)
 *   - Status bar updates (player count, audio count)
 *   - Layout button active-state synchronisation
 *   - Panel backdrop (click-outside to close)
 *
 * All setting changes are dispatched through App.bus so other modules
 * can react without UIManager having direct references to them.
 */

'use strict';

class UIManager {
  // ─── Clock ─────────────────────────────────────────────────────────────────
  /** @private @type {number} setInterval handle */
  #clockInterval = null;
  /** @private @type {Set<Function>} */
  #clockSubscribers = new Set();

  // ─── Settings panel ────────────────────────────────────────────────────────
  /** @private @type {boolean} */
  #settingsOpen = false;
  /** @private @type {HTMLElement} */
  #backdrop;
  /** @private @type {HTMLElement} */
  #panelEl;

  // ─── Toast ─────────────────────────────────────────────────────────────────
  /** @private @type {HTMLElement} */
  #toastContainer;

  // ───────────────────────────────────────────────────────────────────────────
  // Constructor
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * @param {object} preferences  Loaded preferences (from StorageManager.loadPreferences()).
   */
  constructor(preferences) {
    this.#panelEl       = document.getElementById('settings-panel');
    this.#toastContainer = document.getElementById('toast-container');

    this.#createBackdrop();
    this.#bindSettingsPanel(preferences);
    this.#bindTopbarControls();
    this.#bindEscapeAction();
    this.#startClock(preferences);

    // Sync layout buttons to current layout.
    this.updateLayoutButtons(preferences.layout.rows, preferences.layout.cols);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Clock
  // ───────────────────────────────────────────────────────────────────────────

  #startClock(preferences) {
    // Topbar clock subscriber (always active).
    const topbarClock = document.getElementById('status-time');
    if (topbarClock) {
      this.#clockSubscribers.add(time => { topbarClock.textContent = time; });
    }

    const tick = () => {
      const time = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      this.#clockSubscribers.forEach(cb => {
        try { cb(time); } catch { /* never crash the clock */ }
      });
    };

    tick(); // fire immediately so displays aren't blank for 1 second
    this.#clockInterval = setInterval(tick, 1000);
  }

  /**
   * Register a subscriber to receive the current time string every second.
   * Used by VideoPlayer to update its overlay clock.
   *
   * @param {(time: string) => void} callback
   * @returns {() => void} Unsubscribe function — call it in destroy().
   */
  subscribeClock(callback) {
    this.#clockSubscribers.add(callback);
    return () => this.#clockSubscribers.delete(callback);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Settings Panel
  // ───────────────────────────────────────────────────────────────────────────

  #createBackdrop() {
    this.#backdrop = document.createElement('div');
    this.#backdrop.className = 'panel-backdrop';
    this.#backdrop.setAttribute('aria-hidden', 'true');
    this.#backdrop.addEventListener('click', () => this.closeSettings());
    document.getElementById('app').appendChild(this.#backdrop);
  }

  /** Bind all settings form controls. */
  #bindSettingsPanel(preferences) {
    // ── Close button ────────────────────────────────────────────────────────
    document.getElementById('btn-close-settings')
      ?.addEventListener('click', () => this.closeSettings());

    // ── Theme ───────────────────────────────────────────────────────────────
    const themeSelect = document.getElementById('select-theme');
    if (themeSelect) {
      themeSelect.value = preferences.theme;
      themeSelect.addEventListener('change', e => {
        App.bus.emit('settings:theme', { theme: e.target.value });
      });
    }

    // ── Boolean toggles ─────────────────────────────────────────────────────
    this.#bindToggle('toggle-overlays', preferences.showOverlays, v => {
      App.bus.emit('settings:overlays', { visible: v });
    });
    this.#bindToggle('toggle-controls', preferences.showControls, v => {
      App.bus.emit('settings:controls', { visible: v });
    });
    this.#bindToggle('toggle-animations', preferences.animations, v => {
      App.bus.emit('settings:animations', { enabled: v });
    });
    this.#bindToggle('toggle-autoplay', preferences.autoplay, v => {
      App.bus.emit('settings:autoplay', { enabled: v });
    });
    this.#bindToggle('toggle-sync', preferences.syncPlayers, v => {
      App.bus.emit('settings:sync', { enabled: v });
    });

    // ── Volume slider ────────────────────────────────────────────────────────
    const volSlider  = document.getElementById('range-volume');
    const volDisplay = document.getElementById('volume-display');
    if (volSlider && volDisplay) {
      volSlider.value = String(preferences.volume);
      volDisplay.textContent = `${preferences.volume}%`;
      volSlider.addEventListener('input', e => {
        const v = parseInt(e.target.value, 10);
        volDisplay.textContent = `${v}%`;
        App.bus.emit('settings:volume', { volume: v });
      });
    }

    // ── Custom rows / cols inputs ────────────────────────────────────────────
    const colsInput = document.getElementById('input-cols');
    const rowsInput = document.getElementById('input-rows');
    if (colsInput && rowsInput) {
      colsInput.value = String(preferences.layout.cols);
      rowsInput.value = String(preferences.layout.rows);

      const applyCustomLayout = () => {
        const rows = Math.max(1, Math.min(6, parseInt(rowsInput.value, 10) || 2));
        const cols = Math.max(1, Math.min(6, parseInt(colsInput.value, 10) || 3));
        rowsInput.value = String(rows);
        colsInput.value = String(cols);
        App.bus.emit('settings:layout', { rows, cols });
      };

      colsInput.addEventListener('change', applyCustomLayout);
      rowsInput.addEventListener('change', applyCustomLayout);
    }
  }

  /**
   * Wire a checkbox toggle.
   * @param {string}            id          Element id.
   * @param {boolean}           initialValue
   * @param {(v: boolean)=>void} onChange
   */
  #bindToggle(id, initialValue, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = initialValue;
    el.addEventListener('change', e => onChange(e.target.checked));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Topbar Bindings (supplemental — main bindings are in App)
  // ───────────────────────────────────────────────────────────────────────────

  #bindTopbarControls() {
    document.getElementById('btn-settings')
      ?.addEventListener('click', () => this.toggleSettings());
  }

  #bindEscapeAction() {
    App.bus.on('action:escape', () => {
      if (this.#settingsOpen) this.closeSettings();
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Panel Open / Close
  // ───────────────────────────────────────────────────────────────────────────

  toggleSettings() {
    this.#settingsOpen ? this.closeSettings() : this.openSettings();
  }

  openSettings() {
    this.#settingsOpen = true;
    this.#panelEl.classList.add('open');
    this.#panelEl.setAttribute('aria-hidden', 'false');
    this.#backdrop.classList.add('visible');
    document.getElementById('btn-settings')?.classList.add('active');
  }

  closeSettings() {
    this.#settingsOpen = false;
    this.#panelEl.classList.remove('open');
    this.#panelEl.setAttribute('aria-hidden', 'true');
    this.#backdrop.classList.remove('visible');
    document.getElementById('btn-settings')?.classList.remove('active');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Toast Notifications
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Show a non-blocking toast message.
   *
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} [type='info']
   * @param {number} [duration=3000]  ms before auto-dismiss.
   */
  toast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    this.#toastContainer.appendChild(toast);

    // Dismiss after duration.
    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      // Fallback remove in case animation doesn't fire (e.g., prefers-reduced-motion).
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Status Bar Updates
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * @param {number} count
   */
  updatePlayerCount(count) {
    const el = document.getElementById('player-count');
    if (el) el.textContent = String(count);
  }

  /**
   * @param {number} count
   */
  updateAudioCount(count) {
    const el = document.getElementById('audio-count');
    if (el) el.textContent = String(count);
  }

  /**
   * Mark the correct layout button as active and sync the settings inputs.
   * @param {number} rows
   * @param {number} cols
   */
  updateLayoutButtons(rows, cols) {
    const key = `${rows}x${cols}`;
    document.querySelectorAll('.layout-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layout === key);
    });

    const colsInput = document.getElementById('input-cols');
    const rowsInput = document.getElementById('input-rows');
    if (colsInput) colsInput.value = String(cols);
    if (rowsInput) rowsInput.value = String(rows);
  }

  /**
   * Update the play/pause button icon and title.
   * @param {boolean} isPlaying
   */
  updatePlayPauseButton(isPlaying) {
    const btn = document.getElementById('btn-play-pause');
    if (!btn) return;
    btn.textContent = isPlaying ? '⏸' : '▶';
    btn.title       = isPlaying ? 'Pause All (P)' : 'Play All (P)';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ───────────────────────────────────────────────────────────────────────────

  destroy() {
    if (this.#clockInterval !== null) {
      clearInterval(this.#clockInterval);
      this.#clockInterval = null;
    }
    this.#clockSubscribers.clear();
    this.#backdrop?.remove();
  }
}
