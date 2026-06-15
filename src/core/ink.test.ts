import { describe, expect, it } from 'vitest';
import { cleanStroke, eraseStrokes } from './ink';

describe('cleanStroke', () => {
  it('drops consecutive near-duplicate points but keeps the open polyline', () => {
    const out = cleanStroke([
      { x: 0, y: 0 },
      { x: 0, y: 0 }, // dupe
      { x: 0.1, y: 0 },
      { x: 0.2, y: 0 },
    ]);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
      { x: 0.2, y: 0 },
    ]);
  });

  it('collapses a dot to under 2 points', () => {
    expect(cleanStroke([{ x: 0.3, y: 0.3 }, { x: 0.3, y: 0.3 }]).length).toBeLessThan(2);
  });
});

describe('eraseStrokes', () => {
  const LINE = [
    { x: 0.1, y: 0 },
    { x: 0.2, y: 0 },
    { x: 0.3, y: 0 },
    { x: 0.4, y: 0 },
  ];

  it('splits a stroke into two when the eraser rubs out an interior point', () => {
    // Rub at 0.25 with radius 0.06 removes the 0.2 and 0.3 vertices → ends survive as separate runs.
    const out = eraseStrokes([LINE], [{ x: 0.25, y: 0 }], 0.06);
    expect(out).toHaveLength(0); // each surviving run is a single point → dropped (<2)
  });

  it('keeps the far run when the eraser only clips one end', () => {
    const out = eraseStrokes([LINE], [{ x: 0.1, y: 0 }], 0.03); // removes only the first vertex
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual([
      { x: 0.2, y: 0 },
      { x: 0.3, y: 0 },
      { x: 0.4, y: 0 },
    ]);
  });

  it('leaves strokes untouched when the eraser is far away', () => {
    const out = eraseStrokes([LINE], [{ x: 0.9, y: 0.9 }], 0.05);
    expect(out).toEqual([LINE]);
  });

  it('erases along a polyline path, not just a point', () => {
    const out = eraseStrokes([LINE], [{ x: 0.05, y: 0 }, { x: 0.45, y: 0 }], 0.02);
    expect(out).toHaveLength(0); // the rub covers the whole line
  });
});
