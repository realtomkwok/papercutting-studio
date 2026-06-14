import { describe, expect, it } from 'vitest';
import { signedArea, isSelfIntersecting } from './validate';
import {
  circleStamp,
  crescentStamp,
  makeStamp,
  sawtoothStamp,
  triangleStamp,
  type StampKind,
} from './stamps';
import type { Point } from './geometry';

const CENTER: Point = { x: 0.3, y: 0.2 };
const SIZE = 0.1;

const maxRadius = (poly: Point[], c: Point) =>
  Math.max(...poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));

describe('stamp generators', () => {
  it('circle: closed n-gon centred on the click, within its radius', () => {
    const poly = circleStamp(CENTER, SIZE);
    expect(poly).toHaveLength(24);
    expect(Math.abs(signedArea(poly))).toBeGreaterThan(0);
    expect(maxRadius(poly, CENTER)).toBeLessThanOrEqual(SIZE + 1e-9);
  });

  it('triangle: 3 vertices, non-degenerate', () => {
    const poly = triangleStamp(CENTER, SIZE);
    expect(poly).toHaveLength(3);
    expect(Math.abs(signedArea(poly))).toBeGreaterThan(0);
  });

  it('sawtooth: closed, non-zero area, spans 2·size horizontally', () => {
    const poly = sawtoothStamp(CENTER, SIZE, 4);
    expect(Math.abs(signedArea(poly))).toBeGreaterThan(0);
    const xs = poly.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * SIZE, 9);
  });

  it('crescent: closed, simple (no self-intersection), non-zero area', () => {
    const poly = crescentStamp(CENTER, SIZE);
    expect(Math.abs(signedArea(poly))).toBeGreaterThan(0);
    expect(isSelfIntersecting(poly)).toBe(false);
    expect(maxRadius(poly, CENTER)).toBeLessThanOrEqual(SIZE + 1e-9);
  });

  it('makeStamp dispatches every kind to a non-empty polygon', () => {
    const kinds: StampKind[] = ['circle', 'triangle', 'sawtooth', 'crescent'];
    for (const k of kinds) {
      const poly = makeStamp(k, CENTER, SIZE);
      expect(poly.length).toBeGreaterThanOrEqual(3);
      expect(Math.abs(signedArea(poly))).toBeGreaterThan(0);
    }
  });
});
