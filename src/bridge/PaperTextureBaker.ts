/**
 * PaperTextureBaker (M5) — bakes the paper-shaders colour map + crease bump/tint into the shared mesh
 * material (worked-example Stages 4–5, dev-spec §5.2).
 *
 * Three outputs, all composited into a hidden 2D canvas pair and wrapped as `THREE.CanvasTexture`:
 *  - **colour map** (`material.map`): the paper-shaders fibre/crumple texture, rendered ONCE offscreen
 *    in its own WebGL context, then snapshotted (`drawImage`) into a 2D canvas — its WebGL buffer isn't
 *    reliably readable later (gotcha §10.2). Crease tint (a faint darkening along the fold lines) is
 *    multiplied in on top.
 *  - **bump map** (`material.bumpMap`): a grayscale height field — mid-gray base + the colour map's
 *    luminance for crumple relief + crease ridges (mountain = bright, valley = dark groove). So the
 *    static colour bake reacts to scene lighting / raking light (dev-spec §5.2 step 4).
 *
 * The bake is a one-off cost, not per-frame: triggered on mount and re-run only when the paper stock
 * changes (`setPaperStock` → `bake`). The paper-shaders mount renders async (its own RAF + resize
 * observer), so `bake` is a Promise that resolves once the snapshot is taken; the engine repaints the
 * 3D view on resolve.
 */

import * as THREE from 'three';
import {
  ShaderMount,
  getShaderNoiseTexture,
  paperTextureFragmentShader,
  emptyPixel,
} from '@paper-design/shaders';
import type { CreaseSegment } from '../core/unfold';
import type { Point } from '../core/geometry';
import type { PaperStockProps } from '../engine/api';
import {
  BUMP_SCALE,
  CREASE_HALF_WIDTH,
  CREASE_TINT_ALPHA,
  MAP_RESOLUTION,
  creaseRidgeProfile,
  paperTextureUniforms,
  resolvePaperStock,
  type ResolvedStock,
} from './paperStock';

export interface PaperTextureBakerOptions {
  readonly resolution?: number;
  /** Called after each successful bake (the engine repaints the 3D view). */
  readonly onBaked?: () => void;
}

export class PaperTextureBaker {
  private readonly resolution: number;
  private readonly mapCanvas: HTMLCanvasElement;
  private readonly bumpCanvas: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly bumpCtx: CanvasRenderingContext2D;
  private readonly mapTexture: THREE.CanvasTexture;
  private readonly bumpTexture: THREE.CanvasTexture;
  private readonly shaderHost: HTMLDivElement;
  private shader: ShaderMount | null = null;
  private emptyImage: HTMLImageElement | null = null;
  private creases: readonly CreaseSegment[] = [];
  private stock: ResolvedStock = resolvePaperStock();
  private disposed = false;

  constructor(
    private readonly material: THREE.MeshStandardMaterial,
    host: HTMLElement,
    private readonly opts: PaperTextureBakerOptions = {},
  ) {
    this.resolution = opts.resolution ?? MAP_RESOLUTION;

    this.mapCanvas = makeCanvas(this.resolution);
    this.bumpCanvas = makeCanvas(this.resolution);
    this.mapCtx = get2d(this.mapCanvas);
    this.bumpCtx = get2d(this.bumpCanvas);

    // Seed both canvases so the mesh looks right *before* the first async WebGL bake lands (and as a
    // guard against the black-frame trap, dev-spec M5 test): flat paper colour + neutral bump.
    this.mapCtx.fillStyle = this.stock.colorBack;
    this.mapCtx.fillRect(0, 0, this.resolution, this.resolution);
    this.bumpCtx.fillStyle = '#808080';
    this.bumpCtx.fillRect(0, 0, this.resolution, this.resolution);

    this.mapTexture = new THREE.CanvasTexture(this.mapCanvas);
    this.mapTexture.colorSpace = THREE.SRGBColorSpace; // colour data (dev-spec §5.2 step 3)
    this.bumpTexture = new THREE.CanvasTexture(this.bumpCanvas);
    this.bumpTexture.colorSpace = THREE.NoColorSpace; // height data — keep linear

    // Hang the maps on the SHARED cutout material (from AlphaMapBaker) so every fold-rig panel paints
    // with the paper texture + creases via the single live upload. `color` goes white so `map` isn't
    // double-tinted (AlphaMapBaker set it to red as a pre-M5 fallback).
    material.color.set(0xffffff);
    material.map = this.mapTexture;
    material.bumpMap = this.bumpTexture;
    material.bumpScale = BUMP_SCALE;
    material.needsUpdate = true;

    // Offscreen host for the paper-shaders WebGL canvas (its own context — never shares with Three.js,
    // gotcha §10.1). Sized in CSS px to the target resolution so the snapshot resolves full detail.
    this.shaderHost = document.createElement('div');
    Object.assign(this.shaderHost.style, {
      position: 'absolute',
      left: '-20000px',
      top: '0',
      width: `${this.resolution}px`,
      height: `${this.resolution}px`,
      pointerEvents: 'none',
    });
    host.appendChild(this.shaderHost);
  }

  /** The crease star (from `generateCreases`) to emboss + tint into the maps. Set per fold config. */
  setCreases(creases: readonly CreaseSegment[]): void {
    this.creases = creases;
  }

  getStock(): ResolvedStock {
    return this.stock;
  }

  /** The baked colour-map canvas (paper-shaders snapshot + crease tint). The 2D editor + side preview
   *  paint their "paper" regions with this so the 2D view matches the 3D paper stock. Updated in place
   *  by each {@link bake}; consumers re-read it on the `onBaked` callback. */
  getMapCanvas(): HTMLCanvasElement {
    return this.mapCanvas;
  }

  /**
   * Render the paper-shaders texture once, snapshot it, composite crease tint + bump, and upload.
   * Resolves after the snapshot is taken. Re-run on stock change; cheap enough to await per change.
   */
  async bake(props?: PaperStockProps): Promise<void> {
    if (this.disposed) return;
    // `undefined` props → keep the current stock (e.g. re-baking on a fold-config / crease change).
    if (props !== undefined) this.stock = resolvePaperStock(props);
    const res = this.resolution;

    // 1. Render paper-shaders into its offscreen WebGL canvas. Reuse the mount across re-bakes (just
    //    push new uniforms); `speed: 0` keeps it static — one render, no recurring RAF cost.
    const noise = getShaderNoiseTexture();
    if (noise) await decodeImage(noise);
    if (!this.emptyImage) this.emptyImage = loadImage(emptyPixel);
    const uniforms = {
      ...paperTextureUniforms(this.stock, res),
      u_noiseTexture: noise,
      u_image: this.emptyImage, // 1×1 transparent pixel — keeps the u_image sampler bound
    };
    if (!this.shader) {
      this.shader = new ShaderMount(
        this.shaderHost,
        paperTextureFragmentShader,
        uniforms,
        { preserveDrawingBuffer: true }, // so the buffer is still readable when we snapshot
        0, // static
        0,
        1, // minPixelRatio 1 — the host is already at target resolution; no 2× upscale needed
      );
    } else {
      this.shader.setUniforms(uniforms);
    }

    // The mount sizes its canvas via a ResizeObserver and renders on RAF — wait until a non-empty
    // frame is present before snapshotting (guards the black-frame trap, dev-spec M5 test).
    const shaderCanvas = await this.waitForRender();
    if (this.disposed) return;

    // 2. Snapshot WebGL → 2D colour canvas (gotcha §10.2), scaled to fill the map exactly.
    this.mapCtx.clearRect(0, 0, res, res);
    if (shaderCanvas) {
      this.mapCtx.drawImage(shaderCanvas, 0, 0, res, res);
    } else {
      // Fallback if WebGL never produced a frame: keep the flat paper colour rather than black.
      this.mapCtx.fillStyle = this.stock.colorBack;
      this.mapCtx.fillRect(0, 0, res, res);
    }

    // 3. Crease tint into the colour map (fibres darken at folds) + 4. bump map (relief + ridges).
    this.compositeCreaseTint();
    this.compositeBump();

    this.mapTexture.needsUpdate = true;
    this.bumpTexture.needsUpdate = true;
    this.material.needsUpdate = true;
    this.opts.onBaked?.();
  }

  /** Unit-square coord (x,y ∈ [−0.5,0.5]) → map pixel (y flips: math-up vs canvas-down). Matches the
   *  UV/alphaMap convention so creases land on their fold lines in the same frame (gotcha §10.7). */
  private toPx(p: Point): Point {
    return { x: (p.x + 0.5) * this.resolution, y: (0.5 - p.y) * this.resolution };
  }

  /** Multiply a faint darkening along each crease into the colour map (worked-ex Stage 4.3). */
  private compositeCreaseTint(): void {
    const ctx = this.mapCtx;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (const c of this.creases) {
      this.softLine(ctx, c.from, c.to, '0,0,0', CREASE_TINT_ALPHA);
    }
    ctx.restore();
  }

  /** Rebuild the bump map: neutral base + the colour map's luminance (crumple relief) + crease ridges
   *  (mountain bright, valley dark) so the static bake catches raking light (dev-spec §5.2 step 4). */
  private compositeBump(): void {
    const ctx = this.bumpCtx;
    const res = this.resolution;
    ctx.save();
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, res, res);
    // Faint grayscale of the paper texture → micro-relief that responds to light.
    ctx.globalAlpha = 0.22;
    ctx.filter = 'grayscale(1)';
    ctx.drawImage(this.mapCanvas, 0, 0, res, res);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    // Crease ridges: brighter than mid for mountains (raised), darker for valleys (groove).
    for (const c of this.creases) {
      const tone = c.type === 'mountain' ? '235,235,235' : '40,40,40';
      this.softLine(ctx, c.from, c.to, tone, 0.85);
    }
    ctx.restore();
  }

  /**
   * Stroke a soft ridge from `a` to `b` (unit coords) by laying parallel sub-strokes offset along the
   * segment normal, each weighted by `creaseRidgeProfile` — a `cos` falloff that builds the ~8 px-wide
   * ridge without relying on the canvas `blur` filter. `rgb` is the stroke colour, `peakAlpha` its
   * centre opacity. Done in the active composite mode (multiply for tint, source-over for bump).
   */
  private softLine(
    ctx: CanvasRenderingContext2D,
    a: Point,
    b: Point,
    rgb: string,
    peakAlpha: number,
  ): void {
    const pa = this.toPx(a);
    const pb = this.toPx(b);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; // unit normal
    const ny = dx / len;
    const hw = CREASE_HALF_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    for (let o = -hw; o <= hw; o++) {
      const w = creaseRidgeProfile(Math.abs(o) / hw);
      if (w <= 0) continue;
      ctx.strokeStyle = `rgba(${rgb},${peakAlpha * w})`;
      ctx.beginPath();
      ctx.moveTo(pa.x + nx * o, pa.y + ny * o);
      ctx.lineTo(pb.x + nx * o, pb.y + ny * o);
      ctx.stroke();
    }
  }

  /** Wait for the paper-shaders mount to produce an actually-drawn frame. The mount sizes its canvas
   *  via a ResizeObserver and renders on RAF, so a non-zero size doesn't yet mean a flushed draw —
   *  poll until a sampled pixel is non-transparent (the black-frame guard, dev-spec M5 test). Returns
   *  the WebGL canvas once it has content, or null on timeout so the caller falls back to flat colour. */
  private waitForRender(): Promise<HTMLCanvasElement | null> {
    const canvas = this.shader?.canvasElement ?? null;
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const pctx = probe.getContext('2d');
    const hasContent = (): boolean => {
      if (!canvas || canvas.width === 0 || canvas.height === 0 || !pctx) return false;
      try {
        // Downscale the whole frame into 1×1 and read it: a non-zero alpha means something was drawn.
        pctx.clearRect(0, 0, 1, 1);
        pctx.drawImage(canvas, 0, 0, 1, 1);
        return pctx.getImageData(0, 0, 1, 1).data[3]! > 0;
      } catch {
        return false;
      }
    };
    return new Promise((resolve) => {
      let tries = 0;
      const check = () => {
        if (this.disposed) return resolve(null);
        if (hasContent()) return resolve(canvas);
        if (tries++ > 40) return resolve(null);
        requestAnimationFrame(check);
      };
      check();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.shader?.dispose();
    this.shader = null;
    this.mapTexture.dispose();
    this.bumpTexture.dispose();
    if (this.shaderHost.parentNode) this.shaderHost.parentNode.removeChild(this.shaderHost);
    // Detach from the shared material (AlphaMapBaker owns + disposes the material itself).
    this.material.map = null;
    this.material.bumpMap = null;
  }
}

function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function get2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('PaperTextureBaker: 2D context unavailable');
  return ctx;
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

/** Best-effort decode so the noise image is ready before the shader samples it. */
async function decodeImage(img: HTMLImageElement): Promise<void> {
  try {
    if (typeof img.decode === 'function') await img.decode();
  } catch {
    // decode() rejects if the image is already complete or unsupported — harmless here.
  }
}
