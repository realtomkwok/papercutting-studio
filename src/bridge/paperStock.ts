/**
 * paperStock (M5) — pure helpers for the paper-shaders colour bake and the crease composite.
 *
 * Framework-free except for the package's pure colour parser (`getShaderColorFromString`, no DOM):
 * resolves the UI's `PaperStockProps` into a full stock, maps that stock to the paper-texture
 * shader's uniform set (with the decorative `folds`/`foldCount` forced off — gotcha §10.8, the
 * geometric creases come from Stage 4), and provides the crease-ridge profile + tuning constants the
 * bump/tint compositor consumes. Kept here (no canvas/three imports) so it's unit-testable in node.
 */

import {
  getShaderColorFromString,
  ShaderFitOptions,
  type ShaderMountUniforms,
} from '@paper-design/shaders';
import type { PaperStockProps } from '../engine/api';

/** A fully-specified paper stock — every paper-texture knob the bake needs, no optionals. */
export interface ResolvedStock {
  /** Base sheet colour (the paper) — classic cut-paper red by default (dev-spec §5.2). */
  readonly colorBack: string;
  /** Fibre/noise overlay colour, a touch off the base so fibres read. */
  readonly colorFront: string;
  readonly fiber: number;
  readonly fiberSize: number;
  readonly crumples: number;
  readonly crumpleSize: number;
  readonly drops: number;
  /** Pixel-noise roughness of the shader pattern (NOT the Three.js material roughness). */
  readonly roughness: number;
  readonly contrast: number;
  readonly seed: number;
}

/** Suggested starting stock (dev-spec §5.2 / worked-example Stage 5): red, fibre on, folds off. */
export const DEFAULT_PAPER_STOCK: ResolvedStock = {
  colorBack: '#c8102e',
  colorFront: '#a60d25',
  fiber: 0.4,
  fiberSize: 0.2,
  crumples: 0.15,
  crumpleSize: 0.3,
  drops: 0.15,
  roughness: 0.3,
  contrast: 0.5,
  seed: 0,
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Merge the UI-exposed props over the defaults, clamping the numeric knobs to [0,1]. */
export function resolvePaperStock(props?: PaperStockProps): ResolvedStock {
  const d = DEFAULT_PAPER_STOCK;
  if (!props) return d;
  const num = (v: number | undefined, fallback: number) =>
    v === undefined ? fallback : clamp01(v);
  return {
    colorBack: props.colorBack ?? d.colorBack,
    colorFront: props.colorFront ?? d.colorFront,
    fiber: num(props.fiber, d.fiber),
    fiberSize: num(props.fiberSize, d.fiberSize),
    crumples: num(props.crumples, d.crumples),
    crumpleSize: num(props.crumpleSize, d.crumpleSize),
    drops: num(props.drops, d.drops),
    roughness: num(props.roughness, d.roughness),
    contrast: num(props.contrast, d.contrast),
    seed: num(props.seed, d.seed),
  };
}

/**
 * Map a stock to the paper-texture fragment shader's uniforms at the given square `resolution`.
 * `u_noiseTexture` + `u_image` (both `Image`s) are added by the baker at the DOM boundary — they
 * can't exist here. `u_folds`/`u_foldCount` are pinned off: their "folds" are decorative noise, not
 * our geometric creases (gotcha §10.8). Sizing uses `fit:none` at world = canvas size so the pattern
 * fills 1:1.
 */
export function paperTextureUniforms(stock: ResolvedStock, resolution: number): ShaderMountUniforms {
  return {
    u_colorBack: getShaderColorFromString(stock.colorBack),
    u_colorFront: getShaderColorFromString(stock.colorFront),
    u_contrast: stock.contrast,
    u_roughness: stock.roughness,
    u_fiber: stock.fiber,
    u_fiberSize: stock.fiberSize,
    u_crumples: stock.crumples,
    u_crumpleSize: stock.crumpleSize,
    u_folds: 0, // decorative noise — OFF (gotcha §10.8)
    u_foldCount: 1,
    u_fade: 0,
    u_drops: stock.drops,
    u_seed: stock.seed * 1000, // shader seed range is 0..1000; our stock keeps it normalised 0..1
    u_imageAspectRatio: 1, // no source image; the baker binds a 1×1 transparent pixel to u_image
    // sizing (ShaderSizingUniforms)
    u_fit: ShaderFitOptions.none,
    u_scale: 1,
    u_rotation: 0,
    u_originX: 0.5,
    u_originY: 0.5,
    u_offsetX: 0,
    u_offsetY: 0,
    u_worldWidth: resolution,
    u_worldHeight: resolution,
  };
}

/** Colour/bump map resolution. The colour map needn't be as crisp as the 2048² alphaMap cutout —
 *  1024² keeps the one-off bake cheap while still resolving the fibre + crease detail. */
export const MAP_RESOLUTION = 1024;
/** Three.js `bumpMap` strength — small, so baked crumples + creases catch raking light without
 *  looking embossed (dev-spec §5.2 step 4). */
export const BUMP_SCALE = 0.012;
/** Half-width of a crease ridge in map pixels (~6–10 px total ridge at 1024², worked-ex Stage 4.1). */
export const CREASE_HALF_WIDTH = 4;
/** Per-stroke darkening of the colour map along a crease (3–5%, worked-ex Stage 4.3). */
export const CREASE_TINT_ALPHA = 0.045;

/**
 * Raised-cosine ridge profile across a crease: `s` is the normalised perpendicular distance from the
 * crease centre (0) to its edge (1). Returns 1 at the centre falling smoothly to 0 at the edge — the
 * `cos` falloff the bump/tint compositor weights each parallel stroke by (worked-ex Stage 4.1). The
 * caller applies the mountain (bright) / valley (dark) sign.
 */
export function creaseRidgeProfile(s: number): number {
  if (s <= 0) return 1;
  if (s >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * s));
}
