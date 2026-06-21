# VideoWall Pro — TODO

Backlog of improvements and future features for post-v1.0 development.

---

## 🐛 Bug Fixes / Known Issues

- [ ] **Mobile drag-and-drop:** HTML5 D&D API does not fire touch events.
      Implement a Pointer Events API fallback (`pointerdown`, `pointermove`, `pointerup`)
      for mobile cell reordering.

- [ ] **Safari `file://`:** Verify that `onYouTubeIframeAPIReady` callback fires correctly
      in Safari when loaded from `file://`. May require `<script async>` ordering adjustment.

- [ ] **Large grid performance (5×5, 6×6):** Implement idle-state pausing for cells
      that are scrolled out of view (use IntersectionObserver).

---

## ✨ Feature Requests

### Audio
- [ ] **Per-player volume persistence** — save each player's last volume to localStorage.
- [ ] **Audio visualiser** — show a simple waveform or level meter in the overlay
      (Web Audio API, AnalyserNode). Requires CORS-enabled audio source.

### Layout
- [ ] **Picture-in-Picture** — promote one cell to a floating mini-player on top.
- [ ] **Custom grid (non-square)** — e.g., one large cell + 4 small cells (PiP layout).
- [ ] **Named layouts** — save/restore named layout+order presets.

### Streams
- [ ] **Runtime video swap** — right-click a cell to change its video without reloading
      the whole layout (change `youtubeId` in order and reload only that player).
- [ ] **Search & add** — inline YouTube search to add videos without editing `config.js`.

### Sync
- [ ] **Player sync** — implement the `syncPlayers` setting: poll `getCurrentTime()`
      on all players every 2 seconds and `seekTo()` to a common position (VOD only).

### UI
- [ ] **Grid gap control** — expose `--cell-gap` value in settings panel.
- [ ] **Cell labels** — allow users to rename the CAM label per cell.
- [ ] **Screenshot** — capture a PNG of the current grid (html2canvas or CSS Print).

### Performance
- [ ] **IntersectionObserver lazy-loading** — pause / destroy players for cells
      that are not visible (relevant for large grids when `totalCells > VIDEOS.length`
      but all cells are filled with videos).

---

## 🔧 Technical Debt

- [ ] **Touch drag-and-drop** — implement Pointer Events fallback.
- [ ] **Unit tests** — add tests for `StorageManager`, `EventBus`, `LayoutManager`
      (can run in Node.js with a minimal DOM shim or in browser via a test runner).
- [ ] **E2E tests** — automate verification checklist with Playwright.
- [ ] **Progressive enhancement** — degrade gracefully when `localStorage` is unavailable
      (private/incognito browsing on some browsers throws SecurityError on set).

---

## 📦 Distribution

- [ ] **Single-file build** — optional: concatenate + minify all JS/CSS into one HTML file
      for maximum portability (no web server needed at all).
- [ ] **Docker image** — serve via nginx in a container with a one-line `docker run`.
- [ ] **GitHub Pages** — publish a live demo.

---

*Items are not prioritised. Add estimated effort and priority as needed.*
