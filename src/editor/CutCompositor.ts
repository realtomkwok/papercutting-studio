/**
 * CutCompositor (M2) — turns drawn design ops into the actual *removed* region of the wedge, the way
 * real folded paper behaves (dev-spec §2.4, §8 acceptance "single connected piece").
 *
 * Two jobs, mirroring the editor's two layers:
 *  - {@link design} composes one *pending design* — the dotted shape the pencil (`add`) and eraser
 *    (`subtract`) build up in order — into its literal contours. No wedge clip, no keep-largest: it's
 *    just what the user has drawn, holes and all.
 *  - {@link committed} composes the *committed cut batches*. Each batch is composed independently
 *    (so its internal eraser notches survive as holes), the batch regions are **unioned** (a cut only
 *    ever removes more paper — a later batch can't restore an earlier one), then the surviving paper
 *    is reduced to its **largest connected piece**; the rest falls away as a real cut would drop it.
 *
 * Returns removed regions as plain contour polygons (outer boundaries + island boundaries), which the
 * unfold engine reflects and the renderers fill with the even–odd rule.
 *
 * This is the Paper.js boolean boundary the spec reserves for validation/compose (§4); `core/` stays
 * pure. Operates entirely in unit-square coordinates (scaled up internally for boolean robustness).
 */

import paper from 'paper';
import type { Point } from '../core/geometry';
import type { DesignOp } from './EditorModel';

type Ops = readonly DesignOp[];

/** Booleans are tuned for screen-pixel magnitudes; unit coords (~0.5) are too small, so scale up. */
const SCALE = 1000;
const MIN_AREA = 1e-9;

export class CutCompositor {
  constructor(
    private readonly scope: paper.PaperScope,
    /** Wedge outline (unit space) used to clip cuts and run the keep-largest rule. */
    private readonly wedge: () => readonly Point[],
  ) {}

  /** Compose the pending design's add/subtract `ops` into its literal contours (the dotted shape). */
  design(ops: Ops): Point[][] {
    if (ops.length === 0) return [];
    this.scope.activate();
    const scratch = new paper.Layer();
    try {
      const region = this.regionFromOps(ops);
      return region ? this.contours(region) : [];
    } finally {
      scratch.remove();
    }
  }

  /**
   * Compose the committed cut `batches` against the wedge. Each batch becomes a region (its own
   * add/subtract applied in order), the regions are unioned, then the surviving paper is reduced to
   * its largest connected piece. Returns the removed-region contours in unit space; [] if nothing is
   * removed.
   */
  committed(batches: readonly Ops[]): Point[][] {
    if (batches.length === 0) return [];
    this.scope.activate();
    const scratch = new paper.Layer();
    try {
      let removedSource: paper.PathItem | null = null;
      for (const batch of batches) {
        const region = this.regionFromOps(batch);
        if (!region) continue;
        removedSource = removedSource ? removedSource.unite(region) : region;
      }
      if (!removedSource) return [];

      // Surviving paper = wedge − removed; keep only its largest connected piece.
      const wedgePath = this.toPath(this.wedge());
      const paperRegion = wedgePath.subtract(removedSource);
      const kept = this.largestPiece(paperRegion);
      // Removed = everything in the wedge that isn't the kept paper (cuts + fallen-off bits).
      const removed = kept ? wedgePath.subtract(kept) : wedgePath;
      return this.contours(removed);
    } finally {
      scratch.remove();
    }
  }

  /** Apply one batch/design's ordered ops: `add` unites into the region, `subtract` carves it out. */
  private regionFromOps(ops: Ops): paper.PathItem | null {
    let region: paper.PathItem | null = null;
    for (const op of ops) {
      if (op.poly.length < 3) continue;
      const piece = this.toPath(op.poly);
      if (op.kind === 'add') {
        region = region ? region.unite(piece) : piece;
      } else if (region) {
        region = region.subtract(piece);
      }
    }
    return region;
  }

  private toPath(pts: readonly Point[]): paper.Path {
    return new paper.Path({
      segments: pts.map((p) => new paper.Point(p.x * SCALE, p.y * SCALE)),
      closed: true,
    });
  }

  /** The largest connected piece of a (possibly multi-contour) region, with its holes. A single
   *  `Path` is already one piece; a `CompoundPath` may hold several disconnected outers. */
  private largestPiece(region: paper.PathItem): paper.PathItem | null {
    if (!(region instanceof paper.CompoundPath)) {
      return Math.abs((region as paper.Path).area) > MIN_AREA ? region : null;
    }
    const children = (region.children as paper.Path[]).filter((c) => Math.abs(c.area) > MIN_AREA);
    // Outers are contours not contained in any other; the rest are holes/islands.
    const outers = children.filter(
      (c) => !children.some((o) => o !== c && o.contains(c.bounds.center)),
    );
    if (outers.length <= 1) return region; // one piece (possibly with holes) → keep as-is

    let best: paper.Path | null = null;
    let bestHoles: paper.Path[] = [];
    let bestArea = -Infinity;
    for (const o of outers) {
      const holes = children.filter((h) => h !== o && o.contains(h.bounds.center));
      const net = Math.abs(o.area) - holes.reduce((s, h) => s + Math.abs(h.area), 0);
      if (net > bestArea) {
        bestArea = net;
        best = o;
        bestHoles = holes;
      }
    }
    if (!best) return null;
    return new paper.CompoundPath({ children: [best.clone(), ...bestHoles.map((h) => h.clone())] });
  }

  /** Flatten a region to its contour polygons in unit space. Boolean results of polygons are
   *  themselves polygons (straight segments), so reading anchors is exact. */
  private contours(region: paper.PathItem): Point[][] {
    const paths =
      region instanceof paper.CompoundPath
        ? (region.children as paper.Path[])
        : [region as paper.Path];
    return paths
      .filter((p) => p.segments.length >= 3 && Math.abs(p.area) > MIN_AREA)
      .map((p) => p.segments.map((s) => ({ x: s.point.x / SCALE, y: s.point.y / SCALE })));
  }
}
