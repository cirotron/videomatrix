/**
 * VideoWall Pro — Layout Manager
 *
 * Manages the CSS Grid layout and all cell-level concerns:
 *   - Creating / removing .cell DOM elements as the grid size changes.
 *   - Maintaining the `order` array: order[cellIndex] = VIDEOS index.
 *   - HTML5 Drag-and-Drop with iframe-safe pointer-event disabling.
 *
 * The constructor creates all initial cells silently (no events).
 * setLayout() emits 'cell:added' / 'cell:removed' for incremental changes
 * so App can create or destroy the corresponding VideoPlayer instances.
 *
 * Drag-and-drop:
 *   - During drag, document.body gets the 'dragging-active' class.
 *   - CSS rule: .dragging-active .player-frame iframe { pointer-events: none }
 *     ensures iframes don't swallow drag events.
 *   - On drop, the order array is swapped, persisted, and 'cell:swap' emitted.
 *   - App responds by destroying and recreating the two affected players.
 */

'use strict';

class LayoutManager {
  /** @private @type {HTMLElement} */
  #gridEl;
  /** @private @type {number} */
  #rows;
  /** @private @type {number} */
  #cols;
  /**
   * order[cellIndex] = VIDEOS index (-1 = empty cell).
   * @private @type {number[]}
   */
  #order = [];
  /**
   * Live list of .cell DOM elements, indexed by cellIndex.
   * @private @type {HTMLElement[]}
   */
  #cells = [];
  /** @private @type {number|null} */
  #dragSrcIndex = null;

  // ───────────────────────────────────────────────────────────────────────────
  // Constructor
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement}  gridEl      The #grid-container element.
   * @param {number}       rows
   * @param {number}       cols
   * @param {number[]|null} savedOrder Persisted order from LocalStorage, or null.
   */
  constructor(gridEl, rows, cols, savedOrder) {
    this.#gridEl = gridEl;
    this.#rows   = rows;
    this.#cols   = cols;

    this.#buildOrder(rows * cols, savedOrder);
    this.#applyGridCSS();
    this.#buildInitialCells();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Order Array
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Initialise or extend the order array to cover `totalCells` entries.
   * @param {number}      totalCells
   * @param {number[]|null} saved
   */
  #buildOrder(totalCells, saved) {
    // Start from saved order (preserves user-arranged positions).
    this.#order = saved ? saved.slice() : [];

    // Extend if we need more entries than were saved.
    while (this.#order.length < totalCells) {
      this.#order.push(this.#nextAvailableVideoIndex());
    }
  }

  /**
   * Return the next VIDEOS index not yet in the order array, or -1 if all used.
   * @returns {number}
   */
  #nextAvailableVideoIndex() {
    const used = new Set(this.#order.filter(v => v >= 0));
    for (let i = 0; i < VIDEOS.length; i++) {
      if (!used.has(i)) return i;
    }
    return -1; // all videos already assigned → empty cell
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CSS Grid
  // ───────────────────────────────────────────────────────────────────────────

  #applyGridCSS() {
    this.#gridEl.style.gridTemplateColumns = `repeat(${this.#cols}, 1fr)`;
    this.#gridEl.style.gridTemplateRows    = `repeat(${this.#rows}, 1fr)`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cell Construction
  // ───────────────────────────────────────────────────────────────────────────

  /** Build all initial cells without emitting events. */
  #buildInitialCells() {
    const total = this.#rows * this.#cols;
    for (let i = 0; i < total; i++) {
      const cell = this.#createCellElement(i);
      this.#gridEl.appendChild(cell);
      this.#cells.push(cell);
    }
  }

  /**
   * Create one .cell DOM element with drag listeners and the index badge.
   * @param {number} index
   * @returns {HTMLElement}
   */
  #createCellElement(index) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.cellIndex  = index;
    cell.dataset.videoIndex = this.#order[index] ?? -1;
    cell.setAttribute('draggable', 'true');

    // Numeric badge (top-left corner, shows 1-based position).
    const badge = document.createElement('div');
    badge.className = 'cell-index-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = index + 1;
    cell.appendChild(badge);

    // Empty cell gets a visual placeholder.
    if ((this.#order[index] ?? -1) < 0) {
      cell.classList.add('empty');
    }

    this.#attachDragListeners(cell, index);

    return cell;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Drag & Drop
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} cell
   * @param {number}      index
   */
  #attachDragListeners(cell, index) {
    cell.addEventListener('dragstart',  e => this.#onDragStart(e, index));
    cell.addEventListener('dragend',    () => this.#onDragEnd(index));
    cell.addEventListener('dragover',   e => this.#onDragOver(e, index));
    cell.addEventListener('dragleave',  () => this.#onDragLeave(index));
    cell.addEventListener('drop',       e => this.#onDrop(e, index));
  }

  /** @param {DragEvent} e @param {number} index */
  #onDragStart(e, index) {
    this.#dragSrcIndex = index;
    this.#cells[index]?.classList.add('dragging');
    // Disable pointer events on all iframes so they don't steal drag events.
    document.body.classList.add('dragging-active');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }

  /** @param {number} index */
  #onDragEnd(index) {
    this.#cells[index]?.classList.remove('dragging');
    this.#cells.forEach(c => c.classList.remove('drag-over'));
    document.body.classList.remove('dragging-active');
    this.#dragSrcIndex = null;
  }

  /** @param {DragEvent} e @param {number} index */
  #onDragOver(e, index) {
    if (this.#dragSrcIndex === null || this.#dragSrcIndex === index) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.#cells.forEach((c, i) => c.classList.toggle('drag-over', i === index));
  }

  /** @param {number} index */
  #onDragLeave(index) {
    this.#cells[index]?.classList.remove('drag-over');
  }

  /** @param {DragEvent} e @param {number} index */
  #onDrop(e, index) {
    e.preventDefault();
    const from = this.#dragSrcIndex;
    const to   = index;

    if (from === null || from === to) {
      this.#onDragEnd(to);
      return;
    }

    // Swap entries in the order array.
    [this.#order[from], this.#order[to]] = [this.#order[to], this.#order[from]];

    // Keep data attributes in sync.
    this.#cells[from].dataset.videoIndex = this.#order[from];
    this.#cells[to].dataset.videoIndex   = this.#order[to];

    // Update empty class.
    this.#cells[from].classList.toggle('empty', this.#order[from] < 0);
    this.#cells[to].classList.toggle('empty',   this.#order[to]   < 0);

    this.#onDragEnd(from);

    // Persist and notify App to recreate the two affected players.
    StorageManager.set('layout_order', this.#order.slice());
    App.bus.emit('cell:swap', { from, to, order: this.#order.slice() });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Layout Change
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Change the grid dimensions, adding or removing cells as needed.
   * Emits 'cell:added' / 'cell:removed' for each delta cell.
   *
   * @param {number} rows
   * @param {number} cols
   */
  setLayout(rows, cols) {
    const newTotal = rows * cols;
    const oldTotal = this.#rows * this.#cols;

    this.#rows = rows;
    this.#cols = cols;
    this.#applyGridCSS();

    if (newTotal > oldTotal) {
      // Expand: add delta cells.
      for (let i = oldTotal; i < newTotal; i++) {
        // Extend order array if needed (may already have entries from a
        // previous larger layout that was saved to storage).
        if (this.#order.length <= i) {
          this.#order.push(this.#nextAvailableVideoIndex());
        }

        const cell = this.#createCellElement(i);
        this.#gridEl.appendChild(cell);
        this.#cells.push(cell);

        App.bus.emit('cell:added', {
          cellIndex: i,
          videoIndex: this.#order[i],
          cellEl: cell,
        });
      }
    } else if (newTotal < oldTotal) {
      // Shrink: remove delta cells (tail-first).
      for (let i = oldTotal - 1; i >= newTotal; i--) {
        const cell = this.#cells.pop();
        App.bus.emit('cell:removed', {
          cellIndex: i,
          videoIndex: this.#order[i],
        });
        cell.remove();
      }
    }

    StorageManager.set('layout', { rows, cols });
    App.bus.emit('layout:changed', { rows, cols, order: this.#order.slice() });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public Accessors
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Snapshot of the current order array.
   * @returns {number[]}
   */
  getOrder() { return this.#order.slice(); }

  /**
   * Get the .cell DOM element at the given index.
   * @param {number} index
   * @returns {HTMLElement|null}
   */
  getCell(index) { return this.#cells[index] ?? null; }

  /** @returns {HTMLElement[]} */
  getCells() { return this.#cells.slice(); }

  get rows()       { return this.#rows;              }
  get cols()       { return this.#cols;              }
  get totalCells() { return this.#rows * this.#cols; }
}
