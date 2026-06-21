# Architecture — VideoWall Pro

Technical reference for the system design of VideoWall Pro.

---

## High-Level Overview

VideoWall Pro is a **client-side, single-page application** with no server component,
no build process, and no runtime dependencies beyond the YouTube IFrame API.

All source files are loaded as classic (non-module) `<script>` tags in `index.html`.
Class declarations in each file are globally scoped; the load order in `index.html`
determines the dependency resolution order.

---

## Boot Sequence

```
Browser parses index.html
    │
    ├── Loads fonts from Google Fonts (async, non-blocking)
    ├── Loads css/style.css
    │
    └── Loads scripts in order:
          config.js   → VIDEOS[], APP_CONFIG available globally
          storage.js  → StorageManager class defined
          youtube.js  → YouTubeManager class defined
                        window.onYouTubeIframeAPIReady defined
                        YouTubeManager.load() called → injects YT API <script>
          player.js   → VideoPlayer class defined
          layout.js   → LayoutManager class defined
          keyboard.js → KeyboardManager class defined
          ui.js       → UIManager class defined
          app.js      → EventBus class defined
                        App class defined
                        YouTubeManager.whenReady(() => App.init()) registered

    YouTube IFrame API script loads asynchronously
          │
          └── window.onYouTubeIframeAPIReady() fires
                → YouTubeManager._onAPIReady() called
                → App.init() called
                      │
                      ├── StorageManager.loadPreferences()
                      ├── Apply theme to <html data-theme>
                      ├── Apply preference classes to <body>
                      ├── App.#registerBusListeners()
                      ├── new UIManager(preferences)    ← starts clock
                      ├── new KeyboardManager()
                      ├── new LayoutManager(...)        ← builds .cell DOM
                      ├── App.#createInitialPlayers()   ← new VideoPlayer(...)
                      └── First-run toast (if needed)
```

---

## Module Dependency Graph

```
config.js ──────────────────────────────────────────┐
                                                     │ (global VIDEOS, APP_CONFIG)
storage.js ─────────────────────────────────────────┤
                                                     │ (global StorageManager)
youtube.js ─────────────────────────────────────────┤
                                                     │ (global YouTubeManager, YT.Player)
player.js ──────────────────────────────────────────┤
           ↑ uses: App.bus, App.subscribeClock,      │ (global VideoPlayer)
                   YouTubeManager.whenReady/create   │
                                                     │
layout.js ──────────────────────────────────────────┤
           ↑ uses: App.bus, StorageManager, VIDEOS   │ (global LayoutManager)
                                                     │
keyboard.js ────────────────────────────────────────┤
           ↑ uses: App.bus                           │ (global KeyboardManager)
                                                     │
ui.js ──────────────────────────────────────────────┤
           ↑ uses: App.bus, StorageManager           │ (global UIManager)
                                                     │
app.js ─────────────────────────────────────────────┘
           owns: EventBus, App
           coordinates: all above modules
```

No circular dependencies. All references to `App.bus` are resolved at runtime
(when handlers are called), not at class-definition time.

---

## EventBus Contract

`App.bus` is an `EventBus` instance. It is a plain publish/subscribe hub.

### Event Naming Convention

| Prefix | Emitter | Meaning |
|---|---|---|
| `player:*` | VideoPlayer | Player-level events |
| `cell:*` | LayoutManager | Grid cell lifecycle |
| `layout:*` | LayoutManager | Layout dimension changes |
| `action:*` | KeyboardManager | User-triggered global actions |
| `settings:*` | UIManager | Settings panel changes |

### Full Event Catalogue

**Player events (emitted by VideoPlayer, handled by App)**
```
player:click       { player: VideoPlayer }  — cell click
player:ctrlClick   { player: VideoPlayer }  — ctrl+click
player:dblClick    { player: VideoPlayer }  — double-click
player:audioOff    { player: VideoPlayer }  — mute button in hover controls
player:ready       { player: VideoPlayer }  — YT.Player onReady fired
player:error       { player, code, message }
player:stateChange { player, state: YT.PlayerState }
```

**Cell lifecycle (emitted by LayoutManager, handled by App)**
```
cell:added    { cellIndex, videoIndex, cellEl }  — layout expanded
cell:removed  { cellIndex, videoIndex }           — layout shrunk
cell:swap     { from, to, order }                 — drag-and-drop completed
```

**Layout events (emitted by LayoutManager, handled by App + UIManager)**
```
layout:changed  { rows, cols, order }
```

**Action events (emitted by KeyboardManager, handled by App)**
```
action:muteAll
action:solo
action:playPause
action:fullscreen
action:reloadAll
action:volumeUp
action:volumeDown
action:seekForward
action:seekBackward
action:selectByIndex      { index }
action:toggleAudioByIndex { index }
action:escape
```

**Settings events (emitted by UIManager, handled by App)**
```
settings:theme      { theme }
settings:overlays   { visible }
settings:controls   { visible }
settings:animations { enabled }
settings:autoplay   { enabled }
settings:sync       { enabled }
settings:volume     { volume }
settings:layout     { rows, cols }
```

---

## State Management

All mutable application state lives in static fields on the `App` class:

| Field | Type | Description |
|---|---|---|
| `App.players` | `Map<videoId, VideoPlayer>` | All active players |
| `App.cellPlayers` | `Map<cellIndex, VideoPlayer>` | Cell → player mapping |
| `App.selectedPlayer` | `VideoPlayer \| null` | Currently selected |
| `App.audioGroup` | `Set<videoId>` | Players with active audio |
| `App.isGlobalPlaying` | `boolean` | Global play/pause state |
| `App.preferences` | `object` | Loaded from LocalStorage |

`VideoPlayer` instances manage their own local state:
- `#muted`, `#volume`, `#hasAudio`, `#isSelected`, `#isPlaying`

---

## CSS Architecture

All visual variation is controlled by **CSS custom properties** defined on
`:root` and overridden per `[data-theme]`. No CSS is duplicated across themes.

Global state is expressed through body classes:

| Class | Effect |
|---|---|
| `no-overlays` | Hides `.overlay` on all cells |
| `no-controls` | Hides `.hover-controls` on all cells |
| `no-animations` | Sets all animation/transition durations to 0.001ms |
| `dragging-active` | Sets `pointer-events: none` on all iframes |

Cell state is expressed through cell classes:

| Class | Effect |
|---|---|
| `selected` | Cyan/accent border glow |
| `has-audio` | Accent border glow + audio icon visible |
| `dragging` | 45% opacity |
| `drag-over` | Dashed accent border, tinted background |
| `empty` | Dashed border, `—` placeholder |
| `error-state` | Error border + "Stream Unavailable" ::after content |

---

## Performance Notes

- **One `setInterval` for N overlay clocks.** `UIManager` owns a 1-second interval.
  VideoPlayers subscribe via `App.subscribeClock()` and get an unsubscribe handle.

- **No per-player timers.** Other than the shared clock, no recurring timers.

- **`pointer-events: none` during drag.** A CSS class toggle on `<body>` disables
  pointer events on all YouTube iframes during drag operations, preventing event
  capture by cross-origin iframes.

- **Incremental layout changes.** `LayoutManager.setLayout()` only creates/destroys
  the *delta* cells, not the entire grid. Unchanged cells and their players are untouched.

- **`will-change` applied selectively.** Only on elements with known GPU-accelerated
  transitions (cell borders, control button transforms).

- **No layout thrashing.** `LayoutManager` applies grid CSS via `style.gridTemplateColumns`
  and `style.gridTemplateRows` — single writes per layout change, no reads interleaved.

---

## Security Notes

- No user-provided HTML is ever inserted via `innerHTML` without sanitisation.
  The only `innerHTML = ''` usage is to clear cell contents before rebuilding — not
  to insert arbitrary content.
- `YouTubeManager` creates `<script>` tags pointing only to `youtube.com/iframe_api`.
- `StorageManager` uses `JSON.parse` in a try/catch, safely handling malformed data.
- No network requests are made other than YouTube IFrame API and Google Fonts.
