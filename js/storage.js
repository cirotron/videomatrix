/**
 * VideoWall Pro — Storage Manager
 *
 * Static class that wraps all localStorage access with:
 *   - Namespaced keys (no collisions with other apps)
 *   - Safe JSON serialisation / deserialisation
 *   - Graceful handling of QuotaExceededError and SecurityError
 *   - Convenience method to load all preferences with defaults
 */

'use strict';

class StorageManager {
  /** @private */
  static #PREFIX = 'videowall_pro_';

  // ─── Core API ──────────────────────────────────────────────────────────────

  /**
   * Retrieve a stored value.
   * @param {string} key
   * @param {*} [defaultValue=null]
   * @returns {*}
   */
  static get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(this.#PREFIX + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Persist a value.
   * @param {string} key
   * @param {*} value  Must be JSON-serialisable.
   * @returns {boolean} true on success, false on quota/security error.
   */
  static set(key, value) {
    try {
      localStorage.setItem(this.#PREFIX + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`[Storage] Failed to write "${key}":`, err.message);
      return false;
    }
  }

  /**
   * Remove a single key.
   * @param {string} key
   */
  static remove(key) {
    localStorage.removeItem(this.#PREFIX + key);
  }

  /**
   * Remove all VideoWall-owned keys from localStorage.
   */
  static clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(this.#PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }

  // ─── Convenience ───────────────────────────────────────────────────────────

  /**
   * Load all user preferences, merging stored values over APP_CONFIG defaults.
   * Safe to call before any saves have been made.
   *
   * @returns {{
   *   theme: string,
   *   layout: {rows: number, cols: number},
   *   volume: number,
   *   showOverlays: boolean,
   *   showControls: boolean,
   *   animations: boolean,
   *   autoplay: boolean,
   *   syncPlayers: boolean,
   *   order: number[]|null,
   *   lastFullscreenId: string|null
   * }}
   */
  static loadPreferences() {
    return {
      theme:           this.get('theme',        APP_CONFIG.defaultTheme),
      layout:          this.get('layout',       APP_CONFIG.defaultLayout),
      volume:          this.get('volume',       APP_CONFIG.defaultVolume),
      showOverlays:    this.get('showOverlays', APP_CONFIG.showOverlays),
      showControls:    this.get('showControls', APP_CONFIG.showControls),
      animations:      this.get('animations',  APP_CONFIG.animations),
      autoplay:        this.get('autoplay',     APP_CONFIG.autoplay),
      syncPlayers:     this.get('syncPlayers',  APP_CONFIG.syncPlayers),
      order:           this.get('layout_order', null),
      lastFullscreenId: this.get('last_fullscreen', null),
    };
  }

  /**
   * Persist a single named preference (type-safe wrapper).
   * @param {string} key
   * @param {*} value
   */
  static savePreference(key, value) {
    this.set(key, value);
  }
}
