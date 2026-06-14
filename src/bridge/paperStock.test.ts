import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAPER_STOCK,
  creaseRidgeProfile,
  paperTextureUniforms,
  resolvePaperStock,
} from './paperStock';

describe('resolvePaperStock', () => {
  it('returns the defaults when given nothing', () => {
    expect(resolvePaperStock()).toEqual(DEFAULT_PAPER_STOCK);
  });

  it('merges the UI subset over the defaults', () => {
    const s = resolvePaperStock({ colorBack: '#1f3a93', fiber: 0.8 });
    expect(s.colorBack).toBe('#1f3a93');
    expect(s.fiber).toBe(0.8);
    // untouched knobs fall back to the defaults
    expect(s.crumples).toBe(DEFAULT_PAPER_STOCK.crumples);
  });

  it('clamps numeric knobs into [0,1]', () => {
    const s = resolvePaperStock({ fiber: 5, crumples: -2 });
    expect(s.fiber).toBe(1);
    expect(s.crumples).toBe(0);
  });
});

describe('paperTextureUniforms', () => {
  it('forces the decorative folds off and converts colours to RGBA (gotcha §10.8)', () => {
    const u = paperTextureUniforms(resolvePaperStock(), 1024);
    expect(u.u_folds).toBe(0); // our creases come from the Stage-4 bake, not shader noise
    const colorBack = u.u_colorBack as number[];
    expect(colorBack).toHaveLength(4);
    expect(colorBack[3]).toBe(1); // opaque
    // world size tracks the bake resolution so the pattern fills the canvas 1:1
    expect(u.u_worldWidth).toBe(1024);
    expect(u.u_worldHeight).toBe(1024);
  });

  it('passes the stock knobs through to their uniforms', () => {
    const u = paperTextureUniforms(resolvePaperStock({ fiber: 0.7, drops: 0.2 }), 512);
    expect(u.u_fiber).toBe(0.7);
    expect(u.u_drops).toBe(0.2);
  });
});

describe('creaseRidgeProfile', () => {
  it('peaks at the centre and vanishes at the edge', () => {
    expect(creaseRidgeProfile(0)).toBe(1);
    expect(creaseRidgeProfile(1)).toBe(0);
  });

  it('is monotonically decreasing and clamps outside [0,1]', () => {
    expect(creaseRidgeProfile(0.25)).toBeGreaterThan(creaseRidgeProfile(0.75));
    expect(creaseRidgeProfile(-0.5)).toBe(1);
    expect(creaseRidgeProfile(2)).toBe(0);
    // mid-point of a raised cosine is exactly 0.5
    expect(creaseRidgeProfile(0.5)).toBeCloseTo(0.5, 6);
  });
});
