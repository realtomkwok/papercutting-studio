/**
 * EditorModel (M2) — the headless heart of the wedge editor.
 *
 * Real-life flow (dev-spec §1, user direction): **fold → draw → cut → unfold**, where "draw" and
 * "cut" are two distinct tools that mirror sketching on folded paper:
 *  - the **pencil** lays down *ink strokes* — open polylines, a draft sketch on the paper. The
 *    **eraser** rubs that ink out (splitting/trimming strokes). Neither cuts anything: the sketch is
 *    shown as pencil lines and never reaches the 3D preview;
 *  - the **scissors** read the sketch, find the *enclosed areas* the lines seal off (via the injected
 *    {@link RegionDetector}), and cut one — or all — of them out, committing each as a *cut batch*
 *    (removed material). The boolean compositor unions the committed batches and keeps only the
 *    largest paper piece.
 *
 * Committed batches are unioned (a cut only ever removes more paper), so re-sketching and re-cutting
 * never restores an earlier committed cut; to undo a committed cut, use undo.
 *
 * Owns the ink strokes, the committed cut batches, the cached detected regions, the undo/redo
 * history, the debounced live-preview pipeline, and the engine event emissions. It holds **no**
 * Paper.js/canvas/DOM references — the boolean compositor and the region detector are *injected*
 * (real implementations in the browser, stubs in tests) — so it runs UI-free (dev-spec §3.2, §9 M2).
 */

import { type FoldConfig, symmetricalTriangle } from '../core/foldConfig';
import { pointInPolygon, type Point } from '../core/geometry';
import { cleanStroke, eraseStrokes, type Stroke } from '../core/ink';
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
  /** Eraser radius in unit-square units. */
  readonly eraseRadius?: number;
}

type Poly = readonly Point[];

/** One op of a committed cut. With the sketch→scissors flow a batch is a single `add` (the detected
 *  region); the `subtract` kind is retained for the compositor's general boolean handling. */
export interface DesignOp {
  readonly kind: 'add' | 'subtract';
  readonly poly: Poly;
}

/** A committed cut: the ops one scissors action turned into removed material. Composed
 *  independently, then unioned with the other batches — so no later batch can restore it. */
type Batch = readonly DesignOp[];

/** The Paper.js boolean compositor injected at mount. `committed` unions the cut batches and keeps
 *  the largest paper piece (the removed region the preview unfolds). */
export interface Compositor {
  committed(batches: readonly Batch[]): Point[][];
}

/** The raster region detector injected at mount. `detect` flood-fills the sketch into the enclosed
 *  cut-out areas (unit-space contours). Stubbed in headless tests. */
export interface RegionDetector {
  detect(strokes: readonly Stroke[], fold: FoldConfig): Point[][];
}

/** Immutable editor state; the undo stack is a list of these. */
interface State {
  /** The pencil sketch — ink strokes (open polylines), drawn but never cut/previewed. */
  readonly strokes: readonly Stroke[];
  /** Committed cut batches in chronological order. */
  readonly batches: readonly Batch[];
  /** Strokes consumed by each batch (parallel to `batches`): the sketch lines that bounded the cut,
   *  removed from the sketch when it was cut and restored if the cut is reverted. */
  readonly consumed: readonly (readonly Stroke[])[];
}

const EMPTY: State = { strokes: [], batches: [], consumed: [] };

const clone = (poly: Poly): Point[] => poly.map((p) => ({ x: p.x, y: p.y }));

export class EditorModel {
  private fold: FoldConfig;
  private readonly epsilon: number;
  private readonly debounceMs: number;
  private readonly eraseRadius: number;
  private readonly emit: Emit;
  private readonly onUnfold: (result: UnfoldResult) => void;

  /** History of states; `index` points at the current one. Index 0 is empty. */
  private history: State[] = [EMPTY];
  private index = 0;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  /** Injected at mount; absent in headless tests unless stubbed. */
  private compositor: Compositor | null = null;
  private detector: RegionDetector | null = null;
  private committedContours: Point[][] = [];
  /** Detected enclosed cut-out areas of the current sketch (the scissors' highlights). */
  private regionContours: Point[][] = [];

  constructor(opts: EditorModelOptions) {
    this.emit = opts.emit;
    this.onUnfold = opts.onUnfold;
    this.fold = opts.fold ?? symmetricalTriangle;
    this.epsilon = opts.epsilon ?? DEFAULT_EPSILON;
    this.debounceMs = opts.debounceMs ?? 100;
    this.eraseRadius = opts.eraseRadius ?? 0.025;
  }

  /** Install the boolean compositor and recompute the committed region. */
  setCompositor(compositor: Compositor): void {
    this.compositor = compositor;
    this.recompose();
    this.emit('pathschange', { count: this.batches.length });
    this.schedulePreview();
  }

  /** Install the scissors region detector and recompute the enclosed areas. */
  setDetector(detector: RegionDetector): void {
    this.detector = detector;
    this.redetect();
    this.emit('outlineschange', { count: this.strokes.length });
  }

  /** Re-run enclosed-area detection without changing state — for when a scissors setting (e.g. the
   *  cut-fit margin) changes. Emits `outlineschange` so the editor repaints its highlights. */
  refreshRegions(): void {
    this.redetect();
    this.emit('outlineschange', { count: this.strokes.length });
  }

  private get state(): State {
    return this.history[this.index] ?? EMPTY;
  }

  /** The pencil sketch — ink strokes (not cut, not previewed). */
  get strokes(): readonly Stroke[] {
    return this.state.strokes;
  }

  /** Committed cut batches in chronological order. */
  get batches(): readonly Batch[] {
    return this.state.batches;
  }

  private get consumed(): readonly (readonly Stroke[])[] {
    return this.state.consumed;
  }

  /** The enclosed cut-out areas still awaiting the scissors — detected areas whose centroid isn't
   *  already inside a committed cut. (Cut areas drop out so their highlight disappears.) */
  get regions(): readonly Poly[] {
    return this.regionContours.filter((r) => !this.cutBatchAt(centroid(r)));
  }

  /** The committed removed-region contours (union of cut batches, largest paper piece kept) — what
   *  the editor draws as holes and the preview unfolds. */
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
    this.redetect();
    this.schedulePreview();
  }

  /**
   * Pencil: add a freehand ink stroke (open polyline) to the sketch. Cleaned of duplicate points;
   * rejected if fewer than 2 distinct points remain. Emits `outlineschange`/`historychange` and
   * re-detects the enclosed areas — but no preview change (nothing is cut yet). Returns acceptance.
   */
  drawStroke(rawPoints: Stroke): boolean {
    const stroke = cleanStroke(rawPoints);
    if (stroke.length < 2) return false;
    this.push({ ...this.state, strokes: [...this.strokes, stroke] });
    this.afterMutation();
    return true;
  }

  /**
   * Eraser: rub the drawn polyline over the sketch, trimming/splitting the ink strokes it touches
   * (never the committed cuts). `radius` (unit-square units) defaults to the model's eraser radius;
   * the editor passes its current brush size. Returns whether anything changed.
   */
  erase(rawPoints: Stroke, radius = this.eraseRadius): boolean {
    const eraser = cleanStroke(rawPoints);
    if (eraser.length === 0) return false;
    const next = eraseStrokes(this.strokes, eraser, radius);
    if (next.length === this.strokes.length && sameStrokes(next, this.strokes)) return false;
    this.push({ ...this.state, strokes: next });
    this.afterMutation();
    return true;
  }

  /**
   * Scissors. With `at`, it's a **toggle**: tapping a committed cut reverts it (the area un-cuts and
   * its sketch reappears); tapping an uncut enclosed area cuts it out. Without `at`, it cuts **every**
   * uncut enclosed area (the "Cut all" action). Each cut is validated/snapped and committed as its own
   * batch. Returns whether anything changed.
   */
  cut(at?: Point): boolean {
    // Toggle off: tapping inside an existing cut removes that batch (revert) and restores the sketch
    // lines that bounded it.
    if (at) {
      const idx = this.cutBatchIndexAt(at);
      if (idx >= 0) {
        this.push({
          strokes: [...this.strokes, ...(this.consumed[idx] ?? [])],
          batches: this.batches.filter((_, i) => i !== idx),
          consumed: this.consumed.filter((_, i) => i !== idx),
        });
        this.afterMutation();
        return true;
      }
    }

    // Otherwise cut the uncut enclosed area(s).
    const uncut = this.regions; // already filters out areas that are committed
    // With a cursor point, cut at most one region per click so overlapping areas merge progressively.
    const targets = at ? uncut.filter((r) => pointInPolygon(at, r)).slice(0, 1) : uncut;
    if (targets.length === 0) return false;

    let working = [...this.strokes];
    const newBatches: Batch[] = [];
    const newConsumed: (readonly Stroke[])[] = [];
    for (const region of targets) {
      const path = this.validated(region);
      if (!path) continue;
      // Dismiss the sketch lines fully enclosed by this cut (their job is done); keep dangling tails
      // and lines shared with still-uncut areas.
      const eaten: Stroke[] = [];
      const kept: Stroke[] = [];
      for (const s of working) (strokeInside(s, path) ? eaten : kept).push(s);
      working = kept;
      newBatches.push([{ kind: 'add', poly: path }]);
      newConsumed.push(eaten);
    }
    if (newBatches.length === 0) return false;
    this.push({
      strokes: working,
      batches: [...this.batches, ...newBatches],
      consumed: [...this.consumed, ...newConsumed],
    });
    this.afterMutation();
    return true;
  }

  /**
   * Lasso scissors (current tool model): the user draws a freeform path with the scissors (or drops a
   * stamp) and that area is cut **immediately**. Runs the just-drawn stroke through the detector to
   * recover the enclosed contour(s) — reusing edge-sealing and wedge-clipping — then commits each as
   * its own cut batch. No pending sketch is kept (the stroke isn't retained). Returns whether anything
   * was cut. Headless (no detector): the closed polyline is committed directly.
   */
  lassoCut(rawPoints: Stroke): boolean {
    const stroke = cleanStroke(rawPoints);
    if (stroke.length < 2) return false;
    const regions = this.detector ? this.detector.detect([stroke], this.fold) : [stroke];
    const newBatches: Batch[] = [];
    for (const region of regions) {
      const path = this.validated(region);
      if (path) newBatches.push([{ kind: 'add', poly: path }]);
    }
    if (newBatches.length === 0) return false;
    this.push({
      ...this.state,
      batches: [...this.batches, ...newBatches],
      consumed: [...this.consumed, ...newBatches.map(() => [] as Stroke[])],
    });
    this.afterMutation();
    return true;
  }

  /** Eraser (current tool model): tapping inside a committed cut removes it (un-cuts that area).
   *  Returns whether a cut was removed. */
  removeCutAt(at: Point): boolean {
    const idx = this.cutBatchIndexAt(at);
    if (idx < 0) return false;
    this.push({
      strokes: [...this.strokes, ...(this.consumed[idx] ?? [])],
      batches: this.batches.filter((_, i) => i !== idx),
      consumed: this.consumed.filter((_, i) => i !== idx),
    });
    this.afterMutation();
    return true;
  }

  /** Index of the committed batch whose cut polygon contains `p`, or −1. Used by the scissors toggle
   *  to revert a cut the user taps. */
  private cutBatchIndexAt(p: Point): number {
    return this.batches.findIndex((b) =>
      b.some((op) => op.kind === 'add' && pointInPolygon(p, op.poly)),
    );
  }

  /** Whether any committed batch's cut contains `p`. */
  private cutBatchAt(p: Point): boolean {
    return this.cutBatchIndexAt(p) >= 0;
  }

  /** Directly commit a single validated cut as its own batch, skipping the sketch step (templates /
   *  headless tests). */
  commit(rawPoints: Poly): boolean {
    const path = this.validated(rawPoints);
    if (!path) return false;
    this.push({
      ...this.state,
      batches: [...this.batches, [{ kind: 'add', poly: path }]],
      consumed: [...this.consumed, []],
    });
    this.afterMutation();
    return true;
  }

  /** Drop the sketch and every committed cut (a fresh wedge). */
  clear(): void {
    if (this.batches.length === 0 && this.strokes.length === 0) return;
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

  /** Validate + clean a region/cut path against the current fold; null if rejected. Emits
   *  `validation`. */
  private validated(rawPoints: Poly): Poly | null {
    const result = validatePath(rawPoints, this.fold, this.epsilon);
    this.emit('validation', { ok: result.ok, messages: result.messages });
    return result.ok ? result.path : null;
  }

  /** Push a new state, truncating any redo tail. */
  private push(next: State): void {
    this.history = this.history.slice(0, this.index + 1);
    this.history.push(next);
    this.index = this.history.length - 1;
  }

  private afterMutation(): void {
    this.recompose();
    this.redetect();
    this.emit('pathschange', { count: this.batches.length });
    this.emit('outlineschange', { count: this.strokes.length });
    this.emit('historychange', { canUndo: this.canUndo, canRedo: this.canRedo });
    this.schedulePreview();
  }

  /** Recompute the committed removed-region from the cut batches. */
  private recompose(): void {
    if (this.compositor) {
      this.committedContours = this.compositor.committed(this.batches);
    } else {
      // Headless fallback: take each add polygon verbatim.
      this.committedContours = this.batches.flatMap((b) =>
        b.filter((o) => o.kind === 'add').map((o) => clone(o.poly)),
      );
    }
  }

  /** Recompute the enclosed cut-out areas from the current sketch. No detector ⇒ no regions. */
  private redetect(): void {
    this.regionContours =
      this.detector && this.strokes.length > 0 ? this.detector.detect(this.strokes, this.fold) : [];
  }

  /** Debounce the (relatively cheap) unfold + preview render. */
  private schedulePreview(): void {
    if (this.previewTimer !== null) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      this.renderPreviewNow();
    }, this.debounceMs);
  }

  /** Unfold the committed removed-region and hand it to the view. The sketch never reaches here, so
   *  the preview shows only material that's actually been cut. */
  renderPreviewNow(): void {
    const result = unfold(this.committedContours, this.fold, this.epsilon);
    this.onUnfold(result);
  }
}

/** Tolerance (unit-square units) for treating a stroke vertex as "on" the cut boundary — covers the
 *  small gap between the pencil centerline and the cut edge (the cut hugs the centerline). */
const CONSUME_BAND = 0.02;

/** Whether every vertex of a stroke lies inside `poly` *or* within {@link CONSUME_BAND} of its edge —
 *  i.e. the stroke bounds the cut area, so cutting consumes it. A line that pokes clearly outside
 *  (a dangling tail, or a wall shared with a still-uncut area) is kept. */
function strokeInside(stroke: Stroke, poly: Poly): boolean {
  if (stroke.length === 0) return false;
  const band2 = CONSUME_BAND * CONSUME_BAND;
  return stroke.every((p) => pointInPolygon(p, poly) || distSqToPolyEdge(p, poly) <= band2);
}

/** Squared distance from `p` to the nearest edge of polygon `poly` (treated as closed). */
function distSqToPolyEdge(p: Point, poly: Poly): number {
  let best = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = p.x - (a.x + t * dx);
    const ey = p.y - (a.y + t * dy);
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return best;
}

/** Vertex-average centroid of a polygon (good enough to test which cut a region belongs to). */
function centroid(poly: Poly): Point {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, poly.length);
  return { x: x / n, y: y / n };
}

/** Shallow structural equality of two stroke arrays (same lengths, same points in order). */
function sameStrokes(a: readonly Stroke[], b: readonly Stroke[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i]!;
    const sb = b[i]!;
    if (sa.length !== sb.length) return false;
    for (let j = 0; j < sa.length; j++) {
      if (sa[j]!.x !== sb[j]!.x || sa[j]!.y !== sb[j]!.y) return false;
    }
  }
  return true;
}
