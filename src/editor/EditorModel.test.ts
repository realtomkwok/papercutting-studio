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

describe('EditorModel — pending design (pencil + eraser) → scissors', () => {
  // A second outline elsewhere in the wedge (well clear of INSIDE).
  const OTHER: Point[] = [
    { x: 0.4, y: 0.02 },
    { x: 0.48, y: 0.02 },
    { x: 0.44, y: 0.08 },
  ];
  const insideInside: Point = { x: 0.283, y: 0.066 }; // ~centroid of INSIDE

  it('pencil adds to the pending design, which is NOT cut or previewed yet', () => {
    const { model, events, unfolds } = makeModel();
    const ok = model.drawOutline(INSIDE);

    expect(ok).toBe(true);
    expect(model.pending).toHaveLength(1);
    expect(model.pending[0]!.kind).toBe('add');
    expect(model.cuts).toHaveLength(0);
    expect(events.outlineschange?.at(-1)).toEqual({ count: 1 });
    expect(events.pathschange?.at(-1)).toEqual({ count: 0 }); // no committed cuts

    vi.advanceTimersByTime(100);
    expect(unfolds.at(-1)!.copies).toHaveLength(0); // the pending design never reaches the preview
  });

  it('scissors with no point commits the pending design as one batch', () => {
    const { model, unfolds } = makeModel();
    model.drawOutline(INSIDE);
    model.drawOutline(OTHER);
    expect(model.cut()).toBe(true);
    expect(model.pending).toHaveLength(0);
    expect(model.batches).toHaveLength(1); // both pencil strokes → one committed batch

    vi.advanceTimersByTime(100);
    expect(unfolds.at(-1)!.copies).toHaveLength(16); // 2 design pieces × 8 symmetry copies
  });

  it('scissors at a point inside the design commits the whole design', () => {
    const { model } = makeModel();
    model.drawOutline(INSIDE);
    model.drawOutline(OTHER);
    expect(model.cut(insideInside)).toBe(true);
    expect(model.batches).toHaveLength(1);
    expect(model.pending).toHaveLength(0); // the entire design is committed, not just one piece
  });

  it('scissors outside the pending design cuts nothing', () => {
    const { model } = makeModel();
    model.drawOutline(INSIDE);
    expect(model.cut({ x: 0.49, y: 0.001 })).toBe(false);
    expect(model.batches).toHaveLength(0);
    expect(model.pending).toHaveLength(1);
  });

  it('eraser subtracts from the pending design and never touches committed cuts', () => {
    const { model } = makeModel();
    // Stub compositor that records what each layer receives.
    let designKinds: string[] = [];
    let committedBatchSizes: number[] = [];
    model.setCompositor({
      design: (ops) => {
        designKinds = ops.map((o) => o.kind);
        return ops.filter((o) => o.kind === 'add').map((o) => o.poly.map((p) => ({ x: p.x, y: p.y })));
      },
      committed: (batches) => {
        committedBatchSizes = batches.map((b) => b.length);
        return batches.flatMap((b) =>
          b.filter((o) => o.kind === 'add').map((o) => o.poly.map((p) => ({ x: p.x, y: p.y }))),
        );
      },
    });

    model.commit(INSIDE); // one committed batch
    expect(model.batches).toHaveLength(1);

    // Build a new pending design: pencil add then eraser subtract — both land in `design`, the
    // committed layer is untouched (still one batch of one op).
    model.drawOutline(OTHER);
    expect(model.erase(OTHER)).toBe(true);
    expect(model.pending.map((o) => o.kind)).toEqual(['add', 'subtract']);
    expect(designKinds).toEqual(['add', 'subtract']);
    expect(committedBatchSizes).toEqual([1]); // the eraser never reached the committed layer
  });

  it('a committed cut is never restored by a later design eraser (committed batches are unioned)', () => {
    const { model, unfolds } = makeModel();
    let committedBatchCount = 0;
    model.setCompositor({
      design: () => [],
      committed: (batches) => {
        committedBatchCount = batches.length;
        return batches.flatMap((b) =>
          b.filter((o) => o.kind === 'add').map((o) => o.poly.map((p) => ({ x: p.x, y: p.y }))),
        );
      },
    });

    model.commit(INSIDE); // committed cut
    // New design that erases over the committed area, then commit it.
    model.drawOutline(OTHER);
    model.erase(INSIDE);
    model.cut();
    expect(committedBatchCount).toBe(2); // two independent batches, unioned (no cross-batch restore)

    vi.advanceTimersByTime(100);
    // The stub keeps both batches' adds (INSIDE + OTHER) → 2 cuts × 8 copies; the eraser is internal.
    expect(unfolds.at(-1)!.copies).toHaveLength(16);
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
      design: (ops) => (ops.length ? [merged] : []),
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
