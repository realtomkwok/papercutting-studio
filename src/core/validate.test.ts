import { describe, expect, it } from 'vitest';
import { symmetricalTriangle } from './foldConfig';
import { pointInWedge, type Point } from './geometry';
import { clipToSquare, clipToWedge, isSelfIntersecting, signedArea, validatePath } from './validate';

const EPS = 0.005;

/** A clean triangle wholly inside the wedge θ ∈ [0°, 45°]. */
const INSIDE: Point[] = [
  { x: 0.2, y: 0.04 },
  { x: 0.35, y: 0.04 },
  { x: 0.3, y: 0.12 },
];

describe('signedArea', () => {
  it('is positive for CCW and negative for CW winding', () => {
    expect(signedArea(INSIDE)).toBeGreaterThan(0);
    expect(signedArea([...INSIDE].reverse())).toBeLessThan(0);
  });
});

describe('clipToWedge', () => {
  it('leaves a fully-inside path unchanged in extent (all points stay in wedge)', () => {
    const clipped = clipToWedge(INSIDE, symmetricalTriangle);
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    for (const p of clipped) expect(pointInWedge(p, 0, 45)).toBe(true);
  });

  it('clips a path straddling the 45° boundary so every output point lies in the wedge', () => {
    // Spans across y=x: part is at θ>45°, which must be cut away.
    const straddle: Point[] = [
      { x: 0.3, y: 0.1 }, // inside
      { x: 0.1, y: 0.3 }, // θ≈71° — outside
      { x: 0.4, y: 0.2 }, // inside
    ];
    const clipped = clipToWedge(straddle, symmetricalTriangle);
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    for (const p of clipped) expect(pointInWedge(p, -1e-6, 45 + 1e-6)).toBe(true);
  });

  it('clips a path entirely outside the wedge down to nothing', () => {
    const outside: Point[] = [
      { x: 0.05, y: 0.3 },
      { x: 0.1, y: 0.4 },
      { x: 0.02, y: 0.45 },
    ];
    expect(clipToWedge(outside, symmetricalTriangle).length).toBeLessThan(3);
  });

  it('trims a cut that pokes past the open edge (x > 0.5) back onto the paper square', () => {
    // Angularly valid (θ ∈ [0,45]) but extends well past x = 0.5 — the open paper edge.
    const overhang: Point[] = [
      { x: 0.3, y: 0.05 },
      { x: 0.9, y: 0.1 }, // outside the square
      { x: 0.4, y: 0.3 },
    ];
    const clipped = clipToWedge(overhang, symmetricalTriangle);
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    for (const p of clipped) expect(p.x).toBeLessThanOrEqual(0.5 + 1e-9);
  });
});

describe('clipToSquare', () => {
  it('keeps an in-square polygon and clamps an overhanging one to [−0.5, 0.5]²', () => {
    const inside: Point[] = [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.1 },
      { x: 0.2, y: 0.3 },
    ];
    expect(clipToSquare(inside)).toHaveLength(3);

    const over: Point[] = [
      { x: 0.2, y: 0.2 },
      { x: 0.9, y: 0.2 },
      { x: 0.9, y: 0.9 },
      { x: 0.2, y: 0.9 },
    ];
    for (const p of clipToSquare(over)) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
});

describe('isSelfIntersecting', () => {
  it('passes a simple triangle', () => {
    expect(isSelfIntersecting(INSIDE)).toBe(false);
  });

  it('flags a self-crossing bowtie', () => {
    const bowtie: Point[] = [
      { x: 0.2, y: 0.0 },
      { x: 0.4, y: 0.2 },
      { x: 0.4, y: 0.0 },
      { x: 0.2, y: 0.2 },
    ];
    expect(isSelfIntersecting(bowtie)).toBe(true);
  });
});

describe('validatePath', () => {
  it('accepts a clean in-wedge path and returns the cleaned polygon', () => {
    const r = validatePath(INSIDE, symmetricalTriangle, EPS);
    expect(r.ok).toBe(true);
    expect(r.messages).toHaveLength(0);
    expect(r.path).not.toBeNull();
    for (const p of r.path!) expect(pointInWedge(p, -1e-6, 45 + 1e-6)).toBe(true);
  });

  it('rejects a path entirely outside the wedge', () => {
    const outside: Point[] = [
      { x: 0.05, y: 0.3 },
      { x: 0.1, y: 0.4 },
      { x: 0.02, y: 0.45 },
    ];
    const r = validatePath(outside, symmetricalTriangle, EPS);
    expect(r.ok).toBe(false);
    expect(r.path).toBeNull();
    expect(r.messages.join(' ')).toMatch(/wedge/i);
  });

  it('clips (does not reject) a path straddling the boundary', () => {
    const straddle: Point[] = [
      { x: 0.3, y: 0.1 },
      { x: 0.1, y: 0.3 },
      { x: 0.4, y: 0.2 },
    ];
    const r = validatePath(straddle, symmetricalTriangle, EPS);
    expect(r.ok).toBe(true);
    for (const p of r.path!) expect(pointInWedge(p, -1e-6, 45 + 1e-6)).toBe(true);
  });

  it('snaps an edge-touching vertex exactly onto the 45° fold line (within ε)', () => {
    // Last vertex sits just below y=x, within ε → must land on x=y after validation.
    const touching: Point[] = [
      { x: 0.2, y: 0.04 },
      { x: 0.4, y: 0.04 },
      { x: 0.3, y: 0.298 }, // ~on the diagonal (|x−y| = 0.002 < ε)
    ];
    const r = validatePath(touching, symmetricalTriangle, EPS);
    expect(r.ok).toBe(true);
    const onDiagonal = r.path!.find((p) => Math.abs(p.x - p.y) < 1e-9);
    expect(onDiagonal).toBeDefined();
  });

  it('rejects a degenerate (< 3 point) path', () => {
    const r = validatePath(
      [
        { x: 0.2, y: 0.1 },
        { x: 0.3, y: 0.1 },
      ],
      symmetricalTriangle,
      EPS,
    );
    expect(r.ok).toBe(false);
  });

  it('rejects a self-intersecting path (with non-zero enclosed area)', () => {
    // A→B bottom, then crossed sides B→C and D→A produce an hourglass with net area ≠ 0.
    const crossed: Point[] = [
      { x: 0.2, y: 0.02 }, // A bottom-left
      { x: 0.4, y: 0.02 }, // B bottom-right
      { x: 0.25, y: 0.18 }, // C top-left
      { x: 0.35, y: 0.18 }, // D top-right
    ];
    const r = validatePath(crossed, symmetricalTriangle, EPS);
    expect(r.ok).toBe(false);
    expect(r.messages.join(' ')).toMatch(/self-intersect/i);
  });
});
