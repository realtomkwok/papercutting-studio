/**
 * Unfold engine (M1) — wedge cut paths + foldConfig → unfolded copy set + crease segments.
 *
 * Pure TypeScript, framework-agnostic: plain path data in (arrays of points in unit-square space),
 * plain data out. No DOM, no Paper.js, no Three.js (dev-spec §3, gotcha §10.6). The boolean
 * `unite`/`subtract` that merges overlapping copies into a single contour happens later at the
 * render boundary (Paper.js, M2/M3); this module only does the reflection math and crease parity.
 */

import { symmetricalTriangle, type FoldConfig } from './foldConfig';
import {
  applyMat,
  boundaryPointAtAngle,
  generateCopies,
  snapPoint,
  type CopyTransform,
  type Point,
} from './geometry';

export type CreaseType = 'mountain' | 'valley';

/** A fold crease in the unfolded paper: a spoke from the origin out to the square boundary.
 *  `t0`/`t1` are unused in M1 (full spoke); reserved for cut-interrupted partial creases later. */
export interface CreaseSegment {
  /** Direction of the spoke, degrees CCW from +x, in [0, 360). */
  readonly angleDeg: number;
  readonly from: Point;
  readonly to: Point;
  readonly type: CreaseType;
}

/** One symmetry copy of one input path: the transform that produced it + the transformed points. */
export interface UnfoldedPath {
  readonly transform: CopyTransform;
  readonly points: readonly Point[];
}

export interface UnfoldResult {
  readonly copies: readonly UnfoldedPath[];
  readonly creases: readonly CreaseSegment[];
}

/** ε = 0.5% of paper size (dev-spec §2.3). Half-extent of the unit square. */
export const DEFAULT_EPSILON = 0.005;
const OUTER_HALF_EXTENT = 0.5;

/**
 * Unfold `wedgePaths` (closed polylines in the editable wedge, unit-square coords) into the full
 * symmetric pattern under `fold`.
 *
 * Steps: (1) snap edge-touching points onto the wedge fold edges and the outer square so seams
 * merge without slivers (§2.3); (2) generate the copy transforms by reflect-and-double; (3) apply
 * every transform to every snapped path; (4) emit the crease star.
 */
export function unfold(
  wedgePaths: readonly (readonly Point[])[],
  fold: FoldConfig = symmetricalTriangle,
  epsilon: number = DEFAULT_EPSILON,
): UnfoldResult {
  // 1. Snap onto the wedge's two-fold edges (its boundary rays) and the outer square edge.
  const foldEdgeAngles = [fold.wedgeStart, fold.wedgeEnd];
  const snapped = wedgePaths.map((path) =>
    path.map((p) => snapPoint(p, foldEdgeAngles, OUTER_HALF_EXTENT, epsilon)),
  );

  // 2. Reflect-and-double in reverse fold order (innermost/last fold opens first).
  const reversedFoldAngles = fold.foldLines.map((l) => l.angle).reverse();
  const transforms = generateCopies(reversedFoldAngles);

  // 3. Every transform applied to every snapped path → the full copy set.
  const copies: UnfoldedPath[] = [];
  for (const transform of transforms) {
    for (const path of snapped) {
      copies.push({ transform, points: path.map((p) => applyMat(transform.mat, p)) });
    }
  }

  // 4. Crease spokes with alternating mountain/valley parity.
  const creases = generateCreases(fold);

  return { copies, creases };
}

/**
 * The crease star: the wedge boundary rays tiled around the origin. With wedge angle α the seams
 * fall at every multiple of α (8 spokes at 0/45/.../315 for the symmetrical triangle), and the
 * fold character alternates around the star (dev-spec worked-example §1).
 *
 * Parity is `mountain` on even spokes, `valley` on odd. Adjacent spokes always differ; the
 * absolute mountain/valley choice is a convention the renderer may flip globally. For the
 * symmetrical triangle this lands the axis folds (0°/90°/180°/270°) as mountains and the diagonal
 * folds (45°/135°/225°/315°) as valleys — each physical fold line keeps one consistent type, as
 * real folded paper does.
 */
export function generateCreases(fold: FoldConfig): readonly CreaseSegment[] {
  const spokeCount = Math.round(360 / fold.wedgeAngle);
  const out: CreaseSegment[] = [];
  for (let i = 0; i < spokeCount; i++) {
    const angleDeg = i * fold.wedgeAngle;
    out.push({
      angleDeg,
      from: { x: 0, y: 0 },
      to: boundaryPointAtAngle(angleDeg, OUTER_HALF_EXTENT),
      type: i % 2 === 0 ? 'mountain' : 'valley',
    });
  }
  return out;
}
