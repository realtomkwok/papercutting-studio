import { describe, expect, it } from 'vitest';
import {
  applyMat,
  generateSymmetricalTriangleCopies,
  pointInPolygon,
  reflectionMatrix,
  rotationMatrix,
  snapPoint,
  type Point,
} from './geometry';

const closeTo = (a: number, b: number) => expect(a).toBeCloseTo(b, 12);
const pointClose = (got: { x: number; y: number }, want: { x: number; y: number }) => {
  closeTo(got.x, want.x);
  closeTo(got.y, want.y);
};

describe('pointInPolygon', () => {
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 0.4, y: 0 },
    { x: 0.4, y: 0.4 },
    { x: 0, y: 0.4 },
  ];
  it('accepts an interior point and rejects an exterior one', () => {
    expect(pointInPolygon({ x: 0.2, y: 0.2 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0.5, y: 0.2 }, square)).toBe(false);
    expect(pointInPolygon({ x: 0.2, y: 0.6 }, square)).toBe(false);
  });
  it('handles a concave (L-shaped) polygon', () => {
    const ell: Point[] = [
      { x: 0, y: 0 },
      { x: 0.4, y: 0 },
      { x: 0.4, y: 0.2 },
      { x: 0.2, y: 0.2 },
      { x: 0.2, y: 0.4 },
      { x: 0, y: 0.4 },
    ];
    expect(pointInPolygon({ x: 0.1, y: 0.3 }, ell)).toBe(true); // in the left arm
    expect(pointInPolygon({ x: 0.3, y: 0.3 }, ell)).toBe(false); // in the notch
  });
});

describe('reflectionMatrix', () => {
  it('R(0°) reflects (a,b) → (a,−b)', () => {
    pointClose(applyMat(reflectionMatrix(0), { x: 0.3, y: 0.4 }), { x: 0.3, y: -0.4 });
  });

  it('R(45°) maps (1,0) → (0,1) (dev-spec §2.2 example)', () => {
    pointClose(applyMat(reflectionMatrix(45), { x: 1, y: 0 }), { x: 0, y: 1 });
  });

  it('R(90°) reflects (a,b) → (−a,b)', () => {
    pointClose(applyMat(reflectionMatrix(90), { x: 0.3, y: 0.4 }), { x: -0.3, y: 0.4 });
  });

  it('R(θ)·R(θ) = identity (reflections are involutions)', () => {
    const r = reflectionMatrix(37);
    const p = { x: 0.123, y: -0.456 };
    pointClose(applyMat(r, applyMat(r, p)), p);
  });
});

describe('snapPoint', () => {
  const FOLDS = [0, 45, 90];
  const HALF = 0.5;
  const EPS = 0.005;

  it('snaps near-axis point onto the x-axis (θ=0)', () => {
    const p = snapPoint({ x: 0.3, y: 0.001 }, FOLDS, HALF, EPS);
    expect(p.y).toBe(0);
    expect(p.x).toBe(0.3);
  });

  it('snaps near-diagonal point onto the 45° line', () => {
    // a point just above the y=x diagonal: (0.3, 0.302)
    const p = snapPoint({ x: 0.3, y: 0.302 }, FOLDS, HALF, EPS);
    closeTo(p.x, p.y);
  });

  it('snaps to outer square edge when within ε', () => {
    const p = snapPoint({ x: 0.498, y: 0.2 }, FOLDS, HALF, EPS);
    expect(p.x).toBe(0.5);
    expect(p.y).toBe(0.2);
  });

  it('leaves a far-from-anything point untouched', () => {
    const p = snapPoint({ x: 0.2, y: 0.1 }, FOLDS, HALF, EPS);
    expect(p.x).toBe(0.2);
    expect(p.y).toBe(0.1);
  });

  it('is idempotent (snap of snap = snap)', () => {
    const once = snapPoint({ x: 0.498, y: 0.001 }, FOLDS, HALF, EPS);
    const twice = snapPoint(once, FOLDS, HALF, EPS);
    pointClose(twice, once);
  });
});

describe('generateSymmetricalTriangleCopies', () => {
  const COPIES = generateSymmetricalTriangleCopies();

  it('emits 8 transforms', () => {
    expect(COPIES).toHaveLength(8);
  });

  it('emits 4 rotation-only (det=+1) and 4 mirrored (det=−1)', () => {
    const det = (m: readonly [readonly [number, number], readonly [number, number]]) =>
      m[0][0] * m[1][1] - m[0][1] * m[1][0];
    const direct = COPIES.filter((c) => !c.mirror);
    const mirrored = COPIES.filter((c) => c.mirror);
    expect(direct).toHaveLength(4);
    expect(mirrored).toHaveLength(4);
    for (const c of direct) closeTo(det(c.mat), 1);
    for (const c of mirrored) closeTo(det(c.mat), -1);
  });

  it('rotations are 0°, 90°, 180°, 270°', () => {
    const angles = COPIES.map((c) => c.rotationDeg).sort((a, b) => a - b);
    expect(angles).toEqual([0, 0, 90, 90, 180, 180, 270, 270]);
  });

  it('tiles the unit square — sample point in the wedge has 8 distinct images', () => {
    // (0.3, 0.1) is inside the wedge θ∈[0°,45°]. Its 8 transformed images should be distinct.
    const probe = { x: 0.3, y: 0.1 };
    const seen = new Set<string>();
    for (const c of COPIES) {
      const p = applyMat(c.mat, probe);
      seen.add(`${p.x.toFixed(9)},${p.y.toFixed(9)}`);
    }
    expect(seen.size).toBe(8);
  });

  it('includes the identity (rot 0, no mirror)', () => {
    const id = COPIES.find((c) => c.rotationDeg === 0 && !c.mirror);
    expect(id).toBeDefined();
    const p = applyMat(id!.mat, { x: 0.3, y: 0.1 });
    pointClose(p, { x: 0.3, y: 0.1 });
  });
});

describe('rotationMatrix sanity check', () => {
  it('rotation by 90° maps (1,0) → (0,1)', () => {
    pointClose(applyMat(rotationMatrix(90), { x: 1, y: 0 }), { x: 0, y: 1 });
  });
});
