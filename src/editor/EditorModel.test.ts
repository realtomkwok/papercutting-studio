import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { symmetricalTriangle } from '../core/foldConfig';
import { pointInWedge, type Point } from '../core/geometry';
import type { UnfoldResult } from '../core/unfold';
import type { EngineEvent, EngineEventPayload } from '../engine/api';
import { EditorModel } from './EditorModel';

const INSIDE: Point[] = [
  { x: 0.2, y: 0.04 },
  { x: 0.35, y: 0.04 },
  { x: 0.3, y: 0.12 },
];
const OUTSIDE: Point[] = [
  { x: 0.05, y: 0.3 },
  { x: 0.1, y: 0.4 },
  { x: 0.02, y: 0.45 },
];

/** A test harness that records emitted events and the debounced unfold results. */
function makeModel(debounceMs = 100) {
  const events: { [E in EngineEvent]?: EngineEventPayload[E][] } = {};
  const unfolds: UnfoldResult[] = [];
  const emit = <E extends EngineEvent>(event: E, payload: EngineEventPayload[E]) => {
    (events[event] ??= [] as never[]).push(payload as never);
  };
  const model = new EditorModel({
    emit,
    onUnfold: (r) => unfolds.push(r),
    fold: symmetricalTriangle,
    debounceMs,
  });
  return { model, events, unfolds };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('EditorModel — commit & events', () => {
  it('commits a valid path: emits validation/pathschange/historychange, previews after debounce', () => {
    const { model, events, unfolds } = makeModel();
    const ok = model.commit(INSIDE);

    expect(ok).toBe(true);
    expect(events.validation).toEqual([{ ok: true, messages: [] }]);
    expect(events.pathschange).toEqual([{ count: 1 }]);
    expect(events.historychange?.at(-1)).toEqual({ canUndo: true, canRedo: false });

    // Preview is debounced — nothing yet.
    expect(unfolds).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(unfolds).toHaveLength(1);
    expect(unfolds[0]!.copies).toHaveLength(8); // one cut × 8 symmetry copies
  });

  it('rejects an out-of-wedge path: validation fails, no path committed, no preview', () => {
    const { model, events, unfolds } = makeModel();
    const ok = model.commit(OUTSIDE);

    expect(ok).toBe(false);
    expect(events.validation?.at(-1)?.ok).toBe(false);
    expect(events.pathschange).toBeUndefined();
    expect(model.paths).toHaveLength(0);

    vi.advanceTimersByTime(100);
    expect(unfolds).toHaveLength(0);
  });

  it('clips a boundary-straddling path so all committed points stay in the wedge', () => {
    const { model } = makeModel();
    model.commit([
      { x: 0.3, y: 0.1 },
      { x: 0.1, y: 0.3 }, // outside — clipped away
      { x: 0.4, y: 0.2 },
    ]);
    expect(model.paths).toHaveLength(1);
    for (const p of model.paths[0]!) expect(pointInWedge(p, -1e-6, 45 + 1e-6)).toBe(true);
  });

  it('debounces: rapid commits coalesce into a single preview render', () => {
    const { model, unfolds } = makeModel();
    model.commit(INSIDE);
    vi.advanceTimersByTime(50);
    model.commit(INSIDE.map((p) => ({ x: p.x, y: p.y + 0.1 })));
    vi.advanceTimersByTime(50); // 100 since first, but only 50 since second → not fired yet
    expect(unfolds).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(unfolds).toHaveLength(1);
    expect(unfolds[0]!.copies).toHaveLength(16); // two cuts × 8
  });
});

describe('EditorModel — pencil sketch + eraser → scissors', () => {
  // Two enclosed cut-out areas a stub detector reports whenever the sketch is non-empty.
  const REGION_A: Point[] = [
    { x: 0.2, y: 0.04 },
    { x: 0.35, y: 0.04 },
    { x: 0.3, y: 0.12 },
  ];
  const REGION_B: Point[] = [
    { x: 0.4, y: 0.02 },
    { x: 0.48, y: 0.02 },
    { x: 0.44, y: 0.08 },
  ];
  const insideA: Point = { x: 0.283, y: 0.066 }; // ~centroid of REGION_A
  const A_LINE: Point[] = [
    { x: 0.18, y: 0.02 },
    { x: 0.37, y: 0.05 },
  ];
  /** Detector that returns the two fixed regions once any ink exists. */
  const twoRegions = (model: EditorModel) =>
    model.setDetector({ detect: (strokes) => (strokes.length ? [REGION_A, REGION_B] : []) });

  it('pencil adds an ink stroke that is NOT cut or previewed yet', () => {
    const { model, events, unfolds } = makeModel();
    const ok = model.drawStroke(A_LINE);

    expect(ok).toBe(true);
    expect(model.strokes).toHaveLength(1);
    expect(model.cuts).toHaveLength(0);
    expect(events.outlineschange?.at(-1)).toEqual({ count: 1 });
    expect(events.pathschange?.at(-1)).toEqual({ count: 0 }); // no committed cuts

    vi.advanceTimersByTime(100);
    expect(unfolds.at(-1)!.copies).toHaveLength(0); // the sketch never reaches the preview
  });

  it('rejects a degenerate (single-point) stroke', () => {
    const { model } = makeModel();
    expect(model.drawStroke([{ x: 0.2, y: 0.05 }])).toBe(false);
    expect(model.strokes).toHaveLength(0);
  });

  it('scissors at a point cuts only the enclosed area under it', () => {
    const { model, unfolds } = makeModel();
    twoRegions(model);
    model.drawStroke(A_LINE); // ink present → detector reports both regions
    expect(model.regions).toHaveLength(2);

    expect(model.cut(insideA)).toBe(true);
    expect(model.batches).toHaveLength(1); // only REGION_A committed

    vi.advanceTimersByTime(100);
    expect(unfolds.at(-1)!.copies).toHaveLength(8); // 1 cut × 8 symmetry copies
  });

  it('cutting dismisses the bounding sketch line; reverting restores it', () => {
    const { model } = makeModel();
    model.setDetector({ detect: (s) => (s.length ? [REGION_A] : []) });
    // A small loop fully inside REGION_A — the line that "bounds" the cut.
    const innerLoop = [
      { x: 0.27, y: 0.05 },
      { x: 0.31, y: 0.05 },
      { x: 0.29, y: 0.08 },
      { x: 0.27, y: 0.05 },
    ];
    model.drawStroke(innerLoop);
    expect(model.strokes).toHaveLength(1);

    model.cut(insideA);
    expect(model.batches).toHaveLength(1);
    expect(model.strokes).toHaveLength(0); // bounding line dismissed with the cut

    model.cut(insideA); // tap again → revert
    expect(model.batches).toHaveLength(0);
    expect(model.strokes).toHaveLength(1); // line restored
  });

  it('a dangling sketch line not enclosed by the cut survives', () => {
    const { model } = makeModel();
    model.setDetector({ detect: (s) => (s.length ? [REGION_A] : []) });
    model.drawStroke(A_LINE); // pokes outside REGION_A
    model.cut(insideA);
    expect(model.strokes).toHaveLength(1); // kept
  });

  it('tapping a cut area again reverts the cut (scissors toggle)', () => {
    const { model } = makeModel();
    twoRegions(model);
    model.drawStroke(A_LINE);
    expect(model.cut(insideA)).toBe(true); // cut REGION_A
    expect(model.batches).toHaveLength(1);

    expect(model.cut(insideA)).toBe(true); // tap again → revert
    expect(model.batches).toHaveLength(0);
  });

  it('a cut area drops out of the highlighted regions and is not re-cut by "Cut all"', () => {
    const { model } = makeModel();
    twoRegions(model);
    model.drawStroke(A_LINE);
    model.cut(insideA); // cut REGION_A
    expect(model.regions).toHaveLength(1); // only REGION_B still highlighted

    model.cut(); // Cut all → cuts only the remaining uncut area (B)
    expect(model.batches).toHaveLength(2);
  });

  it('scissors with no point cuts every detected area ("Cut all")', () => {
    const { model, unfolds } = makeModel();
    twoRegions(model);
    model.drawStroke(A_LINE);
    expect(model.cut()).toBe(true);
    expect(model.batches).toHaveLength(2); // both regions → two committed batches

    vi.advanceTimersByTime(100);
    expect(unfolds.at(-1)!.copies).toHaveLength(16); // 2 cuts × 8 copies
  });

  it('scissors outside every detected area cuts nothing', () => {
    const { model } = makeModel();
    twoRegions(model);
    model.drawStroke(A_LINE);
    expect(model.cut({ x: 0.49, y: 0.001 })).toBe(false);
    expect(model.batches).toHaveLength(0);
  });

  it('scissors with no enclosed areas cuts nothing', () => {
    const { model } = makeModel();
    twoRegions(model); // detector returns [] while the sketch is empty
    expect(model.regions).toHaveLength(0);
    expect(model.cut()).toBe(false);
    expect(model.batches).toHaveLength(0);
  });

  it('eraser trims ink strokes and never touches committed cuts', () => {
    const { model } = makeModel();
    twoRegions(model);
    model.commit(REGION_A); // one committed cut
    expect(model.batches).toHaveLength(1);

    // A 4-point ink line; rubbing the eraser over an interior point splits/trims it.
    model.drawStroke([
      { x: 0.1, y: 0 },
      { x: 0.2, y: 0 },
      { x: 0.3, y: 0 },
      { x: 0.4, y: 0 },
    ]);
    expect(model.strokes).toHaveLength(1);

    expect(model.erase([{ x: 0.2, y: 0 }])).toBe(true);
    // The committed cut is untouched; only the ink changed.
    expect(model.batches).toHaveLength(1);
    expect(model.strokes.flat().some((p) => p.x === 0.2)).toBe(false);
  });
});

describe('EditorModel — compositor injection', () => {
  it('routes cuts through an injected compositor for both composedContours and the preview', () => {
    const { model, unfolds } = makeModel();
    // Stub compositor: collapse any cuts to a single fixed triangle (stands in for the boolean merge).
    const merged: Point[] = [
      { x: 0.2, y: 0.05 },
      { x: 0.4, y: 0.05 },
      { x: 0.3, y: 0.2 },
    ];
    model.setCompositor({
      committed: (batches) => (batches.length ? [merged] : []),
    });

    model.commit(INSIDE);
    expect(model.composedContours).toEqual([merged]);
    vi.advanceTimersByTime(100);
    // Preview unfolds the COMPOSED region (1 contour × 8), not the raw cuts.
    expect(unfolds.at(-1)!.copies).toHaveLength(8);
  });

  it('falls back to raw cuts when no compositor is installed', () => {
    const { model } = makeModel();
    model.commit(INSIDE);
    expect(model.composedContours).toHaveLength(1);
    expect(model.composedContours[0]!.length).toBeGreaterThanOrEqual(3);
  });
});

describe('EditorModel — history', () => {
  it('undo/redo move through committed states and update history flags', () => {
    const { model, events } = makeModel();
    model.commit(INSIDE);
    expect(model.paths).toHaveLength(1);

    model.undo();
    expect(model.paths).toHaveLength(0);
    expect(model.canUndo).toBe(false);
    expect(model.canRedo).toBe(true);
    expect(events.historychange?.at(-1)).toEqual({ canUndo: false, canRedo: true });

    model.redo();
    expect(model.paths).toHaveLength(1);
    expect(model.canRedo).toBe(false);
  });

  it('committing after an undo truncates the redo tail', () => {
    const { model } = makeModel();
    model.commit(INSIDE);
    model.commit(INSIDE.map((p) => ({ x: p.x, y: p.y + 0.1 })));
    model.undo(); // back to 1 path
    expect(model.canRedo).toBe(true);
    model.commit(INSIDE.map((p) => ({ x: p.x + 0.02, y: p.y }))); // new branch
    expect(model.canRedo).toBe(false);
    expect(model.paths).toHaveLength(2);
  });

  it('clear() empties the cuts and is undoable', () => {
    const { model } = makeModel();
    model.commit(INSIDE);
    model.clear();
    expect(model.paths).toHaveLength(0);
    model.undo();
    expect(model.paths).toHaveLength(1);
  });
});
