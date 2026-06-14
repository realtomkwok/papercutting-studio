/**
 * WedgeEditor (M2) — the Paper.js view layer for the folded-wedge editor (dev-spec §4).
 *
 * Draws the triangular wedge with "folded edge" / "open edge" labels, hosts the drawing tools
 * (freehand, the four unit-pattern stamps, contour cut, erase), and converts Paper.js geometry to
 * plain unit-square points at its boundary. All validation/snapping/history lives in `EditorModel`
 * and `core/`; this file only turns pointer events into point arrays and renders committed cuts.
 *
 * Coordinate frame: unit square x,y ∈ [−0.5, 0.5] (math-up). The view transform maps it to a
 * centred, padded box in canvas pixels (y flips). This is the *only* place that conversion happens.
 */

import paper from 'paper';
import type { FoldConfig } from '../core/foldConfig';
import { boundaryPointAtAngle, type Point } from '../core/geometry';
import { makeStamp, type StampKind } from '../core/stamps';
import type { EditorModel } from './EditorModel';
import type { PaperTextureSource } from './UnfoldPreview';
import type { EngineTool } from '../engine/api';

const STAMP_KINDS: Record<string, StampKind> = {
  crescent: 'crescent',
  circle: 'circle',
  sawtooth: 'sawtooth',
  triangle: 'triangle',
};

// Editor matches the final design: the paper is RED (kept material), holes are the page background
// (so cuts read as hollow), pending pencil stencils are dashed white on the red.
const PAPER_FILL = new paper.Color('#c8102e');
const HOLE_FILL = new paper.Color('#faf7f2');
const CUT_STROKE = new paper.Color(0.55, 0.02, 0.1, 0.8);
const PENCIL_STROKE = new paper.Color(1, 1, 1, 0.95); // pending pencil stencil (not yet cut)
const ERASE_STROKE = new paper.Color(0.15, 0.35, 0.85, 0.95); // eraser stroke (restores paper)
const GHOST_FILL = new paper.Color(1, 1, 1, 0.35); // stamp ghost preview

export class WedgeEditor {
  private readonly staticLayer: paper.Layer;
  private readonly pathsLayer: paper.Layer;
  private readonly toolLayer: paper.Layer;
  private readonly ghostLayer: paper.Layer;
  private readonly tool: paper.Tool;

  private current: EngineTool = 'freehand';
  private draft: paper.Path | null = null;
  private draftMode: 'cut' | 'restore' = 'cut';

  private scale = 1;
  private center = new paper.Point(0, 0);
  /** Unit-space point mapped to the view centre — the wedge bounding-box centre, so the wedge is
   *  framed in the middle of the canvas rather than hung off its apex at the origin. */
  private frameCenter: Point = { x: 0, y: 0 };
  /** View-only rotation of the paper, in degrees (drawing convenience; geometry unaffected). */
  private rotationDeg = 0;

  /** Stamp radius in unit-square units (settable via the size slider). */
  private stampSize = 0.12;

  constructor(
    private readonly scope: paper.PaperScope,
    private readonly model: EditorModel,
    private fold: FoldConfig,
    /** Baked paper texture (M5). When it returns a canvas, the wedge sheet is painted with it instead
     *  of flat red, so the 2D editor reflects the chosen paper stock. */
    private readonly paperTexture?: PaperTextureSource,
  ) {
    this.scope.activate();
    this.staticLayer = new paper.Layer();
    this.pathsLayer = new paper.Layer();
    this.toolLayer = new paper.Layer();
    this.ghostLayer = new paper.Layer();

    this.tool = new paper.Tool();
    this.tool.minDistance = 4;
    this.tool.onMouseDown = (e: paper.ToolEvent) => this.onDown(e);
    this.tool.onMouseDrag = (e: paper.ToolEvent) => this.onDrag(e);
    this.tool.onMouseUp = (e: paper.ToolEvent) => this.onUp(e);
    this.tool.onMouseMove = (e: paper.ToolEvent) => this.onMove(e);

    this.scope.view.onResize = () => this.relayout();

    this.relayout(); // also renders the current composed region
  }

  setTool(tool: EngineTool): void {
    this.current = tool;
    this.cancelDraft();
    this.clearGhost();
  }

  setStampSize(size: number): void {
    this.stampSize = Math.max(0.01, size);
  }

  setViewRotation(deg: number): void {
    this.rotationDeg = deg;
    this.relayout();
  }

  setFold(fold: FoldConfig): void {
    this.fold = fold;
    this.relayout();
  }

  /** Re-paint the wedge sheet after a paper-shaders re-bake (the texture canvas changed in place, so
   *  the Paper.js raster must be recreated from it). Static layer only; cuts/pending are untouched. */
  redrawPaper(): void {
    this.drawStatic();
  }

  // ── coordinate transform (frame → scale + y-flip → view rotation) ─────────
  private unitToView(p: Point): paper.Point {
    const dx = (p.x - this.frameCenter.x) * this.scale;
    const dy = -(p.y - this.frameCenter.y) * this.scale;
    const r = (this.rotationDeg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return new paper.Point(this.center.x + dx * c - dy * s, this.center.y + dx * s + dy * c);
  }

  private viewToUnit(vp: paper.Point): Point {
    const r = (-this.rotationDeg * Math.PI) / 180; // inverse rotation
    const c = Math.cos(r);
    const s = Math.sin(r);
    const ox = vp.x - this.center.x;
    const oy = vp.y - this.center.y;
    const dx = ox * c - oy * s;
    const dy = ox * s + oy * c;
    return { x: dx / this.scale + this.frameCenter.x, y: -(dy / this.scale) + this.frameCenter.y };
  }

  /** Wedge outline vertices in unit space: apex at the origin plus the two outer-edge corners. */
  private wedgeVertices(): Point[] {
    return [
      { x: 0, y: 0 },
      boundaryPointAtAngle(this.fold.wedgeStart, 0.5),
      boundaryPointAtAngle(this.fold.wedgeEnd, 0.5),
    ];
  }

  // ── static wedge + committed cuts rendering ───────────────────────────────
  private relayout(): void {
    const { width, height } = this.scope.view.viewSize;
    this.center = new paper.Point(width / 2, height / 2);

    // Frame the wedge's bounding box (not the origin) in the middle of the canvas, filling ~85%.
    const verts = this.wedgeVertices();
    const xs = verts.map((v) => v.x);
    const ys = verts.map((v) => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bw = Math.max(maxX - minX, 1e-6);
    const bh = Math.max(maxY - minY, 1e-6);
    this.frameCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    this.scale = 0.85 * Math.min(width / bw, height / bh);

    this.drawStatic();
    this.refresh();
  }

  private drawStatic(): void {
    this.scope.activate();
    this.staticLayer.removeChildren();
    this.staticLayer.activate();

    // The editable wedge triangle, derived from the fold's boundary angles: origin → start-edge
    // corner → end-edge corner. The two rays are the folded edges; the outer span is the open edge.
    const wedge = new paper.Path({
      segments: this.wedgeVertices().map((v) => this.unitToView(v)),
      closed: true,
    });
    wedge.strokeColor = new paper.Color(0.4, 0.05, 0.1);
    wedge.strokeWidth = 1.5;

    // Paper sheet fill: the baked paper texture (cover-fit + clipped to the wedge) if available, else
    // flat red. The raster reads the texture canvas at creation, so redrawPaper() recreates it.
    const tex = this.paperTexture?.();
    if (tex && tex.width > 0) {
      const raster = new paper.Raster(tex);
      const b = wedge.bounds;
      const cover = Math.max(b.width / raster.width, b.height / raster.height);
      raster.scale(cover);
      raster.position = b.center;
      const clip = wedge.clone();
      const group = new paper.Group([clip, raster]);
      group.clipped = true; // first child (the wedge clone) masks the raster to the wedge shape
    } else {
      wedge.fillColor = PAPER_FILL; // the paper sheet is red (matches the final design)
    }

    // Labels at the mid-radius of each folded edge and just outside the open edge.
    const startMid = boundaryPointAtAngle(this.fold.wedgeStart, 0.25);
    const endMid = boundaryPointAtAngle(this.fold.wedgeEnd, 0.25);
    const openMid = boundaryPointAtAngle((this.fold.wedgeStart + this.fold.wedgeEnd) / 2, 0.5);
    this.addLabel('folded edge', { x: startMid.x, y: startMid.y - 0.03 });
    this.addLabel('folded edge', { x: endMid.x - 0.04, y: endMid.y + 0.04 });
    this.addLabel('open edge', { x: openMid.x + 0.06, y: openMid.y });
  }

  private addLabel(text: string, at: Point): void {
    const label = new paper.PointText(this.unitToView(at));
    label.content = text;
    // White with a soft dark shadow so it reads on both the red paper and the light background.
    label.fillColor = new paper.Color(1, 1, 1, 0.95);
    label.shadowColor = new paper.Color(0, 0, 0, 0.5);
    label.shadowBlur = 3;
    label.fontSize = 11;
    label.justification = 'center';
  }

  /**
   * Redraw the committed cuts (one merged solid region) and the pending design (dashed, no fill) from
   * model state. Called on every `pathschange` / `outlineschange`. Both are the compositor's even-odd
   * contours, so overlaps read as one shape and island-holes punch through cleanly. The pending design
   * is the stencil the pencil/eraser are building and the scissors will later cut.
   */
  refresh(): void {
    this.scope.activate();
    this.pathsLayer.removeChildren();
    this.pathsLayer.activate();

    // Committed cuts punch holes in the red paper: fill the merged removed-region with the background
    // colour (even-odd so island-holes render correctly), so they read as hollow like the final piece.
    const contours = this.model.composedContours;
    if (contours.length > 0) {
      const region = new paper.CompoundPath({
        children: contours.map(
          (pts) => new paper.Path({ segments: pts.map((p) => this.unitToView(p)), closed: true }),
        ),
      });
      region.fillRule = 'evenodd';
      region.fillColor = HOLE_FILL;
      region.strokeColor = CUT_STROKE;
      region.strokeWidth = 0.75;
    }

    // Pending design — dashed white outline on the red paper (eraser notches already subtracted),
    // awaiting the scissors. Even-odd so interior holes draw as holes, not overlapping outlines.
    const pending = this.model.composedPending;
    if (pending.length > 0) {
      const stencil = new paper.CompoundPath({
        children: pending.map(
          (pts) => new paper.Path({ segments: pts.map((p) => this.unitToView(p)), closed: true }),
        ),
      });
      stencil.fillRule = 'evenodd';
      stencil.strokeColor = PENCIL_STROKE;
      stencil.strokeWidth = 1.25;
      stencil.dashArray = [5, 4];
    }
  }

  // ── tool handlers ─────────────────────────────────────────────────────────
  private onDown(e: paper.ToolEvent): void {
    const tool = this.current;
    const u = this.viewToUnit(e.point);
    if (tool === 'scissors') {
      this.model.cut(u); // cut out the pending outline under the cursor
      return;
    }
    if (STAMP_KINDS[tool]) {
      this.clearGhost();
      this.model.drawOutline(makeStamp(STAMP_KINDS[tool], u, this.stampSize)); // stamp → pending
      return;
    }
    // pencil / contour (cut) and eraser (restore) begin a freehand draft stroke.
    this.draftMode = tool === 'erase' ? 'restore' : 'cut';
    this.toolLayer.activate();
    this.draft = new paper.Path({ segments: [e.point], closed: false });
    this.draft.strokeColor = this.draftMode === 'restore' ? ERASE_STROKE : PENCIL_STROKE;
    this.draft.strokeWidth = 1.5;
  }

  private onDrag(e: paper.ToolEvent): void {
    if (this.draft) this.draft.add(e.point);
  }

  private onUp(_e: paper.ToolEvent): void {
    if (!this.draft) return;
    const draft = this.draft;
    const mode = this.draftMode;
    this.draft = null;
    // Close the lasso, smooth it, then FLATTEN the smoothed curve back into line segments before
    // reading points. `simplify()` alone yields a bézier path whose segment anchors (what our plain
    // point model keeps) are too sparse — straightening them can collapse or self-cross the shape,
    // which is why freehand cuts sometimes failed to close. Flatten samples the curve faithfully.
    draft.closed = true;
    draft.simplify(2.5); // smooth freehand jitter (dev-spec §4)
    draft.flatten(3); // → dense polyline following the closed curve, no handles
    const pts = draft.segments.map((s) => this.viewToUnit(s.point));
    draft.remove();
    if (mode === 'restore') {
      this.model.erase(pts); // eraser → subtract from the cuts (restore paper)
    } else {
      this.model.drawOutline(pts); // pencil → pending outline (scissors cut it out later)
    }
  }

  /** Ghost preview: while a stamp tool is active, show a translucent stamp under the cursor. */
  private onMove(e: paper.ToolEvent): void {
    const kind = STAMP_KINDS[this.current];
    if (!kind) {
      this.clearGhost();
      return;
    }
    this.clearGhost();
    this.ghostLayer.activate();
    const ghost = new paper.Path({
      segments: makeStamp(kind, this.viewToUnit(e.point), this.stampSize).map((p) =>
        this.unitToView(p),
      ),
      closed: true,
    });
    ghost.fillColor = GHOST_FILL;
    ghost.strokeColor = PENCIL_STROKE;
    ghost.strokeWidth = 1;
    ghost.dashArray = [4, 3];
  }

  private clearGhost(): void {
    this.ghostLayer.removeChildren();
  }

  private cancelDraft(): void {
    if (this.draft) {
      this.draft.remove();
      this.draft = null;
    }
  }

  dispose(): void {
    this.cancelDraft();
    this.tool.remove();
    this.staticLayer.remove();
    this.pathsLayer.remove();
    this.toolLayer.remove();
    this.ghostLayer.remove();
  }
}
