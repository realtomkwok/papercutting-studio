import { describe, expect, it } from 'vitest';
import { symmetricalTriangle } from './foldConfig';
import {
  applyMat,
  boundaryPointAtAngle,
  determinant,
  generateCopies,
  generateSymmetricalTriangleCopies,
  pointInWedge,
  reflectionMatrix,
  type Mat2,
  type Point,
} from './geometry';
import { generateCreases, unfold } from './unfold';

const closeTo = (a: number, b: number) => expect(a).toBeCloseTo(b, 12);
const pointClose = (got: Point, want: Point) => {
  closeTo(got.x, want.x);
  closeTo(got.y, want.y);
};
const key = (p: Point) => `${p.x.toFixed(9)},${p.y.toFixed(9)}`;

// A small triangle wholly inside the wedge θ ∈ [0°, 45°] (a floating hole).
const FLOATING: Point[] = [
  { x: 0.2, y: 0.05 },
  { x: 0.3, y: 0.05 },
  { x: 0.25, y: 0.12 },
];

describe('generateCopies (general reflect-and-double)', () => {
  // Reverse fold order: last physical fold (45°) opens first.
  const COPIES = generateCopies([45, 90, 0]);

  it('doubles once per fold line → 8 copies for three folds', () => {
    expect(COPIES).toHaveLength(8);
    expect(generateCopies([])).toHaveLength(1);
    expect(generateCopies([45])).toHaveLength(2);
  });

  it('emits 4 rotations (det +1) and 4 reflections (det −1)', () => {
    const direct = COPIES.filter((c) => !c.mirror);
    const mirrored = COPIES.filter((c) => c.mirror);
    expect(direct).toHaveLength(4);
    expect(mirrored).toHaveLength(4);
    for (const c of direct) closeTo(determinant(c.mat), 1);
    for (const c of mirrored) closeTo(determinant(c.mat), -1);
  });

  it('rotation-only copies are the 0/90/180/270 of D₄', () => {
    const angles = COPIES.filter((c) => !c.mirror)
      .map((c) => c.rotationDeg)
      .sort((a, b) => a - b);
    expect(angles).toEqual([0, 90, 180, 270]);
  });

  it('matches generateSymmetricalTriangleCopies as a set of matrices', () => {
    // Round to 1e-9 and fold −0 into 0 so float fuzz (cos 90° ≈ 6e-17) doesn't split the set.
    const norm = (v: number) => {
      const r = Math.round(v * 1e9) / 1e9;
      return r === 0 ? '0' : r.toFixed(9);
    };
    const asSet = (cs: readonly { mat: Mat2 }[]) =>
      new Set(cs.map((c) => c.mat.flat().map(norm).join(',')));
    const general = asSet(generateCopies([45, 90, 0]));
    const pinned = asSet(generateSymmetricalTriangleCopies());
    expect(general).toEqual(pinned);
  });
});

describe('unfold — copy set', () => {
  it('produces one copy per transform per input path', () => {
    const { copies } = unfold([FLOATING], symmetricalTriangle);
    expect(copies).toHaveLength(8);
    expect(copies.every((c) => c.points.length === FLOATING.length)).toBe(true);
  });

  it('scales with the number of input paths', () => {
    const second: Point[] = FLOATING.map((p) => ({ x: p.x, y: p.y + 0.1 }));
    const { copies } = unfold([FLOATING, second], symmetricalTriangle);
    expect(copies).toHaveLength(16);
  });

  it('tiles the square — a wedge probe lands in 8 distinct images', () => {
    const probe: Point[] = [{ x: 0.3, y: 0.1 }];
    const { copies } = unfold([probe], symmetricalTriangle);
    const seen = new Set(copies.map((c) => key(c.points[0]!)));
    expect(seen.size).toBe(8);
  });

  it('includes an identity copy that leaves the wedge path unchanged', () => {
    const { copies } = unfold([FLOATING], symmetricalTriangle);
    const identity = copies.find((c) => !c.transform.mirror && c.transform.rotationDeg === 0);
    expect(identity).toBeDefined();
    identity!.points.forEach((p, i) => pointClose(p, FLOATING[i]!));
  });
});

describe('unfold — edge snapping & seam merge (no slivers)', () => {
  it('snaps a near-fold-edge point exactly onto the 45° line', () => {
    // (0.3, 0.298) sits just below the y=x diagonal, within ε.
    const path: Point[] = [{ x: 0.3, y: 0.298 }];
    const { copies } = unfold([path], symmetricalTriangle);
    const identity = copies.find((c) => !c.transform.mirror && c.transform.rotationDeg === 0)!;
    closeTo(identity.points[0]!.x, identity.points[0]!.y); // landed on x=y
  });

  it('a point snapped onto a fold edge is fixed by that fold’s reflection — copies meet exactly', () => {
    // Cut touching the 45° edge: after snapping, on-edge points are invariant under R(45°),
    // so the copy and its mirror across that seam share the edge with zero gap (no sliver).
    const onEdge: Point[] = [
      { x: 0.25, y: 0.252 }, // ~on the 45° diagonal
      { x: 0.15, y: 0.05 }, // interior
    ];
    const { copies } = unfold([onEdge], symmetricalTriangle);
    const identity = copies.find((c) => !c.transform.mirror && c.transform.rotationDeg === 0)!;
    const snappedVertex = identity.points[0]!;
    closeTo(snappedVertex.x, snappedVertex.y);
    pointClose(applyMat(reflectionMatrix(45), snappedVertex), snappedVertex);
  });
});

describe('generateCreases — the 8-spoke crease star', () => {
  const creases = generateCreases(symmetricalTriangle);

  it('emits 8 spokes at 0/45/.../315', () => {
    expect(creases.map((c) => c.angleDeg)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it('alternates mountain/valley around the star', () => {
    expect(creases.map((c) => c.type)).toEqual([
      'mountain', 'valley', 'mountain', 'valley',
      'mountain', 'valley', 'mountain', 'valley',
    ]);
  });

  it('each fold line keeps one consistent type along its full diameter', () => {
    const typeAt = (deg: number) => creases.find((c) => c.angleDeg === deg)!.type;
    expect(typeAt(0)).toBe(typeAt(180)); // F1 (half) diameter
    expect(typeAt(90)).toBe(typeAt(270)); // F2 (quarter) diameter
    expect(typeAt(45)).toBe(typeAt(225)); // F3 (diagonal)
    expect(typeAt(135)).toBe(typeAt(315)); // F3 mirror
  });

  it('every spoke starts at the origin and ends on the square boundary', () => {
    for (const c of creases) {
      pointClose(c.from, { x: 0, y: 0 });
      expect(Math.max(Math.abs(c.to.x), Math.abs(c.to.y))).toBeCloseTo(0.5, 12);
    }
  });

  it('diagonal spokes reach the square corners', () => {
    const at45 = creases.find((c) => c.angleDeg === 45)!;
    pointClose(at45.to, { x: 0.5, y: 0.5 });
  });
});

describe('geometry helpers', () => {
  it('boundaryPointAtAngle hits the correct edge', () => {
    pointClose(boundaryPointAtAngle(0, 0.5), { x: 0.5, y: 0 });
    pointClose(boundaryPointAtAngle(90, 0.5), { x: 0, y: 0.5 });
    pointClose(boundaryPointAtAngle(45, 0.5), { x: 0.5, y: 0.5 });
  });

  it('pointInWedge accepts wedge interior and rejects outside', () => {
    expect(pointInWedge({ x: 0.3, y: 0.1 }, 0, 45)).toBe(true);
    expect(pointInWedge({ x: 0, y: 0 }, 0, 45)).toBe(true); // apex on every boundary
    expect(pointInWedge({ x: 0.1, y: 0.3 }, 0, 45)).toBe(false); // θ ≈ 71° > 45°
  });
});
