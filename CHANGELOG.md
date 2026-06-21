# Changelog

All notable changes to VideoWall Pro are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.1] — 2026-06-17

### Fixed

- **`youtube.js`** — Removed `loop: 1`, `playlist: videoId`, `color: 'white'`, and
  `start: 0` from `playerVars`. The `loop + playlist` combination triggers YouTube
  **error code 5** (HTML5 player error) on live stream video IDs, causing all cells
  to show "Stream Unavailable".  
  Loop behaviour for VOD videos is now handled manually in
  `VideoPlayer.#onPlayerStateChange` via `seekTo(0) + playVideo()`.

- **`player.js`** — Added auto-retry logic for **error code 5**: retries up to 3 times
  with a 2.5 s delay before showing the error state, to handle transient HTML5 errors.

- **`player.js`** — Fixed `ENDED` state handler: for VOD videos, checks `getDuration()`
  to confirm it's not a live stream before seeking back to 0 and replaying.

- **`player.js`** — `destroy()` now cancels any pending retry `setTimeout` to prevent
  callbacks firing on already-destroyed player instances.

---

## [1.0.0] — 2026-06-17

### Added

#### Core
- Initial production release of VideoWall Pro.
- Pure HTML5 + CSS3 + JavaScript ES2023 — zero build tools, zero npm dependencies.
- YouTube IFrame API integration with broadcast-appropriate player parameters
  (`controls=0`, `rel=0`, `modestbranding=1`, `loop=1`, `playlist=videoId`,
  `disablekb=1`, `iv_load_policy=3`, `fs=0`, `playsinline=1`).

#### Layout Engine
- CSS Grid-based layout with 7 presets: 1×1, 2×2, 2×3, 3×3, 4×4, 5×5, 6×6.
- Dynamic layout switching without page reload.
- Incremental cell creation/destruction on layout change (only delta cells affected).
- HTML5 Drag-and-Drop reordering with iframe-safe pointer-event suppression.
- Persistent cell order (`localStorage`).

#### Audio Control
- Click → exclusive audio (all others muted).
- Ctrl+Click → additive audio group membership toggle.
- Visual indicator: cyan border glow + 🔊 icon in overlay.
- Audio state persisted across sessions.

#### Broadcast Overlay
- Per-cell CAM label, pulsing LIVE badge, channel name, live wall clock.
- Single shared `setInterval` for all overlay clocks (performance optimisation).
- Overlay fades out on hover; hover controls fade in (smooth CSS transition).

#### Hover Controls
- Replaces overlay while mouse is over a cell.
- Controls: Play, Pause, Toggle Audio, Fullscreen, Reload.
- Per-cell volume slider.

#### Keyboard Shortcuts
- `1–9`: Select stream.
- `Ctrl+1–9`: Toggle audio for stream.
- `M`: Mute all.
- `S`: Solo selected.
- `P`: Play/Pause all.
- `F`: Fullscreen selected.
- `R`: Reload all.
- `+`/`-`: Volume ±10%.
- `←`/`→`: Seek ±10 s.
- `Esc`: Close settings panel.

#### Themes
- Dark (default), Light, OLED, Broadcast.
- Implemented entirely with CSS custom properties on `[data-theme]`.
- Live switching without page reload.

#### Settings Panel
- Slide-in sidebar with backdrop.
- Controls: theme, overlays toggle, hover-controls toggle, animations toggle,
  autoplay toggle, default volume, sync toggle, custom rows/cols.
- Keyboard shortcut reference.

#### Persistence (LocalStorage)
- Theme, layout, order, volume, overlay/control/animation prefs.
- Audio group state.
- Last fullscreened stream.
- First-run welcome toast flag.

#### Performance
- Single setInterval for all overlay clocks.
- `pointer-events: none` on iframes during drag (CSS class toggle).
- `will-change: transform` on animated elements.
- No per-player timers.
- Clean destroy() on all player instances (no memory leaks).

#### Accessibility
- ARIA roles and labels on all interactive elements.
- `aria-live` on status bar and toast container.
- `aria-hidden` on decorative overlays.
- Focus-visible outlines preserved.

#### Documentation
- `README.md` — features, quickstart, configuration, architecture, keyboard/mouse reference.
- `ARCHITECTURE.md` — detailed technical design.
- `TODO.md` — task tracker (development use).
- `DEVLOG.md` — development notes and decisions.
- `CHANGELOG.md` — this file.

---

*Older versions: this is the initial release.*
