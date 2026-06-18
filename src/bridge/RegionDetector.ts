/**
 * RegionDetector (scissors) — turns the pencil sketch into cut-out candidates by flood fill.
 *
 * Real paper-cutting: you sketch lines, then cut out the areas the lines enclose. This detector
 * does exactly that. It rasterises the wedge interior plus the ink strokes (as thin walls), floods
 * inward from the **open edge** (the outer rim of the folded stack), and reports every interior
 * face the flood can't reach — those are the areas sealed off by pencil lines, i.e. the pieces that
 * fall out when cut. Each face is traced back to a unit-space contour the editor highlights and the
 * model commits as a cut.
 *
 * Why the open edge and not the whole wedge boundary: across a *fold* edge is a mirrored copy of the
 * paper, not empty space, so a fold edge is a wall — a region bounded by ink and fold edges is still
 * enclosed. Only the open edge is genuinely "outside", so that's the single seed.
 *
 * This is a bridge concern (raster ↔ vector); `core/` stays pure. The grid helpers below are pure
 * and unit-tested; only {@link RegionDetector.detect} touches a canvas.
 */

import { boundaryPointAtAngle, pointInWedge, type Point } from '../core/geometry';
import type { FoldConfig } from '../core/foldConfig';

const INTERIOR = 1; // inside the wedge, not ink
const WALL = 2; // ink, or outside the wedge
export interface RegionDetectorOptions {
  /** Raster size for the longer side of the wedge bounding box (px). */
  readonly resolution?: number;
  /** Ink wall half-thickness (px) — wider closes small gaps in a sketchy line. */
  readonly wallPx?: number;
  /** Minimum face area (px²) to report, filtering specks. */
  readonly minAreaPx?: number;
  /** Douglas–Peucker simplification tolerance (px) for the traced contours. */
  readonly simplifyPx?: number;
  /** Initial cut-fit margin (unit-square units) added to the wall-recovering dilation. 0 hugs the
   *  pencil-line centerline; negative insets the cut; positive grows it past the line. */
  readonly cutMargin?: number;
  /** How close (unit-square units) a stroke endpoint must come to a paper edge to seal against it. */
  readonly edgeSnap?: number;
}

/** Label connected components of cells equal to `target` (4-connectivity). Returns a label grid
 *  (0 = not target) and the per-label pixel counts (index 0 unused). */
export function labelComponents(
  grid: Uint8Array,
  w: number,
  h: number,
  target: number,
): { labels: Int32Array; areas: number[] } {
  const labels = new Int32Array(w * h);
  const areas: number[] = [0];
  let next = 1;
  const stack: number[] = [];
  for (let s = 0; s < grid.length; s++) {
    if (grid[s] !== target || labels[s] !== 0) continue;
    const label = next++;
    let area = 0;
    stack.push(s);
    labels[s] = label;
    while (stack.length) {
      const i = stack.pop()!;
      area++;
      const x = i % w;
      const y = (i / w) | 0;
      const tryCell = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const ni = ny * w + nx;
        if (grid[ni] === target && labels[ni] === 0) {
          labels[ni] = label;
          stack.push(ni);
        }
      };
      tryCell(x - 1, y);
      tryCell(x + 1, y);
      tryCell(x, y - 1);
      tryCell(x, y + 1);
    }
    areas.push(area);
  }
  return { labels, areas };
}

/**
 * Moore-neighbour boundary trace of one labelled blob, returning its outer contour as an ordered
 * ring of pixel corner points (clockwise). Robust enough for hand-drawn faces; holes are ignored
 * (a cut region's holes come from other faces detected separately).
 */
export function traceBlob(labels: Int32Array, w: number, h: number, label: number): Point[] {
  const isSet = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === label;

  // Find the top-left-most set pixel as the start.
  let start = -1;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === label) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];
  const sx = start % w;
  const sy = (start / w) | 0;

  // 8-neighbour offsets, clockwise from east.
  const N = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ] as const;

  const ring: Point[] = [];
  let cx = sx;
  let cy = sy;
  let dir = 6; // start looking "north"; first set neighbour found going clockwise
  const maxSteps = 8 * (w * h);
  for (let step = 0; step < maxSteps; step++) {
    ring.push({ x: cx, y: cy });
    let found = false;
    // Begin search from the back-left of the incoming direction.
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8;
      const nx = cx + N[d]![0];
      const ny = cy + N[d]![1];
      if (isSet(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = d;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel
    if (cx === sx && cy === sy && ring.length > 1) break;
  }
  return ring;
}

/**
 * Disk-dilate the set cells of `src` by radius `r` px and keep only cells also set in `clip`.
 * Uses a two-pass chamfer distance transform (orthogonal 1, diagonal √2). Returns a fresh 0/1 mask.
 *
 * The detector dilates each enclosed face by ~the ink wall thickness so the cut hugs the pencil-line
 * *centerline* instead of sitting inset at the wall's inner edge — and so two faces split only by a
 * thin pencil line grow until they touch and merge into a single cut. `clip` (the in-wedge mask)
 * stops growth from leaking past the wedge boundary.
 */
export function dilateMask(
  src: Uint8Array,
  clip: Uint8Array,
  w: number,
  h: number,
  r: number,
): Uint8Array {
  const INF = 1e9;
  const D2 = Math.SQRT2;
  const dist = new Float64Array(w * h);
  for (let i = 0; i < dist.length; i++) dist[i] = src[i] ? 0 : INF;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) d = Math.min(d, dist[i - w] + 1);
      if (x > 0 && y > 0) d = Math.min(d, dist[i - w - 1] + D2);
      if (x < w - 1 && y > 0) d = Math.min(d, dist[i - w + 1] + D2);
      dist[i] = d;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let d = dist[i];
      if (x < w - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < h - 1) d = Math.min(d, dist[i + w] + 1);
      if (x < w - 1 && y < h - 1) d = Math.min(d, dist[i + w + 1] + D2);
      if (x > 0 && y < h - 1) d = Math.min(d, dist[i + w - 1] + D2);
      dist[i] = d;
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = dist[i] <= r && clip[i] ? 1 : 0;
  return out;
}

/** Douglas–Peucker polyline simplification (open path). */
export function simplifyPath(pts: Point[], tol: number): Point[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const pa = pts[a]!;
    const pb = pts[b]!;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distSqToSeg(pts[i]!, pa, pb);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol * tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]!);
  return out;
}

function distSqToSeg(p: Point, a: Point, b: Point): number {
  const c = closestOnSeg(p, a, b);
  const ex = p.x - c.x;
  const ey = p.y - c.y;
  return ex * ex + ey * ey;
}

/** Closest point on segment ab to p. */
function closestOnSeg(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * Extend a stroke's free endpoints onto a nearby wedge edge so a line drawn *toward* the paper edge
 * seals against it — letting the edge close an enclosed area (user request). An endpoint within
 * `snap` (unit-square units) of any wedge edge gets the projection onto that edge appended past it,
 * so the rasterised wall actually touches the boundary instead of leaving a gap the flood leaks through.
 */
export function extendStrokeToWedge(stroke: readonly Point[], wedge: readonly Point[], snap: number): Point[] {
  const out = stroke.map((p) => ({ x: p.x, y: p.y }));
  if (out.length < 2) return out;
  const edges: [Point, Point][] = [
    [wedge[0]!, wedge[1]!],
    [wedge[0]!, wedge[2]!],
    [wedge[1]!, wedge[2]!],
  ];
  const project = (p: Point): Point | null => {
    let best: Point | null = null;
    let bestD = snap * snap;
    for (const [a, b] of edges) {
      const c = closestOnSeg(p, a, b);
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };
  const endProj = project(out[out.length - 1]!);
  const startProj = project(out[0]!);
  if (endProj) out.push(endProj);
  if (startProj) out.unshift(startProj);
  return out;
}

export class RegionDetector {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly opts: Required<RegionDetectorOptions>;
  /** Live cut-fit margin (unit-square units), driven by the scissors slider. */
  private cutMargin: number;

  constructor(opts: RegionDetectorOptions = {}) {
    this.opts = {
      resolution: opts.resolution ?? 280,
      wallPx: opts.wallPx ?? 3,
      minAreaPx: opts.minAreaPx ?? 24,
      simplifyPx: opts.simplifyPx ?? 1.6,
      cutMargin: opts.cutMargin ?? 0,
      edgeSnap: opts.edgeSnap ?? 0.04,
    };
    this.cutMargin = this.opts.cutMargin;
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('RegionDetector: 2D context unavailable');
    this.ctx = ctx;
  }

  /** Set the cut-fit margin (unit-square units) the scissors slider controls; re-detect to apply. */
  setCutMargin(margin: number): void {
    this.cutMargin = margin;
  }

  /**
   * Detect the enclosed cut-out areas of the current sketch. Returns one contour polygon per
   * enclosed face (unit space), ready to validate + commit. Empty when nothing is enclosed yet.
   */
  detect(strokes: readonly (readonly Point[])[], fold: FoldConfig): Point[][] {
    const wedge = wedgeVertices(fold);

    // Frame the wedge bbox into the raster with a small pixel pad.
    const xs = wedge.map((v) => v.x);
    const ys = wedge.map((v) => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bw = Math.max(maxX - minX, 1e-6);
    const bh = Math.max(maxY - minY, 1e-6);
    const pad = this.opts.wallPx + 2;
    const res = this.opts.resolution;
    const scale = (res - 2 * pad) / Math.max(bw, bh);
    const W = Math.max(1, Math.round(bw * scale + 2 * pad));
    const H = Math.max(1, Math.round(bh * scale + 2 * pad));

    // unit → raster (y flips: unit is math-up, raster is y-down).
    const toPx = (p: Point) => ({
      x: (p.x - minX) * scale + pad,
      y: (maxY - p.y) * scale + pad,
    });
    // raster → unit (inverse of the above).
    const toUnit = (x: number, y: number): Point => ({
      x: (x - pad) / scale + minX,
      y: maxY - (y - pad) / scale,
    });

    const ctx = this.ctx;
    this.canvas.width = W;
    this.canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    // 1) Wedge interior in white.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    wedge.forEach((v, i) => {
      const q = toPx(v);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.fill();

    // 2) Ink strokes in black (the walls). Endpoints near a paper edge are first extended onto it so
    // a line drawn to the edge seals against it and the edge can close an enclosed area.
    ctx.strokeStyle = '#000';
    ctx.lineWidth = this.opts.wallPx * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const raw of strokes) {
      const stroke = extendStrokeToWedge(raw, wedge, this.opts.edgeSnap);
      if (stroke.length < 2) continue;
      ctx.beginPath();
      stroke.forEach((p, i) => {
        const q = toPx(p);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();
    }

    // 3) Classify cells. interior = white & not-ink; wall = ink or outside wedge.
    const img = ctx.getImageData(0, 0, W, H).data;
    const grid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = img[i * 4]!;
      const g = img[i * 4 + 1]!;
      const a = img[i * 4 + 3]!;
      // White interior: high luminance + opaque. Ink darkens it; outside is transparent.
      grid[i] = a > 8 && r > 160 && g > 160 ? INTERIOR : WALL;
    }

    // In-wedge mask (independent of ink) — the clip that stops dilation leaking past the wedge.
    const inWedge = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = toUnit(x + 0.5, y + 0.5);
        if (
          pointInWedge(p, fold.wedgeStart, fold.wedgeEnd) &&
          Math.abs(p.x) <= 0.5 + 1e-6 &&
          Math.abs(p.y) <= 0.5 + 1e-6
        ) {
          inWedge[y * W + x] = 1;
        }
      }
    }

    // 4) Label every face the ink carves (4-connected interior cells; walls separate them).
    const faces = labelComponents(grid, W, H, INTERIOR);

    // 5) The paper *body* — the largest face touching the open edge (cornerStart → cornerEnd) — stays.
    // Every other face is a cut candidate: ones sealed by fold edges, AND ones a line carves off
    // against the open edge (so an open path running from the open edge to a fold edge encloses a
    // piece). Simple loops still work: the big outside face is the body, the loop interior the cut.
    const openA = toPx(wedge[1]!);
    const openB = toPx(wedge[2]!);
    const band2 = (this.opts.wallPx + 1.5) ** 2;
    const touchesOpen = new Uint8Array(faces.areas.length);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const lab = faces.labels[y * W + x]!;
        if (lab === 0 || touchesOpen[lab]) continue;
        if (distSqToSeg({ x, y }, openA, openB) <= band2) touchesOpen[lab] = 1;
      }
    }
    let body = -1;
    let bodyArea = -1;
    for (let lab = 1; lab < faces.areas.length; lab++) {
      if (touchesOpen[lab] && faces.areas[lab]! > bodyArea) {
        bodyArea = faces.areas[lab]!;
        body = lab;
      }
    }
    if (body < 0) {
      // No face reaches the open edge — fall back to the largest face overall as the body.
      for (let lab = 1; lab < faces.areas.length; lab++) {
        if (faces.areas[lab]! > bodyArea) {
          bodyArea = faces.areas[lab]!;
          body = lab;
        }
      }
    }

    const enclosed = new Uint8Array(W * H);
    for (let i = 0; i < grid.length; i++) {
      const lab = faces.labels[i]!;
      if (lab !== 0 && lab !== body) enclosed[i] = 1;
    }

    // 6) Dilate each enclosed face back out to the pencil-line centerline (wallPx) plus the user's
    // fit margin. This hugs the line and merges faces split only by a single pencil stroke, so the
    // pencilled shape cuts as one whole. Clipped to the wedge so it can't grow past the boundary.
    const r = Math.max(0, this.opts.wallPx + 0.75 + this.cutMargin * scale);
    const grown = dilateMask(enclosed, inWedge, W, H, r);

    const { labels, areas } = labelComponents(grown, W, H, 1);
    const out: Point[][] = [];
    for (let label = 1; label < areas.length; label++) {
      if (areas[label]! < this.opts.minAreaPx) continue;
      const ring = traceBlob(labels, W, H, label);
      const simplified = simplifyPath(ring, this.opts.simplifyPx);
      if (simplified.length < 3) continue;
      out.push(simplified.map((q) => toUnit(q.x, q.y)));
    }
    return out;
  }

  dispose(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}

/** Wedge outline (unit space): apex + the two outer-edge corners. Mirrors WedgeEditor/Engine. */
function wedgeVertices(fold: FoldConfig): Point[] {
  return [
    { x: 0, y: 0 },
    boundaryPointAtAngle(fold.wedgeStart, 0.5),
    boundaryPointAtAngle(fold.wedgeEnd, 0.5),
  ];
}
