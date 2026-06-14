/**
 * Cut-path validation (M2) — pure geometry, no Paper.js/DOM (dev-spec §2.3, §2.4, §3, gotcha §10.6).
 *
 * A "cut path" is a closed polygon (array of points in unit-square space) the user draws in the
 * editable wedge. Before it can be unfolded it must be: inside the wedge, snapped onto the fold
 * edges, closed, non-degenerate, and non-self-intersecting. This module does all of that on plain
 * data so the editor's view layer (Paper.js) stays a thin shell over testable logic.
 */

import type { FoldConfig } from './foldConfig';
import { snapPoint, type Point } from './geometry';

const DEG = Math.PI / 180;
/** On-boundary tolerance for clipping/area tests — looser than the snap ε, just float fuzz. */
const ON_LINE_EPS = 1e-12;

export interface ValidationResult {
  /** True iff the path can be committed (in-wedge, closed, simple, non-degenerate). */
  readonly ok: boolean;
  /** Human-readable reasons; empty when `ok`. UI surfaces these via the `validation` event. */
  readonly messages: readonly string[];
  /** The cleaned-up path (clipped to the wedge, then edge-snapped) when `ok`; otherwise `null`. */
  readonly path: readonly Point[] | null;
}

/** Shoelace signed area. Positive = counter-clockwise winding. */
export function signedArea(poly: readonly Point[]): number {
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Drop consecutive duplicate vertices (and a closing duplicate) so downstream area/clip math is
 *  well-behaved. Treats the polygon as implicitly closed. */
export function dedupeConsecutive(poly: readonly Point[], eps = 1e-9): Point[] {
  const out: Point[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < eps && Math.abs(last.y - p.y) < eps) continue;
    out.push({ x: p.x, y: p.y });
  }
  // Remove a trailing point equal to the first (explicit closing vertex).
  while (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.abs(first.x - last.x) < eps && Math.abs(first.y - last.y) < eps) out.pop();
    else break;
  }
  return out;
}

/**
 * Sutherland–Hodgman clip of a polygon against a single half-plane, expressed as a signed function
 * `inside(p)` (≥ 0 is kept, the boundary is where it's 0). Edges crossing the boundary get the exact
 * intersection inserted via linear interpolation of `inside`. The building block for every clip
 * below — wedge rays and the paper square alike.
 */
function clipHalfPlane(poly: readonly Point[], inside: (p: Point) => number): Point[] {
  if (poly.length === 0) return [];
  const out: Point[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const fa = inside(a);
    const fb = inside(b);
    const aIn = fa >= -ON_LINE_EPS;
    const bIn = fb >= -ON_LINE_EPS;
    if (aIn) out.push({ x: a.x, y: a.y });
    if (aIn !== bIn) {
      const u = fa / (fa - fb);
      out.push({ x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y) });
    }
  }
  return out;
}

/**
 * Clip a polygon against one half-plane bounded by a line **through the origin** at `dirDeg`.
 * `keep` selects which side survives: `'ccw'` keeps the half counter-clockwise of the ray direction
 * (cross(d, p) ≥ 0); `'cw'` keeps the clockwise half. Each wedge fold edge is such an origin line.
 */
export function clipHalfPlaneThroughOrigin(
  poly: readonly Point[],
  dirDeg: number,
  keep: 'ccw' | 'cw',
): Point[] {
  const t = dirDeg * DEG;
  const dx = Math.cos(t);
  const dy = Math.sin(t);
  const sign = keep === 'ccw' ? 1 : -1;
  // Signed distance off the line: >0 is counter-clockwise of the ray.
  return clipHalfPlane(poly, (p) => sign * (dx * p.y - dy * p.x));
}

/** Clip a polygon to the paper square [−half, half]² (half = 0.5 for the unit square). The wedge's
 *  open edge is the square boundary, so cuts may never poke past it — this is the "subtract the
 *  paper" rule (dev-spec §2.3–2.4). */
export function clipToSquare(poly: readonly Point[], half = 0.5): Point[] {
  let p = clipHalfPlane(poly, (q) => half - q.x); // x ≤ half (the open edge)
  p = clipHalfPlane(p, (q) => q.x + half); // x ≥ −half
  p = clipHalfPlane(p, (q) => half - q.y); // y ≤ half
  p = clipHalfPlane(p, (q) => q.y + half); // y ≥ −half
  return p;
}

/**
 * Clip a polygon to the editable wedge region: the angular sector θ ∈ [wedgeStart, wedgeEnd]
 * **and** the paper square. The sector is convex (≤180°), so it's the CCW side of the start ray
 * intersected with the CW side of the end ray; the square clip then trims anything past the open
 * edge so a cut can never enclose area outside the paper.
 */
export function clipToWedge(poly: readonly Point[], fold: FoldConfig): Point[] {
  let p = clipHalfPlaneThroughOrigin(poly, fold.wedgeStart, 'ccw');
  p = clipHalfPlaneThroughOrigin(p, fold.wedgeEnd, 'cw');
  return clipToSquare(p, 0.5);
}

/** Orientation of the ordered triplet (a, b, c): >0 ccw, <0 cw, 0 collinear. */
function cross3(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) - ON_LINE_EPS <= p.x &&
    p.x <= Math.max(a.x, b.x) + ON_LINE_EPS &&
    Math.min(a.y, b.y) - ON_LINE_EPS <= p.y &&
    p.y <= Math.max(a.y, b.y) + ON_LINE_EPS
  );
}

/** Do segments a1a2 and b1b2 properly cross (or touch)? Used for the self-intersection test. */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross3(b1, b2, a1);
  const d2 = cross3(b1, b2, a2);
  const d3 = cross3(a1, a2, b1);
  const d4 = cross3(a1, a2, b2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return true;
  if (Math.abs(d1) < ON_LINE_EPS && onSegment(b1, b2, a1)) return true;
  if (Math.abs(d2) < ON_LINE_EPS && onSegment(b1, b2, a2)) return true;
  if (Math.abs(d3) < ON_LINE_EPS && onSegment(a1, a2, b1)) return true;
  if (Math.abs(d4) < ON_LINE_EPS && onSegment(a1, a2, b2)) return true;
  return false;
}

/** Whether the closed polygon's edges cross each other (ignoring shared endpoints of adjacent
 *  edges). A simple O(n²) sweep — fine for the handful of segments a hand-drawn cut produces. */
export function isSelfIntersecting(poly: readonly Point[]): boolean {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i]!;
    const a2 = poly[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // Skip edges that share a vertex (adjacent, or the wrap-around pair).
      if (j === i) continue;
      if ((j + 1) % n === i || (i + 1) % n === j) continue;
      const b1 = poly[j]!;
      const b2 = poly[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/** Minimum area (unit-square units²) a cut must enclose to count as real rather than a stray dot. */
export const MIN_CUT_AREA = 1e-5;

/**
 * Validate and clean a raw drawn path against `fold`.
 *
 * Pipeline: dedupe → clip to the wedge (§2.4: "clip or reject") → snap onto the fold edges and
 * outer square (§2.3) → check it's still a closed, non-degenerate, simple polygon. Returns the
 * cleaned path on success, or `ok:false` with reasons. Never mutates the input.
 */
export function validatePath(
  rawPoints: readonly Point[],
  fold: FoldConfig,
  epsilon: number,
): ValidationResult {
  const messages: string[] = [];

  const deduped = dedupeConsecutive(rawPoints);
  if (deduped.length < 3) {
    return { ok: false, messages: ['Path needs at least 3 distinct points.'], path: null };
  }

  // Clip into the wedge sector. A path entirely outside collapses to nothing.
  const clipped = dedupeConsecutive(clipToWedge(deduped, fold));
  if (clipped.length < 3 || Math.abs(signedArea(clipped)) < MIN_CUT_AREA) {
    return { ok: false, messages: ['Path is outside the wedge.'], path: null };
  }

  // Snap edge-touching points onto the fold lines / outer square so seams merge without slivers.
  const foldEdgeAngles = [fold.wedgeStart, fold.wedgeEnd];
  const snapped = dedupeConsecutive(clipped.map((p) => snapPoint(p, foldEdgeAngles, 0.5, epsilon)));
  if (snapped.length < 3 || Math.abs(signedArea(snapped)) < MIN_CUT_AREA) {
    return { ok: false, messages: ['Path collapses after snapping to the edges.'], path: null };
  }

  if (isSelfIntersecting(snapped)) {
    return { ok: false, messages: ['Path self-intersects.'], path: null };
  }

  return { ok: true, messages, path: snapped };
}
