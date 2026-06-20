import { describe, it, expect } from 'vitest';
import { encodeQr } from './qr';

/** A finder pattern: 7×7 with a dark border ring, a light ring, and a 3×3 dark centre. */
function finderOk(m: boolean[][], ox: number, oy: number): boolean {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      const wantDark = d === 3 || d <= 1;
      if (m[oy + y]![ox + x] !== wantDark) return false;
    }
  }
  return true;
}

describe('encodeQr', () => {
  it('produces a square matrix whose side is 4·version+17', () => {
    const m = encodeQr('https://example.com');
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    expect((m.length - 17) % 4).toBe(0); // side === 4·version + 17
  });

  it('places valid finder patterns in three corners', () => {
    const m = encodeQr('http://localhost:5173/?d=q1YqU7Iy1FFKU7JSKq7MzU0tKcpMTs');
    const n = m.length;
    expect(finderOk(m, 0, 0)).toBe(true); // top-left
    expect(finderOk(m, n - 7, 0)).toBe(true); // top-right
    expect(finderOk(m, 0, n - 7)).toBe(true); // bottom-left
  });

  it('draws the alternating timing patterns on row/col 6', () => {
    const m = encodeQr('paper-cutting');
    const n = m.length;
    for (let i = 8; i < n - 8; i++) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
  });

  it('grows the symbol version as the payload grows', () => {
    const small = encodeQr('a');
    const large = encodeQr('x'.repeat(400));
    expect(large.length).toBeGreaterThan(small.length);
  });
});
