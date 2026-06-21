/**
 * VideoWall Pro — Application Bootstrap & Event Bus
 *
 * This module contains:
 *
 *   EventBus — lightweight publish/subscribe hub.
 *              All inter-module communication flows through App.bus.
 *              No module holds a direct reference to another module.
 *
 *   App       — static application controller.
 *              - Loads preferences from LocalStorage.
 *              - Creates LayoutManager, UIManager, KeyboardManager.
 *              - Creates VideoPlayer instances for each visible cell.
 *              - Handles all cross-module events (audio group, selection,
 *                global actions, settings changes, layout changes).
 *
 * Boot sequence (triggered by onYouTubeIframeAPIReady):
 *   1. App.preferences  ← StorageManager.loadPreferences()
 *   2. Apply theme + preference classes to <html> / <body>
 *   3. Set up event bus listeners
 *   4. new UIManager(preferences)
 *   5. new KeyboardManager()
 *   6. new LayoutManager(...)   ← builds cell DOM, no events emitted
 *   7. App.#createInitialPlayers()  ← creates VideoPlayer for each cell
 *   8. Show first-run toast if needed
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// EventBus
// ═══════════════════════════════════════════════════════════════════════════════

class EventBus {
  /** @private @type {Map<string, Function[]>} */
  #handlers = new Map();

  /**
   * Subscribe to an event.
   * @param {string}   event
   * @param {Function} handler
   * @returns {() => void} Unsubscribe function.
   */
  on(event, handler) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, []);
    this.#handlers.get(event).push(handler);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe a specific handler.
   * @param {string}   event
   * @param {Function} handler
   */
  off(event, handler) {
    const list = this.#handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  /**
   * Emit an event with optional data payload.
   * All handlers are called synchronously. Errors are caught and logged so
   * one bad handler can't break the rest.
   * @param {string} event
   * @param {*}      [data]
   */
  emit(event, data) {
    const list = this.#handlers.get(event);
    if (!list) return;
    // Snapshot to avoid issues if a handler modifies the list.
    [...list].forEach(h => {
      try {
        h(data);
      } catch (err) {
        console.error(`[EventBus] Unhandled error in '${event}' handler:`, err);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// App
// ═══════════════════════════════════════════════════════════════════════════════

class App {
  // ─── Event Bus (global singleton) ──────────────────────────────────────────
  static bus = new EventBus();

  // ─── Player registry ───────────────────────────────────────────────────────
  /** videoId → VideoPlayer */
  static players    = new Map();
  /** cellIndex → VideoPlayer */
  static cellPlayers = new Map();

  // ─── Selection & Audio ─────────────────────────────────────────────────────
  /** @type {VideoPlayer|null} */
  static selectedPlayer = null;
  /** Set of videoIds with active audio */
  static audioGroup = new Set();

  // ─── Playback State ────────────────────────────────────────────────────────
  static isGlobalPlaying = true;

  // ─── Loaded preferences ────────────────────────────────────────────────────
  static preferences = {};

  // ─── Module instances (private) ────────────────────────────────────────────
  static #layout   = null;
  static #ui       = null;
  static #keyboard = null;

  // ───────────────────────────────────────────────────────────────────────────
  // Boot
  // ───────────────────────────────────────────────────────────────────────────

  static init() {
    this.preferences = StorageManager.loadPreferences();

    this.#applyTheme(this.preferences.theme);
    this.#applyPreferenceClasses(this.preferences);

    // Bus listeners must be registered before any module that emits is created.
    this.#registerBusListeners();

    // Instantiate managers in dependency order.
    this.#ui       = new UIManager(this.preferences);
    this.#keyboard = new KeyboardManager();
    this.#layout   = new LayoutManager(
      document.getElementById('grid-container'),
      this.preferences.layout.rows,
      this.preferences.layout.cols,
      this.preferences.order,
    );

    // Create players for all visible cells.
    this.#createInitialPlayers();

    // Topbar direct bindings (UI-independent action triggers).
    this.#bindTopbar();

    // Layout switcher.
    document.getElementById('layout-switcher')
      ?.addEventListener('click', e => {
        const btn = e.target.closest('.layout-btn');
        if (!btn) return;
        const [r, c] = btn.dataset.layout.split('x').map(Number);
        this.#layout.setLayout(r, c);
      });

    // Browser fullscreen exit listener.
    document.addEventListener('fullscreenchange',       () => this.#onFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this.#onFullscreenChange());

    // First-run informational toast.
    if (!StorageManager.get('seen_welcome')) {
      this.#ui.toast(
        'Streams start muted. Click any video to enable audio.',
        'info',
        6000
      );
      StorageManager.set('seen_welcome', true);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Theme & Preference Application
  // ───────────────────────────────────────────────────────────────────────────

  /** @param {string} theme */
  static #applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  /** @param {object} prefs */
  static #applyPreferenceClasses(prefs) {
    document.body.classList.toggle('no-overlays',   !prefs.showOverlays);
    document.body.classList.toggle('no-controls',   !prefs.showControls);
    document.body.classList.toggle('no-animations', !prefs.animations);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Initial Player Creation
  // ───────────────────────────────────────────────────────────────────────────

  static #createInitialPlayers() {
    const order = this.#layout.getOrder();
    const total = this.#layout.totalCells;

    for (let cellIndex = 0; cellIndex < total; cellIndex++) {
      const videoIndex = order[cellIndex];
      const cellEl     = this.#layout.getCell(cellIndex);
      if (!cellEl) continue;

      if (videoIndex < 0 || videoIndex >= VIDEOS.length) {
        // Empty cell — no player needed.
        continue;
      }

      const cfg    = VIDEOS[videoIndex];
      const player = new VideoPlayer(cellEl, cfg, cellIndex, this.preferences.volume);
      this.players.set(cfg.id, player);
      this.cellPlayers.set(cellIndex, player);
    }

    this.#ui.updatePlayerCount(this.players.size);
    this.#ui.updateAudioCount(0);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public Static Helpers (used by VideoPlayer via App.subscribeClock)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to the shared clock tick.
   * Delegated to UIManager which owns the single setInterval.
   *
   * @param {(time: string) => void} callback
   * @returns {() => void} Unsubscribe function.
   */
  static subscribeClock(callback) {
    if (!this.#ui) return () => {};
    return this.#ui.subscribeClock(callback);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Event Bus Listeners
  // ───────────────────────────────────────────────────────────────────────────

  static #registerBusListeners() {
    const { bus } = this;

    // ── Player interaction events ────────────────────────────────────────────
    bus.on('player:click',    ({ player }) => this.#onPlayerClick(player));
    bus.on('player:ctrlClick',({ player }) => this.#onPlayerCtrlClick(player));
    bus.on('player:dblClick', ({ player }) => this.#onPlayerDblClick(player));
    bus.on('player:audioOff', ({ player }) => this.#removeFromAudioGroup(player));
    bus.on('player:ready',    ({ player }) => this.#onPlayerReady(player));
    bus.on('player:error',    ({ player, code, message }) => {
      // Error is already displayed in the cell overlay — just log for debugging.
      console.warn(`[App] player:error  id=${player.id}  code=${code}  ${message}`);
    });

    // ── Layout events ────────────────────────────────────────────────────────
    bus.on('cell:added',   ({ cellIndex, videoIndex, cellEl }) =>
      this.#onCellAdded(cellIndex, videoIndex, cellEl));
    bus.on('cell:removed', ({ cellIndex }) =>
      this.#onCellRemoved(cellIndex));
    bus.on('cell:swap',    ({ from, to }) =>
      this.#onCellSwap(from, to));
    bus.on('layout:changed', ({ rows, cols }) =>
      this.#ui?.updateLayoutButtons(rows, cols));

    // ── Global action events (from KeyboardManager / topbar) ─────────────────
    bus.on('action:muteAll',           () => this.muteAll());
    bus.on('action:solo',              () => this.#soloSelected());
    bus.on('action:playPause',         () => this.#togglePlayPause());
    bus.on('action:fullscreen',        () => this.#fullscreenSelected());
    bus.on('action:reloadAll',         () => this.reloadAll());
    bus.on('action:volumeUp',          () => this.#adjustVolume(10));
    bus.on('action:volumeDown',        () => this.#adjustVolume(-10));
    bus.on('action:seekForward',       () => this.#seekSelected(10));
    bus.on('action:seekBackward',      () => this.#seekSelected(-10));
    bus.on('action:selectByIndex',     ({ index }) => this.#selectByIndex(index));
    bus.on('action:toggleAudioByIndex',({ index }) => this.#toggleAudioByIndex(index));

    // ── Settings change events ───────────────────────────────────────────────
    bus.on('settings:theme', ({ theme }) => {
      this.#applyTheme(theme);
      StorageManager.set('theme', theme);
    });
    bus.on('settings:overlays', ({ visible }) => {
      document.body.classList.toggle('no-overlays', !visible);
      StorageManager.set('showOverlays', visible);
    });
    bus.on('settings:controls', ({ visible }) => {
      document.body.classList.toggle('no-controls', !visible);
      StorageManager.set('showControls', visible);
    });
    bus.on('settings:animations', ({ enabled }) => {
      document.body.classList.toggle('no-animations', !enabled);
      StorageManager.set('animations', enabled);
    });
    bus.on('settings:autoplay', ({ enabled }) => {
      StorageManager.set('autoplay', enabled);
    });
    bus.on('settings:sync', ({ enabled }) => {
      StorageManager.set('syncPlayers', enabled);
    });
    bus.on('settings:volume', ({ volume }) => {
      this.preferences.volume = volume;
      StorageManager.set('volume', volume);
      // Apply to all players that currently have audio.
      this.audioGroup.forEach(id => this.players.get(id)?.setVolume(volume));
    });
    bus.on('settings:layout', ({ rows, cols }) => {
      this.#layout?.setLayout(rows, cols);
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Topbar Bindings
  // ───────────────────────────────────────────────────────────────────────────

  static #bindTopbar() {
    document.getElementById('btn-mute-all')
      ?.addEventListener('click', () => this.muteAll());

    document.getElementById('btn-play-pause')
      ?.addEventListener('click', () => this.#togglePlayPause());

    document.getElementById('btn-reload-all')
      ?.addEventListener('click', () => this.reloadAll());

    document.getElementById('btn-fullscreen')
      ?.addEventListener('click', () => this.#browserFullscreen());
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Player Interaction Handlers
  // ───────────────────────────────────────────────────────────────────────────

  /** @param {VideoPlayer} player */
  static #onPlayerClick(player) {
    this.#selectPlayer(player);
    this.#setExclusiveAudio(player);
  }

  /** @param {VideoPlayer} player */
  static #onPlayerCtrlClick(player) {
    this.#selectPlayer(player);
    this.#toggleAudioGroup(player);
  }

  /** @param {VideoPlayer} player */
  static #onPlayerDblClick(player) {
    player.enterFullscreen();
    StorageManager.set('last_fullscreen', player.id);
  }

  /** @param {VideoPlayer} player */
  static #onPlayerReady(player) {
    // Nothing to do yet — could restore per-player state here if needed.
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cell Lifecycle Handlers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Called when LayoutManager adds a new cell (layout expansion).
   * @param {number}      cellIndex
   * @param {number}      videoIndex
   * @param {HTMLElement} cellEl
   */
  static #onCellAdded(cellIndex, videoIndex, cellEl) {
    if (videoIndex < 0 || videoIndex >= VIDEOS.length) return;

    const cfg    = VIDEOS[videoIndex];
    const player = new VideoPlayer(cellEl, cfg, cellIndex, this.preferences.volume);
    this.players.set(cfg.id, player);
    this.cellPlayers.set(cellIndex, player);
    this.#ui?.updatePlayerCount(this.players.size);
  }

  /**
   * Called when LayoutManager removes a cell (layout shrink).
   * @param {number} cellIndex
   */
  static #onCellRemoved(cellIndex) {
    this.#destroyPlayerAtCell(cellIndex);
    this.#ui?.updatePlayerCount(this.players.size);
    this.#ui?.updateAudioCount(this.audioGroup.size);
  }

  /**
   * Called after drag-and-drop swaps two cells.
   * Destroys both players and recreates them with the new video assignments.
   * @param {number} from
   * @param {number} to
   */
  static #onCellSwap(from, to) {
    // Destroy players in both affected cells.
    this.#destroyPlayerAtCell(from);
    this.#destroyPlayerAtCell(to);

    // Read the new order (already updated by LayoutManager before emitting).
    const order = this.#layout.getOrder();

    const rebuild = (cellIndex) => {
      const videoIndex = order[cellIndex];
      if (videoIndex < 0 || videoIndex >= VIDEOS.length) return;
      const cellEl = this.#layout.getCell(cellIndex);
      if (!cellEl) return;

      const cfg    = VIDEOS[videoIndex];
      const player = new VideoPlayer(cellEl, cfg, cellIndex, this.preferences.volume);
      this.players.set(cfg.id, player);
      this.cellPlayers.set(cellIndex, player);
    };

    rebuild(from);
    rebuild(to);

    this.#ui?.updatePlayerCount(this.players.size);
    this.#ui?.updateAudioCount(this.audioGroup.size);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Selection
  // ───────────────────────────────────────────────────────────────────────────

  /** @param {VideoPlayer} player */
  static #selectPlayer(player) {
    if (this.selectedPlayer && this.selectedPlayer !== player) {
      this.selectedPlayer.setSelected(false);
    }
    this.selectedPlayer = player;
    player.setSelected(true);
  }

  /** @param {number} index  0-based visual index */
  static #selectByIndex(index) {
    const players = [...this.players.values()];
    if (index >= 0 && index < players.length) {
      this.#selectPlayer(players[index]);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Audio Group Management
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Give exclusive audio to one player (mute all others).
   * @param {VideoPlayer} player
   */
  static #setExclusiveAudio(player) {
    this.players.forEach(p => p.setAudio(false));
    this.audioGroup.clear();

    player.setAudio(true);
    this.audioGroup.add(player.id);

    this.#ui?.updateAudioCount(this.audioGroup.size);
    StorageManager.set('audio_group', [player.id]);
  }

  /** @param {VideoPlayer} player */
  static #toggleAudioGroup(player) {
    if (this.audioGroup.has(player.id)) {
      this.#removeFromAudioGroup(player);
    } else {
      this.#addToAudioGroup(player);
    }
  }

  /** @param {VideoPlayer} player */
  static #addToAudioGroup(player) {
    player.setAudio(true);
    this.audioGroup.add(player.id);
    this.#ui?.updateAudioCount(this.audioGroup.size);
    StorageManager.set('audio_group', [...this.audioGroup]);
  }

  /** @param {VideoPlayer} player */
  static #removeFromAudioGroup(player) {
    player.setAudio(false);
    this.audioGroup.delete(player.id);
    this.#ui?.updateAudioCount(this.audioGroup.size);
    StorageManager.set('audio_group', [...this.audioGroup]);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Global Actions
  // ───────────────────────────────────────────────────────────────────────────

  /** Mute all players and clear the audio group. */
  static muteAll() {
    this.players.forEach(p => p.setAudio(false));
    this.audioGroup.clear();
    this.#ui?.updateAudioCount(0);
    this.#ui?.toast('All streams muted', 'info', 2000);
    StorageManager.set('audio_group', []);
  }

  /** Give exclusive audio to the currently selected player. */
  static #soloSelected() {
    if (!this.selectedPlayer) {
      this.#ui?.toast('No stream selected — press 1–9 to select', 'info');
      return;
    }
    this.#setExclusiveAudio(this.selectedPlayer);
    this.#ui?.toast(`Solo: ${this.selectedPlayer.title}`, 'info', 2000);
  }

  /** Toggle play/pause for all loaded players. */
  static #togglePlayPause() {
    this.isGlobalPlaying = !this.isGlobalPlaying;
    this.players.forEach(p => this.isGlobalPlaying ? p.play() : p.pause());
    this.#ui?.updatePlayPauseButton(this.isGlobalPlaying);
  }

  /** Reload all players. */
  static reloadAll() {
    this.players.forEach(p => p.reload());
    this.#ui?.toast('Reloading all streams…', 'info', 2000);
  }

  /**
   * Fullscreen the selected player, or fall back to browser fullscreen.
   */
  static #fullscreenSelected() {
    if (this.selectedPlayer) {
      this.selectedPlayer.enterFullscreen();
    } else {
      this.#browserFullscreen();
    }
  }

  /** Toggle browser-level fullscreen (the entire app). */
  static #browserFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
    } else {
      (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el);
    }
  }

  /**
   * Adjust volume for the selected player (or all audible players if none selected).
   * @param {number} delta  +10 or −10
   */
  static #adjustVolume(delta) {
    if (this.selectedPlayer) {
      this.selectedPlayer.adjustVolume(delta);
      this.#ui?.toast(`Volume: ${this.selectedPlayer.volume}%`, 'info', 1500);
    } else {
      // Apply to all audible players.
      this.audioGroup.forEach(id => this.players.get(id)?.adjustVolume(delta));
    }
  }

  /**
   * Seek the selected player.
   * @param {number} seconds
   */
  static #seekSelected(seconds) {
    this.selectedPlayer?.seekBy(seconds);
  }

  /**
   * Toggle audio for the player at a given visual index (0-based).
   * @param {number} index
   */
  static #toggleAudioByIndex(index) {
    const players = [...this.players.values()];
    if (index >= 0 && index < players.length) {
      this.#toggleAudioGroup(players[index]);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Fullscreen Change
  // ───────────────────────────────────────────────────────────────────────────

  static #onFullscreenChange() {
    const fsEl = document.fullscreenElement ?? document.webkitFullscreenElement;
    if (!fsEl) {
      StorageManager.remove('last_fullscreen');
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Destroy the VideoPlayer at the given cell index, removing it from all
   * registries. Cleans up audio group and selection as needed.
   * @param {number} cellIndex
   */
  static #destroyPlayerAtCell(cellIndex) {
    const player = this.cellPlayers.get(cellIndex);
    if (!player) return;

    this.audioGroup.delete(player.id);
    if (this.selectedPlayer === player) {
      this.selectedPlayer = null;
    }

    player.destroy();
    this.players.delete(player.id);
    this.cellPlayers.delete(cellIndex);
  }
}

// ─── Entry Point ───────────────────────────────────────────────────────────────
// Boot the application once the YouTube IFrame API is ready.
// YouTubeManager.load() was already called in youtube.js.
YouTubeManager.whenReady(() => App.init());
