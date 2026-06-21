# Development Log — VideoWall Pro

Chronological record of technical decisions, discoveries, and notes during development.

---

## 2026-06-17 — Initial Build

### Session 1 — Architecture & Planning

**Decision: Event Bus pattern**  
All modules communicate through `App.bus` (an `EventBus` instance on the static `App` class).
No module holds a direct reference to another module. This avoids circular dependencies,
makes each module independently testable, and prevents accidental coupling.

**Decision: Static `App` class**  
Since this is a single-page application with a single global state, a static class
is the cleanest approach in vanilla JS without introducing a module system.
All state (player registry, audio group, selected player) lives on `App`.

**Decision: Shared clock `setInterval`**  
Rather than one `setInterval` per VideoPlayer (up to 36 timers in 6×6 mode),
`UIManager` owns a single `setInterval` that ticks every second.
`VideoPlayer` subscribes to it via `App.subscribeClock()` and gets an unsubscribe
function for clean teardown. This reduces timer count from O(N players) to O(1).

**Decision: Hover controls replace overlay (not alongside it)**  
User specified that hover controls should temporarily replace the overlay.
Implemented with CSS opacity transitions:
- `.overlay` opacity: 1 → 0 on `.cell:hover`
- `.hover-controls` opacity: 0 → 1 on `.cell:hover`
Both use `transition: opacity 240ms ease`.

**Decision: `file://` compatibility**  
The `origin` parameter is NOT passed to the YouTube IFrame API so the app works
when opened directly from disk without a local server. YouTube's iframe_api doesn't
require origin for basic playback control.

**Decision: Audio model**  
- `App.audioGroup` = `Set<videoId>` (players with active audio).
- Click → `App.#setExclusiveAudio()` → clear group, add one.
- Ctrl+Click → `App.#toggleAudioGroup()` → add/remove from group.
- `VideoPlayer.setAudio(true/false)` is the single mutation point for mute state.

---

### Session 2 — Implementation

**Decision: LayoutManager does not emit events on construction**  
The constructor builds cells silently. `setLayout()` emits `cell:added` /
`cell:removed` for incremental changes. Initial players are created separately
by `App.#createInitialPlayers()`. This avoids race conditions during boot
(event listeners must be registered before events are emitted).

**Decision: `innerHTML = ''` on cell swap**  
When drag-and-drop swaps two cells, both affected `VideoPlayer` instances are
`destroy()`'ed (which calls `ytPlayer.destroy()` → removes the iframe from DOM).
Then `innerHTML = ''` clears any remaining children.
A new `VideoPlayer` is constructed in each cell. This causes a brief reload of
those two streams, which is acceptable.
Moving YouTube iframes in the DOM always causes a reload (cross-origin restriction),
so recreating is actually the same cost with cleaner semantics.

**Decision: Drag-and-drop iframe isolation**  
During drag, `document.body.classList.add('dragging-active')`.
CSS: `.dragging-active .player-frame iframe { pointer-events: none }`.
This prevents YouTube iframes from capturing `dragover`/`drop` events.
The class is removed in `dragend` (which fires even if the drop is cancelled).

**Decision: `loop=1` + `playlist` parameter**  
YouTube IFrame API requires `playlist: videoId` in `playerVars` for `loop=1` to
work when a single video is specified via `videoId`. Without `playlist`, the loop
parameter is silently ignored.

**Decision: Error handling for YT.Player errors**  
Error codes 101 and 150 both mean "embedding disabled by owner" (101 for embeds
from non-playlist, 150 for embeds from playlist). Both are handled identically.
The cell gets the `error-state` class which shows a CSS-generated "Stream Unavailable"
message via `::after` pseudo-element (no extra DOM needed).

**Decision: `cell-index-badge` preservation across player rebuilds**  
`VideoPlayer.#buildDOM()` saves and re-appends the `.cell-index-badge` element
before clearing `innerHTML`. This preserves the numeric cell label (which is set
by `LayoutManager`) across player recreations (e.g., after reload or swap).

**Decision: Boot sequence order**  
`App.init()` must:
1. Register bus listeners BEFORE creating `LayoutManager` (which may emit events
   if `setLayout()` is called — though the constructor does not).
2. Create `UIManager` BEFORE creating `VideoPlayer` instances (so
   `App.subscribeClock()` has a valid `#ui` reference).
3. Create `LayoutManager` to build cell DOM.
4. Call `#createInitialPlayers()` last, once all infrastructure is ready.

**Performance note: `will-change`**  
Applied to `.cell` for `border-color` and `box-shadow` (audio/selection glow).
Applied to `.ctrl-btn` for `transform` (hover scale effect).
Not applied wholesale to avoid excessive GPU layer promotion.

---

### Known Issues / Future Work

- **Sync feature:** `settings:sync` is stored but not fully implemented.
  True sync would require periodic `getCurrentTime()` polling across players
  and `seekTo()` corrections. Skipped for v1.0 (live streams don't benefit).

- **Mobile drag-and-drop:** HTML5 D&D API does not fire on touch events.
  A Pointer Events-based fallback would be needed for touch reordering.
  For v1.0, touch users can still change layouts but not reorder cells by dragging.

- **Very large grids (5×5, 6×6):** With 25–36 simultaneous iframes,
  performance depends heavily on the host machine. YouTube itself limits
  the number of concurrent streams that can play in a single tab.
  Consider pausing off-screen players in a future version.

- **`file://` vs localhost:** YouTube's `postMessage` events (used for
  `onStateChange`, `onReady`) do work over `file://` in Chrome and Firefox.
  Safari may block some postMessage events from `file://` origins.
  Recommended: serve via localhost for production use.
