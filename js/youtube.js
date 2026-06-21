/**
 * VideoWall Pro — YouTube IFrame API Manager
 *
 * Responsibilities:
 *   1. Dynamically inject the YouTube IFrame API <script> tag.
 *   2. Accept callbacks that need to run once the API is ready.
 *   3. Create YT.Player instances with standardised, broadcast-appropriate
 *      player variables (no controls, no related videos, looping, HD quality).
 *
 * Usage:
 *   YouTubeManager.whenReady(() => { ... });
 *   // YouTubeManager.load() is called automatically when this file is parsed.
 */

'use strict';

class YouTubeManager {
  /** @private — true once onYouTubeIframeAPIReady fires */
  static _ready = false;

  /** @private — callbacks waiting for the API */
  static _queue = [];

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Inject the YouTube IFrame API script.
   * Safe to call multiple times (idempotent check via flag).
   */
  static load() {
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    const first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(tag, first);
  }

  /**
   * Execute a callback as soon as the API is available.
   * If already ready, fires synchronously.
   *
   * @param {() => void} callback
   */
  static whenReady(callback) {
    if (this._ready) {
      callback();
    } else {
      this._queue.push(callback);
    }
  }

  /**
   * Create a YouTube player with VideoWall-standard parameters.
   *
   * @param {string} elementId   ID of the placeholder div to replace.
   * @param {string} videoId     YouTube video ID.
   * @param {number} volume      Initial volume (0–100). Player starts muted regardless.
   * @param {{
   *   onReady: Function,
   *   onStateChange: Function,
   *   onError: Function
   * }} events
   * @returns {YT.Player}
   */
  static createPlayer(elementId, videoId, volume, events) {
    return new YT.Player(elementId, {
      videoId,
      width:  '100%',
      height: '100%',
      playerVars: {
        autoplay:       1,   // Start playing immediately
        mute:           1,   // Start muted (browser autoplay policy)
        controls:       0,   // No native YouTube controls
        rel:            0,   // No related videos at end
        modestbranding: 1,   // Minimal YouTube branding
        playsinline:    1,   // Inline playback on iOS
        enablejsapi:    1,   // Required for JS control
        iv_load_policy: 3,   // No video annotations
        fs:             0,   // Disable native fullscreen button
        disablekb:      1,   // Disable YouTube keyboard shortcuts
        // NOTE: loop=1 requires playlist=videoId per YouTube API spec,
        // but that combination triggers error 5 on live streams.
        // Loop / restart is handled manually in VideoPlayer.#onPlayerStateChange.
      },
      events,
    });
  }


  // ─── Internal ──────────────────────────────────────────────────────────────

  /**
   * Called by the global onYouTubeIframeAPIReady hook.
   * Drains the callback queue.
   */
  static _onAPIReady() {
    this._ready = true;
    const queue = this._queue.splice(0);
    queue.forEach(cb => {
      try {
        cb();
      } catch (err) {
        console.error('[YouTubeManager] Queue callback threw:', err);
      }
    });
  }
}

/**
 * Global callback required by the YouTube IFrame API.
 * Must be assigned to window before the API script finishes loading.
 */
window.onYouTubeIframeAPIReady = () => YouTubeManager._onAPIReady();

// Begin loading the API immediately when this file is parsed.
YouTubeManager.load();
