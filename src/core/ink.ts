/**
 * Pencil-ink model (sketch layer) — pure geometry, no Paper.js/DOM.
 *
 * The pencil now lays down *open polylines* (a draft sketch on the folded paper), not closed lasso
 * regions. The eraser rubs that ink out. The scissors later interpret the sketch into enclosed
 * cut-out areas (see `bridge/RegionDetector`). This module owns the plain-data side of that ink:
 * cleaning a freshly drawn stroke and erasing portions of existing strokes.
 *
 * Coordinate frame: unit square x,y ∈ [−0.5, 0.5] (same as every other module). A `Stroke` is an
 * ordered list of points; ≥2 points to be a line. Strokes are never implicitly closed.
 */

import type { Point } from './geometry';

/** One pencil stroke: an open polyline of ≥2 points in unit space. */
export type Stroke = readonly Point[];

/** Drop consecutive near-duplicate points from a freehand stroke (it stays open — no wrap-around
 *  dedupe like a polygon). Returns a fresh array; may be shorter than 2 if the input was a dot. */
export function cleanStroke(raw: Stroke, eps = 1e-4): Point[] {
  const out: Point[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < eps && Math.abs(last.y - p.y) < eps) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Squared distance from point `p` to the segment ab (0 when ab degenerates to a point). */
function distSqToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ex = p.x - cx;
  const ey = p.y - cy;
  return ex * ex + ey * ey;
}

/** Minimum distance from `p` to an eraser polyline (its vertices treated as connected segments). */
function distToPolyline(p: Point, poly: Stroke): number {
  if (poly.length === 0) return Infinity;
  if (poly.length === 1) {
    const a = poly[0]!;
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const d = distSqToSegment(p, poly[i]!, poly[i + 1]!);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Erase ink: rub the `eraser` polyline (with the given `radius`, in unit-square units) over every
 * stroke, dropping the vertices it touches and splitting each stroke into the surviving runs.
 *
 * A stroke that the eraser cuts in two becomes two strokes; runs that fall below 2 points vanish.
 * Pure — returns a fresh stroke array, input untouched. This is what makes the eraser "clear what
 * the pencil makes" rather than subtract a region from the cuts.
 */
export function eraseStrokes(strokes: readonly Stroke[], eraser: Stroke, radius: number): Stroke[] {
  const out: Stroke[] = [];
  for (const stroke of strokes) {
    let run: Point[] = [];
    for (const p of stroke) {
      if (distToPolyline(p, eraser) <= radius) {
        // This vertex is rubbed out — end the current run.
        if (run.length >= 2) out.push(run);
        run = [];
      } else {
        run.push({ x: p.x, y: p.y });
      }
    }
    if (run.length >= 2) out.push(run);
  }
  return out;
}
