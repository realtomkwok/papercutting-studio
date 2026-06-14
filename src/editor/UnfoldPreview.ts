/**
 * UnfoldPreview (M2) — renders the unfolded pattern to a 2D canvas as filled polygons.
 *
 * Two roles, one renderer, distinguished by colours:
 *  - the hidden **bake** canvas uses the alphaMap convention — white paper, black cuts (holes) —
 *    which at M3 becomes a `THREE.CanvasTexture` (`needsUpdate = true` after each redraw, gotcha §10.5);
 *  - the visible **side preview** uses paper-red with open (page-coloured) holes, so the user sees the
 *    full 8-fold symmetric result live while drawing (dev-spec §1, §4 — the "ghost preview").
 *
 * Raw 2D canvas rather than Paper.js: the output is just filled polygons, so a direct `fill()` is
 * faster and avoids a second Paper.js scope. Paper.js boolean ops are reserved for export (§4).
 */

import type { Point } from '../core/geometry';
import type { UnfoldResult } from '../core/unfold';

export interface PreviewColors {
  /** The paper sheet. */
  readonly paper: string;
  /** The cut-out holes (and the canvas background behind the sheet). */
  readonly hole: string;
}

/** alphaMap convention: white = opaque paper, black = hole (dev-spec §5.1). */
export const BAKE_COLORS: PreviewColors = { paper: '#ffffff', hole: '#000000' };
/** Iconic look for the visible preview: red sheet, holes punched through to the page. */
export const PREVIEW_COLORS: PreviewColors = { paper: '#c8102e', hole: '#faf7f2' };

export class UnfoldPreview {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly colors: PreviewColors = BAKE_COLORS,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('UnfoldPreview: 2D context unavailable on preview canvas');
    this.ctx = ctx;
  }

  /** Unit-square coord (x,y ∈ [−0.5, 0.5]) → canvas pixel (y flips: math-up vs canvas-down). */
  private toPx(p: Point): Point {
    return {
      x: (p.x + 0.5) * this.canvas.width,
      y: (0.5 - p.y) * this.canvas.height,
    };
  }

  render(result: UnfoldResult): void {
    const { ctx, canvas } = this;
    // The paper is the full unit square, so the sheet fill covers the canvas regardless of the
    // fold's wedge angle; per-fold framing only matters once non-square (cone) wedges land.

    // Background (= hole colour), then the paper sheet filling the whole canvas in the unit frame.
    ctx.fillStyle = this.colors.hole;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = this.colors.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Removed region: all reflected contours in ONE path, filled even-odd, so island-holes inside a
    // cut (paper that survived within a removed area) punch back through to the paper colour.
    ctx.beginPath();
    for (const copy of result.copies) {
      if (copy.points.length < 3) continue;
      const first = this.toPx(copy.points[0]!);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < copy.points.length; i++) {
        const q = this.toPx(copy.points[i]!);
        ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
    }
    ctx.fillStyle = this.colors.hole;
    ctx.fill('evenodd');
  }

  dispose(): void {
    // Nothing retained; the canvas is owned by the engine.
  }
}
