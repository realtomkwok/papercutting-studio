import { describe, expect, it } from 'vitest';
import {
  dilateMask,
  extendStrokeToWedge,
  labelComponents,
  simplifyPath,
  traceBlob,
} from './RegionDetector';

// Grid cell codes mirror the detector internals: 1 = interior, 2 = wall.
const INTERIOR = 1;
const WALL = 2;

describe('labelComponents', () => {
  it('labels disjoint interior blobs separately with their pixel areas', () => {
    const w = 5;
    const h = 1;
    // Two single-cell blobs separated by a wall: [I W I W I]
    const g = new Uint8Array([INTERIOR, WALL, INTERIOR, WALL, INTERIOR]);
    const { labels, areas } = labelComponents(g, w, h, INTERIOR);
    const distinct = new Set([labels[0], labels[2], labels[4]]);
    expect(distinct.size).toBe(3);
    expect(areas.slice(1)).toEqual([1, 1, 1]);
  });
});

describe('traceBlob', () => {
  it('traces the boundary ring of a filled square', () => {
    const w = 4;
    const h = 4;
    const labels = new Int32Array(w * h);
    // 2×2 block at (1,1)-(2,2)
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]) {
      labels[y! * w + x!] = 1;
    }
    const ring = traceBlob(labels, w, h, 1);
    expect(ring.length).toBeGreaterThanOrEqual(4);
    for (const p of ring) expect(labels[p.y * w + p.x]).toBe(1);
  });
});

describe('dilateMask', () => {
  it('merges two blobs separated by a thin gap once the radius spans it', () => {
    // 7×1: two single cells with a 1-cell gap: [X . . X . . X] → after r≈2 the middle fills,
    // bridging the left pair into one component.
    const w = 7;
    const h = 1;
    const src = new Uint8Array([1, 0, 0, 1, 0, 0, 1]);
    const clip = new Uint8Array(w).fill(1);
    const grown = dilateMask(src, clip, w, h, 1.5);
    // Cells within 1.5 of a source cell are set; index 1,2 bridge 0↔3.
    expect(Array.from(grown)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    const { areas } = labelComponents(grown, w, h, 1);
    expect(areas.slice(1)).toEqual([7]); // one merged component
  });

  it('respects the clip mask (no growth past the wedge boundary)', () => {
    const w = 5;
    const h = 1;
    const src = new Uint8Array([1, 0, 0, 0, 0]);
    const clip = new Uint8Array([1, 1, 0, 0, 0]); // boundary at index 2
    const grown = dilateMask(src, clip, w, h, 5);
    expect(Array.from(grown)).toEqual([1, 1, 0, 0, 0]);
  });
});

describe('extendStrokeToWedge', () => {
  // Wedge: apex + the two outer corners of the 45° symmetrical-triangle wedge.
  const wedge = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0 },
    { x: 0.5, y: 0.5 },
  ];

  it('extends an endpoint that nearly touches the open edge onto it', () => {
    // End near the open edge x=0.5; start well inside.
    const stroke = [
      { x: 0.3, y: 0.2 },
      { x: 0.48, y: 0.2 },
    ];
    const out = extendStrokeToWedge(stroke, wedge, 0.04);
    expect(out.length).toBe(3); // one projection appended
    expect(out[out.length - 1]!.x).toBeCloseTo(0.5, 5); // snapped onto the open edge
  });

  it('leaves a stroke far from every edge unchanged', () => {
    const stroke = [
      { x: 0.3, y: 0.2 },
      { x: 0.35, y: 0.25 },
    ];
    expect(extendStrokeToWedge(stroke, wedge, 0.04)).toEqual(stroke);
  });
});

describe('simplifyPath', () => {
  it('collapses colinear points to the endpoints', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(simplifyPath(line, 0.01)).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('keeps a corner that exceeds the tolerance', () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ];
    expect(simplifyPath(corner, 0.1)).toHaveLength(3);
  });
});
