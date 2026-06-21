/**
 * VideoWall Pro — VideoPlayer
 *
 * Encapsulates a single YouTube player cell: iframe, broadcast overlay,
 * hover controls, loading spinner, and all associated state.
 *
 * Lifecycle:
 *   1. Constructor builds the DOM inside the provided cell element.
 *   2. YouTubeManager.whenReady() ensures the YT.Player is created only after
 *      the IFrame API is available.
 *   3. All public state mutations (audio, volume, play/pause) are safe to call
 *      before the player is ready — they queue into the state fields and are
 *      applied in #onPlayerReady().
 *   4. destroy() cleans up the YT.Player, removes event listeners, and
 *      unsubscribes from the shared clock.
 *
 * Audio model:
 *   - Players always start muted (browser autoplay policy).
 *   - setAudio(true)  → unmute, apply volume.
 *   - setAudio(false) → mute.
 *   - The App class manages which players are in the "audio group".
 */

'use strict';

class VideoPlayer {
  // ─── Configuration ─────────────────────────────────────────────────────────
  /** @private @type {{id:string,title:string,youtubeId:string,channel:string}} */
  #config;
  /** @private @type {number} */
  #cellIndex;

  // ─── DOM references ────────────────────────────────────────────────────────
  /** @private @type {HTMLElement} */
  #cellEl;
  /** @private @type {HTMLElement} */
  #overlayEl;
  /** @private @type {HTMLElement} */
  #camLabelEl;
  /** @private @type {HTMLElement} */
  #hoverControlsEl;
  /** @private @type {HTMLElement} */
  #loadingEl;
  /** @private @type {HTMLElement} */
  #errorOverlayEl = null;
  /** @private @type {HTMLButtonElement} */
  #muteBtn = null;
  /** @private @type {HTMLInputElement} */
  #volumeSliderEl = null;

  // ─── YouTube player ────────────────────────────────────────────────────────
  /** @private @type {YT.Player|null} */
  #ytPlayer = null;
  /** @private @type {boolean} */
  #playerReady = false;

  // ─── State ─────────────────────────────────────────────────────────────────
  /** @private */ #muted     = true;
  /** @private */ #volume    = 80;
  /** @private */ #hasAudio  = false;
  /** @private */ #isSelected = false;
  /** @private */ #isPlaying   = false;
  /** @private */ #errorShown  = false;

  // ─── Retry ─────────────────────────────────────────────────────────────────
  /** @private @type {number} Retry attempts remaining (max 3) */
  #retryCount = 0;
  /** @private @type {number|null} setTimeout handle */
  #retryTimer = null;

  // ─── Cleanup handles ───────────────────────────────────────────────────────
  /** @private @type {Function} */
  #boundCellClick;
  /** @private @type {Function} */
  #boundCellDblClick;

  // ───────────────────────────────────────────────────────────────────────────
  // Constructor
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} cellEl         The .cell container managed by LayoutManager.
   * @param {object}      config         Video config from VIDEOS array.
   * @param {number}      cellIndex      Visual index in the grid (0-based).
   * @param {number}      [initialVolume=80]
   */
  constructor(cellEl, config, cellIndex, initialVolume = 80) {
    this.#config    = config;
    this.#cellEl    = cellEl;
    this.#cellIndex = cellIndex;
    this.#volume    = initialVolume;

    this.#buildDOM();
    this.#attachCellListeners();

    // Defer player creation until the YouTube IFrame API is available.
    YouTubeManager.whenReady(() => this.#initYTPlayer());
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DOM Construction
  // ───────────────────────────────────────────────────────────────────────────

  /** Build all child elements inside #cellEl, preserving the index badge. */
  #buildDOM() {
    // Preserve the cell-index-badge if present (added by LayoutManager).
    const badge = this.#cellEl.querySelector('.cell-index-badge');
    this.#cellEl.innerHTML = '';
    if (badge) this.#cellEl.appendChild(badge);

    // ── Player frame ────────────────────────────────────────────────────────
    const frame = document.createElement('div');
    frame.className = 'player-frame';

    const ytContainer = document.createElement('div');
    ytContainer.id = `yt-${this.#config.id}`;
    frame.appendChild(ytContainer);
    this.#cellEl.appendChild(frame);

    // ── Loading spinner ─────────────────────────────────────────────────────
    this.#loadingEl = document.createElement('div');
    this.#loadingEl.className = 'cell-loading';
    this.#loadingEl.setAttribute('aria-hidden', 'true');
    this.#loadingEl.innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>';
    this.#cellEl.appendChild(this.#loadingEl);

    // ── Error overlay (DOM-based, no CSS ::after) ────────────────────────────
    this.#errorOverlayEl = document.createElement('div');
    this.#errorOverlayEl.className = 'error-overlay hidden';
    this.#errorOverlayEl.setAttribute('aria-live', 'assertive');
    this.#errorOverlayEl.innerHTML = `
      <div class="error-icon" aria-hidden="true">⚠</div>
      <div class="error-title">Stream Unavailable</div>
      <div class="error-detail">
        <span class="error-code-badge"></span>
        <span class="error-desc"></span>
      </div>
    `;
    this.#cellEl.appendChild(this.#errorOverlayEl);

    // ── Broadcast overlay ───────────────────────────────────────────────────
    this.#overlayEl = this.#buildOverlay();
    this.#cellEl.appendChild(this.#overlayEl);

    // ── Hover controls ──────────────────────────────────────────────────────
    this.#hoverControlsEl = this.#buildHoverControls();
    this.#cellEl.appendChild(this.#hoverControlsEl);
  }

  /** Build the broadcast-style overlay (top: cam label + LIVE; bottom: audio + channel + clock). */
  #buildOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('aria-hidden', 'true');

    // ── Top row ─────────────────────────────────────────────────────────────
    const top = document.createElement('div');
    top.className = 'overlay-top';

    this.#camLabelEl = document.createElement('span');
    this.#camLabelEl.className = 'cam-label';
    this.#camLabelEl.textContent = `CAM ${this.#cellIndex + 1}`;

    const live = document.createElement('span');
    live.className = 'live-badge';
    live.setAttribute('aria-label', 'Live');
    live.textContent = 'LIVE';

    top.appendChild(this.#camLabelEl);
    top.appendChild(live);

    // ── Bottom row ──────────────────────────────────────────────────────────
    const bottom = document.createElement('div');
    bottom.className = 'overlay-bottom';

    const audioIcon = document.createElement('span');
    audioIcon.className = 'overlay-audio-icon';
    audioIcon.setAttribute('aria-label', 'Audio active');
    audioIcon.textContent = '🔊';

    const channelEl = document.createElement('span');
    channelEl.className = 'channel-name';
    channelEl.textContent = this.#config.channel || this.#config.title;

    bottom.appendChild(audioIcon);
    bottom.appendChild(channelEl);

    overlay.appendChild(top);
    overlay.appendChild(bottom);

    return overlay;
  }

  /** Build the hover controls panel (replaces overlay while hovering). */
  #buildHoverControls() {
    const wrapper = document.createElement('div');
    wrapper.className = 'hover-controls';
    wrapper.setAttribute('aria-label', 'Player controls');

    const inner = document.createElement('div');
    inner.className = 'hover-controls-inner';

    // Title
    const title = document.createElement('div');
    title.className = 'hover-title';
    title.textContent = this.#config.title;

    // Control buttons
    const row = document.createElement('div');
    row.className = 'ctrl-row';

    const btnDefs = [
      { action: 'play',       icon: '▶',  label: 'Play'          },
      { action: 'pause',      icon: '⏸', label: 'Pause'         },
      { action: 'mute',       icon: '🔇', label: 'Toggle Audio'  },
      { action: 'fullscreen', icon: '⛶', label: 'Fullscreen'    },
      { action: 'reload',     icon: '↺',  label: 'Reload'        },
    ];

    btnDefs.forEach(({ action, icon, label }) => {
      const btn = document.createElement('button');
      btn.className = 'ctrl-btn';
      btn.dataset.action = action;
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.textContent = icon;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.#onControlClick(action);
      });

      if (action === 'mute') this.#muteBtn = btn;
      row.appendChild(btn);
    });

    // Volume control
    const volControl = document.createElement('div');
    volControl.className = 'volume-control';

    const volIcon = document.createElement('span');
    volIcon.className = 'volume-icon';
    volIcon.setAttribute('aria-hidden', 'true');
    volIcon.textContent = '🔉';

    this.#volumeSliderEl = document.createElement('input');
    this.#volumeSliderEl.type = 'range';
    this.#volumeSliderEl.className = 'volume-slider';
    this.#volumeSliderEl.min = '0';
    this.#volumeSliderEl.max = '100';
    this.#volumeSliderEl.value = String(this.#volume);
    this.#volumeSliderEl.setAttribute('aria-label', 'Volume');

    this.#volumeSliderEl.addEventListener('input', (e) => {
      e.stopPropagation();
      this.setVolume(parseInt(e.target.value, 10));
    });
    // Prevent cell click from firing when interacting with the slider.
    this.#volumeSliderEl.addEventListener('click', e => e.stopPropagation());

    volControl.appendChild(volIcon);
    volControl.appendChild(this.#volumeSliderEl);

    inner.appendChild(title);
    inner.appendChild(row);
    inner.appendChild(volControl);
    wrapper.appendChild(inner);

    return wrapper;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cell Event Listeners
  // ───────────────────────────────────────────────────────────────────────────

  #attachCellListeners() {
    this.#boundCellClick    = this.#onCellClick.bind(this);
    this.#boundCellDblClick = this.#onCellDblClick.bind(this);
    this.#cellEl.addEventListener('click',    this.#boundCellClick);
    this.#cellEl.addEventListener('dblclick', this.#boundCellDblClick);
  }

  /** @param {MouseEvent} e */
  #onCellClick(e) {
    // Clicks inside hover controls are handled by their own listeners.
    if (e.target.closest('.hover-controls')) return;

    if (e.ctrlKey || e.metaKey) {
      App.bus.emit('player:ctrlClick', { player: this });
    } else {
      App.bus.emit('player:click', { player: this });
    }
  }

  /** @param {MouseEvent} e */
  #onCellDblClick(e) {
    if (e.target.closest('.hover-controls')) return;
    App.bus.emit('player:dblClick', { player: this });
  }

  /** @param {string} action */
  #onControlClick(action) {
    switch (action) {
      case 'play':
        this.play();
        break;
      case 'pause':
        this.pause();
        break;
      case 'mute':
        // Toggle: if muted → exclusive audio; if unmuted → remove from group.
        if (this.#muted) {
          App.bus.emit('player:click', { player: this });
        } else {
          App.bus.emit('player:audioOff', { player: this });
        }
        break;
      case 'fullscreen':
        this.enterFullscreen();
        break;
      case 'reload':
        this.reload();
        break;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // YouTube Player
  // ───────────────────────────────────────────────────────────────────────────

  #initYTPlayer() {
    this.#ytPlayer = YouTubeManager.createPlayer(
      `yt-${this.#config.id}`,
      this.#config.youtubeId,
      this.#volume,
      {
        onReady:       e => this.#onPlayerReady(e),
        onStateChange: e => this.#onPlayerStateChange(e),
        onError:       e => this.#onPlayerError(e),
      }
    );
  }

  /** @param {YT.PlayerEvent} _event */
  #onPlayerReady(_event) {
    this.#playerReady = true;

    // Apply initial state: muted autoplay.
    this.#ytPlayer.setVolume(this.#volume);
    this.#ytPlayer.mute();
    this.#ytPlayer.playVideo();

    // Hide loading spinner.
    this.#loadingEl?.classList.add('hidden');

    App.bus.emit('player:ready', { player: this });
  }

  /** @param {YT.OnStateChangeEvent} event */
  #onPlayerStateChange(event) {
    switch (event.data) {
      case YT.PlayerState.PLAYING:
        this.#isPlaying = true;
        this.#cellEl.classList.remove('error-state');
        break;
      case YT.PlayerState.PAUSED:
        this.#isPlaying = false;
        break;
      case YT.PlayerState.ENDED:
        // For VOD: seek back to start and replay.
        // For live streams: stream has ended — nothing we can do.
        try {
          const duration = this.#ytPlayer?.getDuration?.() ?? 0;
          if (duration > 0) {
            // Regular video — restart from the beginning.
            this.#ytPlayer.seekTo(0, true);
            this.#ytPlayer.playVideo();
          }
        } catch { /* live stream ended, ignore */ }
        break;
    }

    App.bus.emit('player:stateChange', { player: this, state: event.data });
  }

  /** @param {YT.OnErrorEvent} event */
  #onPlayerError(event) {
    const messages = {
      2:   'ID de video inválido',
      5:   'Error del reproductor HTML5',
      100: 'Video no encontrado o privado',
      101: 'Embedding desactivado por el propietario',
      150: 'Embedding desactivado por el propietario',
      153: 'Restricción de región o edad',
    };

    // Error 5 (HTML5 player error) is often transient.
    // Auto-retry up to 3 times with a 2.5 s delay before giving up.
    if (event.data === 5 && this.#retryCount < 3) {
      this.#retryCount++;
      console.warn(
        `[VideoPlayer] ${this.#config.id} — error 5, retry ${this.#retryCount}/3 in 2.5 s`
      );
      this.#retryTimer = setTimeout(() => {
        this.#retryTimer = null;
        if (this.#ytPlayer) {
          try {
            this.#ytPlayer.loadVideoById({
              videoId: this.#config.youtubeId,
              suggestedQuality: 'default',
            });
          } catch { /* player was destroyed between scheduling and firing */ }
        }
      }, 2500);
      return; // Don't show error state yet — give the retry a chance.
    }

    // Deduplicate: a single player can fire onError multiple times for the
    // same failure (e.g. YouTube fires it once per retry attempt internally).
    // Only process and display the first occurrence.
    if (this.#errorShown) return;
    this.#errorShown = true;

    const message = messages[event.data] ?? `Error desconocido`;

    // Populate the DOM error overlay (no CSS ::after — supports dynamic content).
    if (this.#errorOverlayEl) {
      const badge = this.#errorOverlayEl.querySelector('.error-code-badge');
      const desc  = this.#errorOverlayEl.querySelector('.error-desc');
      if (badge) badge.textContent = `Código ${event.data}`;
      if (desc)  desc.textContent  = message;
      this.#errorOverlayEl.classList.remove('hidden');
    }

    this.#cellEl.classList.add('error-state');
    this.#cellEl.dataset.errorCode = event.data;

    App.bus.emit('player:error', { player: this, code: event.data, message });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  get id()         { return this.#config.id;    }
  get title()      { return this.#config.title; }
  get volume()     { return this.#volume;        }
  get cellIndex()  { return this.#cellIndex;     }
  get cellEl()     { return this.#cellEl;        }
  get isMuted()    { return this.#muted;         }
  get isPlaying()  { return this.#isPlaying;     }
  get hasAudio()   { return this.#hasAudio;      }
  get isSelected() { return this.#isSelected;    }

  /**
   * Activate or deactivate audio for this player.
   * This is the single source of truth for mute state.
   * @param {boolean} active
   */
  setAudio(active) {
    this.#hasAudio = active;
    this.#muted    = !active;

    if (this.#playerReady && this.#ytPlayer) {
      if (active) {
        this.#ytPlayer.unMute();
        this.#ytPlayer.setVolume(this.#volume);
      } else {
        this.#ytPlayer.mute();
      }
    }

    this.#cellEl.classList.toggle('has-audio', active);
    this.#refreshMuteButton();
  }

  /**
   * Set volume (0–100). Respects muted state.
   * @param {number} vol
   */
  setVolume(vol) {
    this.#volume = Math.max(0, Math.min(100, vol));

    if (this.#volumeSliderEl) {
      this.#volumeSliderEl.value = String(this.#volume);
    }

    // Only push to YT player if we're supposed to be audible.
    if (this.#playerReady && this.#ytPlayer && !this.#muted) {
      this.#ytPlayer.setVolume(this.#volume);
    }
  }

  /**
   * Adjust volume by ±delta.
   * @param {number} delta
   */
  adjustVolume(delta) {
    this.setVolume(this.#volume + delta);
  }

  /**
   * Highlight this cell as the active/selected player.
   * @param {boolean} selected
   */
  setSelected(selected) {
    this.#isSelected = selected;
    this.#cellEl.classList.toggle('selected', selected);
  }

  play() {
    if (this.#playerReady && this.#ytPlayer) {
      this.#ytPlayer.playVideo();
    }
  }

  pause() {
    if (this.#playerReady && this.#ytPlayer) {
      this.#ytPlayer.pauseVideo();
    }
  }

  /**
   * Seek by a relative offset in seconds.
   * Silently ignores errors from live streams (no seekable range).
   * @param {number} seconds  Positive = forward, negative = backward.
   */
  seekBy(seconds) {
    if (!this.#playerReady || !this.#ytPlayer) return;
    try {
      const current = this.#ytPlayer.getCurrentTime() ?? 0;
      this.#ytPlayer.seekTo(current + seconds, true);
    } catch {
      // Live streams may throw — expected, ignore.
    }
  }

  /**
   * Reload (rebuffer) this stream.
   * Shows the loading spinner until the player fires PLAYING again.
   */
  reload() {
    if (!this.#playerReady || !this.#ytPlayer) return;

    // Reset error state fully.
    this.#errorShown = false;
    this.#retryCount = 0;
    this.#cellEl.classList.remove('error-state');
    delete this.#cellEl.dataset.errorCode;
    if (this.#errorOverlayEl) {
      this.#errorOverlayEl.classList.add('hidden');
      const badge = this.#errorOverlayEl.querySelector('.error-code-badge');
      const desc  = this.#errorOverlayEl.querySelector('.error-desc');
      if (badge) badge.textContent = '';
      if (desc)  desc.textContent  = '';
    }

    this.#loadingEl?.classList.remove('hidden');

    this.#ytPlayer.loadVideoById({
      videoId: this.#config.youtubeId,
      suggestedQuality: 'hd720',
    });

    // Re-apply mute state after reload (browser may reset it).
    setTimeout(() => {
      if (!this.#ytPlayer) return;
      if (this.#muted) {
        this.#ytPlayer.mute();
      } else {
        this.#ytPlayer.unMute();
        this.#ytPlayer.setVolume(this.#volume);
      }
    }, 600);
  }

  /** Request fullscreen on the cell element (not just the iframe). */
  enterFullscreen() {
    const el   = this.#cellEl;
    const req  = el.requestFullscreen?.bind(el)
              ?? el.webkitRequestFullscreen?.bind(el)
              ?? el.mozRequestFullScreen?.bind(el);

    req?.().catch(() => {
      // Fullscreen requires a user gesture — silently ignore if unavailable.
    });
  }

  /**
   * Update the CAM label when cell position changes after a swap.
   * @param {number} newIndex
   */
  updateCellIndex(newIndex) {
    this.#cellIndex = newIndex;
    if (this.#camLabelEl) {
      this.#camLabelEl.textContent = `CAM ${newIndex + 1}`;
    }
  }

  /**
   * Tear down this player instance and clean up all resources.
   * After destroy(), this object must not be used.
   */
  destroy() {
    // Cancel any pending auto-retry.
    if (this.#retryTimer !== null) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }

    // Remove cell-level event listeners.
    this.#cellEl.removeEventListener('click',    this.#boundCellClick);
    this.#cellEl.removeEventListener('dblclick', this.#boundCellDblClick);

    // Destroy the YT player (removes iframe, stops network requests).
    if (this.#ytPlayer) {
      try { this.#ytPlayer.destroy(); } catch { /* ignore */ }
      this.#ytPlayer = null;
    }

    this.#playerReady = false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ───────────────────────────────────────────────────────────────────────────

  #refreshMuteButton() {
    if (!this.#muteBtn) return;
    const active = !this.#muted;
    this.#muteBtn.classList.toggle('ctrl-mute-active', active);
    this.#muteBtn.textContent = active ? '🔊' : '🔇';
    this.#muteBtn.title       = active ? 'Disable Audio' : 'Enable Audio';
  }

}
