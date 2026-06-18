import { describe, expect, it } from 'vitest';
import { encodeDesign, decodeDesign, decodeLegacyDesign } from './shareCodec';
import type { DesignState } from '../engine/api';

/** A design with enough geometry to exercise the codec (and to dwarf the legacy encoding). */
function sampleDesign(): DesignState {
  const ring = (cx: number, cy: number, r: number) =>
    Array.from({ length: 32 }, (_, i) => {
      const t = (i / 32) * Math.PI * 2;
      return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
    });
  return {
    version: 1,
    foldId: 'symmetrical-triangle',
    cuts: [ring(0.1, 0.1, 0.08), ring(-0.05, 0.0, 0.05)],
    strokes: [],
    stock: { colorBack: '#c8102e', fiber: 0.4, seed: 0.7 },
  };
}

describe('shareCodec', () => {
  it('round-trips a design within the quantisation tolerance', async () => {
    const design = sampleDesign();
    const decoded = await decodeDesign(await encodeDesign(design));
    expect(decoded).not.toBeNull();
    expect(decoded!.foldId).toBe(design.foldId);
    expect(decoded!.stock).toEqual(design.stock);
    expect(decoded!.cuts).toHaveLength(design.cuts.length);
    for (let c = 0; c < design.cuts.length; c++) {
      expect(decoded!.cuts[c]).toHaveLength(design.cuts[c]!.length);
      for (let i = 0; i < design.cuts[c]!.length; i++) {
        expect(decoded!.cuts[c]![i]!.x).toBeCloseTo(design.cuts[c]![i]!.x, 4);
        expect(decoded!.cuts[c]![i]!.y).toBeCloseTo(design.cuts[c]![i]!.y, 4);
      }
    }
  });

  it('is dramatically shorter than the legacy base64-JSON encoding', async () => {
    const design = sampleDesign();
    const compact = await encodeDesign(design);
    const legacy = encodeURIComponent(btoa(JSON.stringify(design)));
    expect(compact.length).toBeLessThan(legacy.length / 2);
  });

  it('produces URL-safe output (no +, /, = or %)', async () => {
    const encoded = await encodeDesign(sampleDesign());
    expect(encoded).not.toMatch(/[+/=%]/);
  });

  it('returns null for malformed input', async () => {
    expect(await decodeDesign('not-valid-base64!!')).toBeNull();
  });

  it('still decodes a legacy ?design= payload', () => {
    const design = sampleDesign();
    const legacy = encodeURIComponent(btoa(JSON.stringify(design)));
    const decoded = decodeLegacyDesign(legacy) as DesignState;
    expect(decoded.foldId).toBe(design.foldId);
    expect(decoded.cuts[0]![0]!.x).toBeCloseTo(design.cuts[0]![0]!.x, 10);
  });
});
