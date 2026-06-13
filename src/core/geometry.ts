/**
 * Pure geometry primitives for the unfold engine.
 *
 * Coordinate frame: unit square centred at origin, x,y ∈ [−0.5, 0.5]. Shared with
 * the Paper.js editor space and Three.js UVs (dev-spec §2.1). No DOM, paper, or three
 * imports — this file is unit-tested in isolation.
 */

export interface Point {
  x: number;
  y: number;
}

/** 2×2 matrix in row-major order: [[a, b], [c, d]]. */
export type Mat2 = readonly [readonly [number, number], readonly [number, number]];

/** An affine transform applied via `mat` then `(mirror ? reflect-y : identity)` is too brittle
 *  — instead, a Mat2 alone is enough for every reflection/rotation around the origin (orthogonal
 *  group O(2)). Translation isn't needed since every fold line passes through the centre. */
export interface CopyTransform {
  /** Human label for debugging / tests, e.g. "rot0", "rot90·mirror". */
  readonly id: string;
  /** Rotation angle component in degrees (modulo mirror). Useful for tests/assertions. */
  readonly rotationDeg: number;
  /** Whether the transform includes a reflection (det = −1). */
  readonly mirror: boolean;
  readonly mat: Mat2;
}

const DEG = Math.PI / 180;

/**
 * Reflection across a line through the origin at angle `thetaDeg` (measured CCW from +x).
 * R(θ) = [[cos2θ, sin2θ], [sin2θ, −cos2θ]] (dev-spec §2.2).
 */
export function reflectionMatrix(thetaDeg: number): Mat2 {
  const two = 2 * thetaDeg * DEG;
  const c = Math.cos(two);
  const s = Math.sin(two);
  return [
    [c, s],
    [s, -c],
  ];
}

/** Rotation by `thetaDeg` (CCW). */
export function rotationMatrix(thetaDeg: number): Mat2 {
  const t = thetaDeg * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [
    [c, -s],
    [s, c],
  ];
}

export function applyMat(m: Mat2, p: Point): Point {
  return {
    x: m[0][0] * p.x + m[0][1] * p.y,
    y: m[1][0] * p.x + m[1][1] * p.y,
  };
}

export function multiplyMat(a: Mat2, b: Mat2): Mat2 {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
  ];
}

/**
 * Snap a point to its nearest fold line (or outer-square edge) if within ε.
 *
 * - `foldAnglesDeg`: lines through the origin (each represented once; the line and its
 *   180°-opposite are the same line).
 * - `outerHalfExtent`: distance from origin to the outer square edges (0.5 for the unit square).
 * - `epsilon`: snap radius in unit-square coords (dev-spec §2.3 suggests 0.005 = 0.5%).
 *
 * Snapping is deliberately point-wise and idempotent: re-snapping a snapped point returns it
 * unchanged. Returns a new point object; never mutates the input.
 */
export function snapPoint(
  p: Point,
  foldAnglesDeg: readonly number[],
  outerHalfExtent: number,
  epsilon: number,
): Point {
  let { x, y } = p;

  // Outer-square edges first: pull onto whichever side is within ε.
  if (Math.abs(x - outerHalfExtent) < epsilon) x = outerHalfExtent;
  else if (Math.abs(x + outerHalfExtent) < epsilon) x = -outerHalfExtent;
  if (Math.abs(y - outerHalfExtent) < epsilon) y = outerHalfExtent;
  else if (Math.abs(y + outerHalfExtent) < epsilon) y = -outerHalfExtent;

  // Then fold lines: project onto the line, accept the projection if it's within ε.
  // A line through origin at angle θ has unit direction (cosθ, sinθ); projecting (x,y) onto it
  // gives t·(cosθ, sinθ) where t = x·cosθ + y·sinθ. Perpendicular distance = |x·sinθ − y·cosθ|.
  for (const thetaDeg of foldAnglesDeg) {
    const t = thetaDeg * DEG;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const perp = x * s - y * c;
    if (Math.abs(perp) < epsilon) {
      const along = x * c + y * s;
      x = along * c;
      y = along * s;
    }
  }

  return { x, y };
}

/**
 * Generate the 8 copy transforms for the symmetrical-triangle fold (dev-spec §2.2 / §2.2b).
 *
 * Construction: for k = 0..3, place `rotate(k·90°)(wedge)` and `rotate(k·90°)(mirror·wedge)`.
 * The mirror is across the x-axis (θ=0), since the wedge spans θ ∈ [0°, 45°] and reflecting
 * across its lower bound generates the other half of each quadrant. Composing with successive
 * 90° rotations tiles the full square as 8 wedges.
 */
export function generateSymmetricalTriangleCopies(): readonly CopyTransform[] {
  const mirror0 = reflectionMatrix(0);
  const out: CopyTransform[] = [];
  for (let k = 0; k < 4; k++) {
    const rot = rotationMatrix(k * 90);
    out.push({
      id: `rot${k * 90}`,
      rotationDeg: k * 90,
      mirror: false,
      mat: rot,
    });
    out.push({
      id: `rot${k * 90}·mirror`,
      rotationDeg: k * 90,
      mirror: true,
      mat: multiplyMat(rot, mirror0),
    });
  }
  return out;
}
