/**
 * EditorModel (M2) — the headless heart of the wedge editor.
 *
 * Real-life two-step flow (dev-spec §1, user direction):
 *  - the **pencil** and the **eraser** both edit a single *pending design* — the dotted shape inside
 *    the stencil. The pencil *adds* to it, the eraser *subtracts* from it. Nothing here is cut yet:
 *    the pending design is shown dotted and never reaches the preview;
 *  - the **scissors** then cut the whole pending design out, committing it as one *cut batch*
 *    (removed material). The boolean compositor unions the committed batches and keeps only the
 *    largest paper piece.
 *
 * The eraser therefore carves the pending design only — it can never touch already-committed cuts.
 * Committed batches are unioned (a cut only ever removes more paper), so a later design's eraser
 * notch never restores an earlier committed cut; to undo a committed cut, use undo.
 *
 * Owns the pending design, the committed cut batches, the undo/redo history, the debounced live-
 * preview pipeline, and the engine event emissions. It holds **no** Paper.js/canvas/DOM references,
 * so it runs UI-free in tests (dev-spec §3.2, §9 M2): the Paper.js layer feeds it plain point arrays.
 */

import { type FoldConfig, symmetricalTriangle } from '../core/foldConfig';
import { pointInPolygon, type Point } from '../core/geometry';
import { unfold, type UnfoldResult } from '../core/unfold';
import { DEFAULT_EPSILON } from '../core/unfold';
import { validatePath } from '../core/validate';
import type { EngineEvent, EngineEventPayload } from '../engine/api';

type Emit = <E extends EngineEvent>(event: E, payload: EngineEventPayload[E]) => void;

export interface EditorModelOptions {
  /** Engine event bus. */
  readonly emit: Emit;
  /** Called after the debounce with the freshly unfolded pattern; the view renders it. */
  readonly onUnfold: (result: UnfoldResult) => void;
  readonly fold?: FoldConfig;
  readonly epsilon?: number;
  /** Live-preview debounce (dev-spec §4 suggests ~100 ms). */
  readonly debounceMs?: number;
}

type Poly = readonly Point[];

/** One step of the pending design. The pencil appends an `add`, the eraser a `subtract`; the
 *  compositor applies them **in order** to produce the dotted design region. */
export interface DesignOp {
  readonly kind: 'add' | 'subtract';
  readonly poly: Poly;
}

/** A committed cut: the ordered design ops that one scissors action turned into removed material.
 *  Composed independently, then unioned with the other batches — so its internal eraser notches
 *  survive as holes, and no later batch can restore it. */
type Batch = readonly DesignOp[];

/** The compositor the engine injects at mount (Paper.js booleans). `design` composes a pending
 *  design's add/subtract ops into its literal contours (the dotted shape); `committed` unions the
 *  cut batches and keeps the largest paper piece (the removed region the preview unfolds). */
export interface Compositor {
  design(ops: Batch): Point[][];
  committed(batches: readonly Batch[]): Point[][];
}

/** Immutable editor state; the undo stack is a list of these. */
interface State {
  /** The pending design's ordered add/subtract ops (drawn but not yet cut; never previewed). */
  readonly pending: Batch;
  /** Committed cut batches in chronological order. */
  readonly batches: readonly Batch[];
}

const EMPTY: State = { pending: [], batches: [] };

const clone = (poly: Poly): Point[] => poly.map((p) => ({ x: p.x, y: p.y }));

export class EditorModel {
  private fold: FoldConfig;
  private readonly epsilon: number;
  private readonly debounceMs: number;
  private readonly emit: Emit;
  private readonly onUnfold: (result: UnfoldResult) => void;

  /** History of states; `index` points at the current one. Index 0 is empty. */
  private history: State[] = [EMPTY];
  private index = 0;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  /** Optional Paper.js boolean compositor (injected at mount). When absent (headless tests) a trivial
   *  add-only fallback is used, ignoring subtracts. */
  private compositor: Compositor | null = null;
  private committedContours: Point[][] = [];
  private pendingContours: Point[][] = [];

  constructor(opts: EditorModelOptions) {
    this.emit = opts.emit;
    this.onUnfold = opts.onUnfold;
    this.fold = opts.fold ?? symmetricalTriangle;
    this.epsilon = opts.epsilon ?? DEFAULT_EPSILON;
    this.debounceMs = opts.debounceMs ?? 100;
  }

  /** Install the boolean compositor and recompute both regions. */
  setCompositor(compositor: Compositor): void {
    this.compositor = compositor;
    this.recompose();
    this.emit('pathschange', { count: this.batches.length });
    this.emit('outlineschange', { count: this.pending.length });
    this.schedulePreview();
  }

  private get state(): State {
    return this.history[this.index] ?? EMPTY;
  }

  /** The pending design's ordered ops (pencil adds + eraser subtracts; not yet cut). */
  get pending(): Batch {
    return this.state.pending;
  }

  /** Committed cut batches in chronological order. */
  get batches(): readonly Batch[] {
    return this.state.batches;
  }

  /** The pending design's contours (the dotted shape, eraser notches included) — drawn in the editor
   *  but never previewed. Falls back to the raw pencil-add polygons with no compositor installed. */
  get composedPending(): readonly Poly[] {
    return this.pendingContours;
  }

  /** The committed removed-region contours (union of cut batches, largest paper piece kept) — what the
   *  editor draws as holes and the preview unfolds. Falls back to the raw add polygons. */
  get composedContours(): readonly Poly[] {
    return this.committedContours;
  }

  /** Aliases kept for callers/tests that count committed cuts. */
  get cuts(): readonly Poly[] {
    return this.committedContours;
  }
  get paths(): readonly Poly[] {
    return this.committedContours;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  setFold(fold: FoldConfig): void {
    this.fold = fold;
    this.recompose();
    this.schedulePreview();
  }

  /**
   * Pencil: validate a raw drawn path and, if valid, *add* it to the pending design. Emits
   * `validation` always; on success emits `pathschange`/`outlineschange`/`historychange` (no preview
   * change — the design isn't cut yet). Returns whether the stroke was accepted.
   */
  drawOutline(rawPoints: Poly): boolean {
    return this.appendPending('add', rawPoints);
  }

  /**
   * Eraser: validate a drawn region and *subtract* it from the pending design — carving the dotted
   * shape, never the committed cuts. Returns whether the stroke was accepted.
   */
  erase(rawPoints: Poly): boolean {
    return this.appendPending('subtract', rawPoints);
  }

  private appendPending(kind: DesignOp['kind'], rawPoints: Poly): boolean {
    const path = this.validated(rawPoints);
    if (!path) return false;
    this.push({ ...this.state, pending: [...this.pending, { kind, poly: path }] });
    this.afterMutation();
    return true;
  }

  /**
   * Scissors: cut the pending design out, committing it as one batch. With `at`, only cuts when the
   * point lies inside the dotted design; without one, always commits a non-empty design. Returns
   * whether anything was cut.
   */
  cut(at?: Point): boolean {
    if (this.pending.length === 0) return false;
    if (at && !this.pendingContains(at)) return false;
    this.push({ pending: [], batches: [...this.batches, this.pending] });
    this.afterMutation();
    return true;
  }

  /** Directly commit a single validated cut as its own batch, skipping the pending step (templates /
   *  headless tests). */
  commit(rawPoints: Poly): boolean {
    const path = this.validated(rawPoints);
    if (!path) return false;
    this.push({ ...this.state, batches: [...this.batches, [{ kind: 'add', poly: path }]] });
    this.afterMutation();
    return true;
  }

  /** Drop the pending design and every committed cut (a fresh wedge). */
  clear(): void {
    if (this.batches.length === 0 && this.pending.length === 0) return;
    this.push(EMPTY);
    this.afterMutation();
  }

  undo(): void {
    if (!this.canUndo) return;
    this.index--;
    this.afterMutation();
  }

  redo(): void {
    if (!this.canRedo) return;
    this.index++;
    this.afterMutation();
  }

  /** Cancel any pending preview; call when the engine disposes. */
  dispose(): void {
    if (this.previewTimer !== null) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
  }

  /** Validate + clean a raw drawn path against the current fold; null if rejected. Emits `validation`. */
  private validated(rawPoints: Poly): Poly | null {
    const result = validatePath(rawPoints, this.fold, this.epsilon);
    this.emit('validation', { ok: result.ok, messages: result.messages });
    return result.ok ? result.path : null;
  }

  /** Even-odd hit test of a point against the composed pending design (holes counted). */
  private pendingContains(p: Point): boolean {
    let inside = false;
    for (const contour of this.composedPending) {
      if (pointInPolygon(p, contour)) inside = !inside;
    }
    return inside;
  }

  /** Push a new state, truncating any redo tail. */
  private push(next: State): void {
    this.history = this.history.slice(0, this.index + 1);
    this.history.push(next);
    this.index = this.history.length - 1;
  }

  private afterMutation(): void {
    this.recompose();
    this.emit('pathschange', { count: this.batches.length });
    this.emit('outlineschange', { count: this.pending.length });
    this.emit('historychange', { canUndo: this.canUndo, canRedo: this.canRedo });
    this.schedulePreview();
  }

  /** Recompute the committed removed-region and the pending design contours. */
  private recompose(): void {
    if (this.compositor) {
      this.committedContours = this.compositor.committed(this.batches);
      this.pendingContours = this.compositor.design(this.pending);
    } else {
      // Headless fallback: ignore subtracts, take each add polygon verbatim.
      this.committedContours = this.batches.flatMap((b) =>
        b.filter((o) => o.kind === 'add').map((o) => clone(o.poly)),
      );
      this.pendingContours = this.pending
        .filter((o) => o.kind === 'add')
        .map((o) => clone(o.poly));
    }
  }

  /** Debounce the (relatively cheap) unfold + preview render. */
  private schedulePreview(): void {
    if (this.previewTimer !== null) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      this.renderPreviewNow();
    }, this.debounceMs);
  }

  /** Unfold the committed removed-region and hand it to the view. The pending design never reaches
   *  here, so the preview shows only material that's actually been cut. */
  renderPreviewNow(): void {
    const result = unfold(this.committedContours, this.fold, this.epsilon);
    this.onUnfold(result);
  }
}
