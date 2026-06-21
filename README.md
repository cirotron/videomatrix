# VideoWall Pro

> Professional broadcast-grade multiview YouTube monitor.  
> Pure **HTML5 · CSS3 · JavaScript ES2023** — no frameworks, no build tools, no dependencies beyond the YouTube IFrame API.

---

## ✨ Features

| Feature | Detail |
|---|---|
| **Multi-stream grid** | Watch 1 to 36 YouTube streams simultaneously |
| **7 layout presets** | 1×1, 2×2, 2×3 (default), 3×3, 4×4, 5×5, 6×6 — switch instantly without reload |
| **Broadcast overlay** | Per-cell CAM label, pulsing LIVE badge, audio icon, channel name, live wall clock |
| **Hover controls** | Play, Pause, Mute/Unmute, Fullscreen, Reload, Volume slider — replace overlay on hover |
| **Click audio model** | Click → exclusive audio; Ctrl+Click → add/remove from audio group |
| **Drag & Drop** | Reorder cells freely; order persisted across sessions |
| **Fullscreen** | Double-click or F key — fullscreen on the cell, not just the iframe |
| **Keyboard shortcuts** | Full keyboard control (see table below) |
| **4 themes** | Dark, Light, OLED, Broadcast — switched live, persisted |
| **LocalStorage** | Layout, order, volume, theme, overlays preference all persist |
| **Settings panel** | Sidebar with all configuration options |
| **Zero install** | Open `index.html` in any modern browser — that's it |

---

## 🚀 Quick Start

1. **Clone / download** this repository.
2. Open `index.html` in Chrome, Firefox, Edge, or Safari.
3. Done. All 9 configured streams begin loading automatically.

> **Note on autoplay:** Browsers require user interaction before allowing audio.  
> All streams start **muted**. Click any video to enable audio for that stream.

### Hosting on a local server (optional, for full IFrame API features)

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# Then open: http://localhost:8080
```

---

## ⚙️ Configuration

Edit **`js/config.js`** — the **only** file you need to touch.

### Changing videos

```javascript
const VIDEOS = [
  { id: 'v1', title: 'Camera 1', youtubeId: 'YOUTUBE_VIDEO_ID', channel: 'Channel Name' },
  // ... add or remove entries freely
];
```

`youtubeId` is the `v=` parameter from any YouTube URL.  
Example: `https://www.youtube.com/watch?v=dQw4w9WgXcQ` → `dQw4w9WgXcQ`

### Changing defaults

```javascript
const APP_CONFIG = {
  defaultLayout:  { rows: 2, cols: 3 }, // Initial grid
  defaultVolume:  80,                    // 0–100
  defaultTheme:   'dark',               // 'dark' | 'light' | 'oled' | 'broadcast'
  showOverlays:   true,
  showControls:   true,
  animations:     true,
  autoplay:       true,
  syncPlayers:    false,
};
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `1` – `9` | Select stream by visual position |
| `Ctrl` + `1`–`9` | Toggle audio for stream by position |
| `M` | Mute all streams |
| `S` | Solo — give exclusive audio to selected stream |
| `P` | Play / Pause all streams |
| `F` | Fullscreen selected stream (or browser fullscreen if none selected) |
| `R` | Reload all streams |
| `+` / `=` | Volume +10% |
| `-` | Volume −10% |
| `→` | Seek forward 10 s |
| `←` | Seek backward 10 s |
| `Esc` | Close settings panel |

---

## 🖱️ Mouse Interactions

| Interaction | Action |
|---|---|
| **Click** | Select stream + exclusive audio |
| **Ctrl + Click** | Add/remove stream from audio group |
| **Double click** | Fullscreen that stream |
| **Hover** | Show hover controls (replaces broadcast overlay) |
| **Drag** | Reorder streams within the grid |

---

## 🎨 Themes

Switch in Settings → Appearance → Theme, or via the dropdown.

| Theme | Palette |
|---|---|
| **Dark** (default) | Deep charcoal backgrounds, cyan `#00d4ff` accent |
| **Light** | White/grey surfaces, navy `#0062cc` accent |
| **OLED** | Pure `#000000` black, mint `#00ffcc` accent — maximum contrast |
| **Broadcast** | Green-phosphor monitor aesthetic (`#00ff44` on `#000600`) |

---

## 🏗️ Architecture

```
index.html            HTML shell — loads scripts, defines static structure
│
├── css/style.css     All styles: 4 themes, grid, overlays, animations
│
└── js/
    ├── config.js     VIDEOS array + APP_CONFIG defaults  ← only file to edit
    ├── storage.js    StorageManager — namespaced localStorage abstraction
    ├── youtube.js    YouTubeManager — API loading, player factory
    ├── player.js     VideoPlayer — per-cell class (DOM + YT player + state)
    ├── layout.js     LayoutManager — CSS Grid + drag-and-drop + order array
    ├── keyboard.js   KeyboardManager — key → App.bus.emit()
    ├── ui.js         UIManager — settings panel, toasts, clock, status bar
    └── app.js        EventBus + App — central controller, boot sequence
```

No `assets/` directory required — all resources load from CDN or are generated in-memory.

### Data flow

```
User Interaction
      │
      ▼
KeyboardManager / VideoPlayer / UIManager
      │
      │  emit(event, data)
      ▼
   App.bus  (EventBus)
      │
      │  on(event, handler)
      ▼
    App  (static controller)
      │
      ├── VideoPlayer.setAudio() / play() / pause() ...
      ├── LayoutManager.setLayout()
      └── UIManager.toast() / updateAudioCount() ...
```

### Module responsibilities

| Module | Owns |
|---|---|
| `config.js` | Data only — no behaviour |
| `storage.js` | Read/write LocalStorage, merge defaults |
| `youtube.js` | API script injection, `YT.Player` creation |
| `player.js` | One per visible video: iframe, overlay, controls, state |
| `layout.js` | Grid DOM, drag-and-drop, order array |
| `keyboard.js` | Global `keydown` → named bus events |
| `ui.js` | Settings panel, theme, toasts, shared clock tick |
| `app.js` | EventBus singleton, boot, cross-module coordination |

---

## 🔊 Audio Model

```
Click any cell  →  that cell gets exclusive audio
                   (all others are muted)

Ctrl+Click      →  toggle that cell in/out of the "audio group"
                   (multiple cells can have audio simultaneously)

M key           →  mute all, clear audio group

S key           →  solo selected cell (same as click)
```

Audio state is shown visually:
- **Cyan border glow** around cells with active audio
- **🔊 icon** in the broadcast overlay

---

## 💾 Persisted State

Stored in `localStorage` under the `videowall_pro_` prefix.

| Key | Value |
|---|---|
| `layout` | `{ rows, cols }` |
| `layout_order` | `number[]` mapping cell index → video index |
| `theme` | `'dark' \| 'light' \| 'oled' \| 'broadcast'` |
| `volume` | `0–100` |
| `showOverlays` | `boolean` |
| `showControls` | `boolean` |
| `animations` | `boolean` |
| `audio_group` | `string[]` of videoIds with active audio |
| `last_fullscreen` | last fullscreened videoId |
| `seen_welcome` | `true` once first-run toast has been shown |

To reset all settings: open DevTools → Application → Local Storage → delete all `videowall_pro_*` keys, then reload.

---

## 🌐 Browser Compatibility

| Browser | Status |
|---|---|
| Chrome 90+ | ✅ Full support |
| Firefox 90+ | ✅ Full support |
| Edge 90+ | ✅ Full support |
| Safari 15+ | ✅ Full support (some fullscreen API differences handled) |
| Mobile Chrome | ✅ Responsive layout, limited drag-and-drop |
| Mobile Safari | ✅ `playsinline` enabled |

---

## ⚠️ Known Limitations

- **Autoplay policy:** All streams start muted. The first click enables audio.
- **Embedding restrictions:** Some YouTube videos have embedding disabled by their owners. Affected cells show a "Stream Unavailable" error overlay.
- **Seek on live streams:** Seeking is silently ignored on live streams (they have no seekable range).
- **`file://` protocol:** The YouTube IFrame API works over `file://` but some postMessage events may be blocked. For full functionality, serve via localhost.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

*Built with ❤️ as a fully self-contained, production-ready vanilla JS application.*
