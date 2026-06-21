/**
 * VideoWall Pro — Keyboard Manager
 *
 * Maps keyboard events to named actions dispatched via App.bus.
 * All logic is decoupled — this class only translates keys to events.
 *
 * Shortcuts:
 *   1–9             Select video by visual index
 *   Ctrl/⌘ + 1–9   Toggle audio for video by visual index
 *   M               Mute all
 *   S               Solo selected
 *   P               Play / Pause all
 *   F               Fullscreen selected (or browser fullscreen)
 *   R               Reload all streams
 *   + / =           Volume up  (+10)
 *   -               Volume down (−10)
 *   Arrow Right     Seek forward  +10 s
 *   Arrow Left      Seek backward −10 s
 *   Escape          Close settings panel / exit fullscreen
 */

'use strict';

class KeyboardManager {
  /** @private */
  #boundHandler;

  constructor() {
    this.#boundHandler = this.#handleKeyDown.bind(this);
    document.addEventListener('keydown', this.#boundHandler, { passive: false });
  }

  // ─── Event Handler ─────────────────────────────────────────────────────────

  /**
   * @param {KeyboardEvent} e
   */
  #handleKeyDown(e) {
    // Do not intercept keyboard events when the user is typing in a form field.
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    // ── Number keys 1–9 ─────────────────────────────────────────────────────
    const digitMatch = e.code.match(/^Digit([1-9])$/);
    if (digitMatch) {
      const index = parseInt(digitMatch[1], 10) - 1; // 0-based
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        App.bus.emit('action:toggleAudioByIndex', { index });
      } else if (!e.altKey) {
        App.bus.emit('action:selectByIndex', { index });
      }
      return;
    }

    // ── Single-key shortcuts (no Ctrl/Alt/Meta) ──────────────────────────────
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.code) {
      case 'KeyM':
        App.bus.emit('action:muteAll');
        break;

      case 'KeyS':
        App.bus.emit('action:solo');
        break;

      case 'KeyP':
        App.bus.emit('action:playPause');
        break;

      case 'KeyF':
        e.preventDefault();
        App.bus.emit('action:fullscreen');
        break;

      case 'KeyR':
        App.bus.emit('action:reloadAll');
        break;

      case 'Equal':        // + on most keyboards (unshifted =)
      case 'NumpadAdd':
        e.preventDefault();
        App.bus.emit('action:volumeUp');
        break;

      case 'Minus':
      case 'NumpadSubtract':
        e.preventDefault();
        App.bus.emit('action:volumeDown');
        break;

      case 'ArrowRight':
        e.preventDefault();
        App.bus.emit('action:seekForward');
        break;

      case 'ArrowLeft':
        e.preventDefault();
        App.bus.emit('action:seekBackward');
        break;

      case 'Escape':
        App.bus.emit('action:escape');
        break;

      default:
        break;
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Remove the global event listener.
   * Call this if the app is ever torn down programmatically.
   */
  destroy() {
    document.removeEventListener('keydown', this.#boundHandler);
  }
}
