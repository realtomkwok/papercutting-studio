/**
 * WedgeEditor (M2) — the Paper.js view layer for the folded-wedge editor (dev-spec §4).
 *
 * Draws the triangular wedge with "folded edge" / "open edge" labels, hosts the drawing tools
 * (pencil sketch, the four unit-pattern stamps, eraser, scissors), and converts Paper.js geometry to
 * plain unit-square points at its boundary. All validation/snapping/history/region-detection lives in
 * `EditorModel`, `core/`, and `bridge/`; this file turns pointer events into point arrays and renders
 * the committed cuts, the pencil sketch, and the scissors' highlighted enclosed areas.
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
// (so cuts read as hollow). The scissors draw a live cyan lasso line; on release the enclosed area is
// cut out. The eraser washes committed cuts in faint cyan to say "tap to remove".
const PAPER_FILL = new paper.Color('#c8102e');
const HOLE_FILL = new paper.Color('#faf7f2');
const LASSO_STROKE = new paper.Color(0.0, 0.55, 0.7, 0.95); // live scissors lasso line
const CUT_HINT_FILL = new paper.Color(0.0, 0.55, 0.7, 0.12); // eraser: a dimmed "tap to remove" hole
const CUT_HINT_STROKE = new paper.Color(0.0, 0.45, 0.6, 0.5);
const GHOST_FILL = new paper.Color(1, 1, 1, 0.35); // stamp ghost preview
const INK_STROKE = new paper.Color(1, 1, 1, 0.92); // stamp ghost outline

export class WedgeEditor {
  private readonly shadowLayer: paper.Layer;
  private readonly staticLayer: paper.Layer;
  private readonly pathsLayer: paper.Layer;
  private readonly toolLayer: paper.Layer;
  private readonly ghostLayer: paper.Layer;
  private readonly tool: paper.Tool;

  private current: EngineTool = 'scissors';
  private draft: paper.Path | null = null;
  /** The lasso draft's clip group (wedge mask + lasso line), so the line off the paper is invisible. */
  private draftGroup: paper.Group | null = null;

  private scale = 1;
  /** Interactive zoom multiplier (scroll-to-zoom), applied on top of the fit-to-canvas scale. */
  private zoom = 1;
  private center = new paper.Point(0, 0);
  /** Unit-space point mapped to the view centre — the wedge bounding-box centre, so the wedge is
   *  framed in the middle of the canvas rather than hung off its apex at the origin. */
  private frameCenter: Point = { x: 0, y: 0 };
  /** View-only rotation of the paper, in degrees (drawing convenience; geometry unaffected). */
  private rotationDeg = 180;
  /** Anchor captured on rotate-tool pointer-down: cursor angle around the centre + the rotation then,
   *  so the drag turns the paper to follow the cursor (a real rotate handle) instead of reacting to
   *  horizontal movement alone — which reversed below the centre. */
  private rotateStart: { angle: number; deg: number } | null = null;

  /** Stamp radius in unit-square units (settable via the size slider). */
  private stampSize = 0.03;

  constructor(
    private readonly scope: paper.PaperScope,
    private readonly model: EditorModel,
    private fold: FoldConfig,
    /** Baked paper texture (M5). When it returns a canvas, the wedge sheet is painted with it instead
     *  of flat red, so the 2D editor reflects the chosen paper stock. */
    private readonly paperTexture?: PaperTextureSource,
  ) {
    this.scope.activate();
    this.shadowLayer = new paper.Layer(); // must be first — rendered below the wedge fill
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

    // Scroll-to-zoom: wheel over the canvas scales the editor view about its centre. Non-passive so
    // we can suppress the page from scrolling underneath.
    this.scope.view.element.addEventListener('wheel', this.onWheel, { passive: false });

    this.relayout(); // also renders the current composed region
  }

  /** Wheel → zoom the editor view (centred). Bound so it can be added/removed as a listener. */
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015); // smooth, direction-correct (up = zoom in)
    this.zoom = Math.min(6, Math.max(0.3, this.zoom * factor));
    this.relayout();
  };

  setTool(tool: EngineTool): void {
    this.current = tool;
    this.cancelDraft();
    this.clearGhost();
    // The hand tool gets a grab cursor; every drawing tool falls back to the default crosshair-ish.
    this.scope.view.element.style.cursor = tool === 'rotate' ? 'grab' : '';
    this.refresh(); // scissors highlights only show while the scissors tool is active
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

  /** The wedge outline as a closed Paper.js path in view coordinates — used to clip pencil ink to
   *  the paper so anything drawn off the edge is invisible. */
  private wedgeViewPath(): paper.Path {
    return new paper.Path({
      segments: this.wedgeVertices().map((v) => this.unitToView(v)),
      closed: true,
    });
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
    this.frameCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

    // Compute scale and canvas centre from the *rotated* bounding box so the wedge always fits
    // and is centred regardless of rotation angle.
    const r = (this.rotationDeg * Math.PI) / 180;
    const cosR = Math.cos(r), sinR = Math.sin(r);
    const rotated = verts.map((v) => {
      const dx = v.x - this.frameCenter.x;
      const dy = -(v.y - this.frameCenter.y); // y-flip matches unitToView
      return { x: dx * cosR - dy * sinR, y: dx * sinR + dy * cosR };
    });
    const rxs = rotated.map((p) => p.x);
    const rys = rotated.map((p) => p.y);
    const minRX = Math.min(...rxs), maxRX = Math.max(...rxs);
    const minRY = Math.min(...rys), maxRY = Math.max(...rys);
    const rbw = Math.max(maxRX - minRX, 1e-6);
    const rbh = Math.max(maxRY - minRY, 1e-6);
    this.scale = 0.85 * Math.min(width / rbw, height / rbh) * this.zoom;
    // Shift the canvas centre so the rotated bounding box is centred on screen.
    this.center = new paper.Point(
      width / 2 - ((minRX + maxRX) / 2) * this.scale,
      height / 2 - ((minRY + maxRY) / 2) * this.scale,
    );

    this.drawStatic();
    this.refresh();
  }

  private drawStatic(): void {
    this.scope.activate();
    this.staticLayer.removeChildren();
    this.staticLayer.activate();

    const verts = this.wedgeVertices().map((v) => this.unitToView(v));

    // ── Wedge (shadow is rebuilt in refresh() so it tracks cut holes; see shadowLayer) ──
    // The editable wedge triangle, derived from the fold's boundary angles: origin → start-edge
    // corner → end-edge corner. The two rays are the folded edges; the outer span is the open edge.
    const wedge = new paper.Path({ segments: verts, closed: true });
    // Outline is drawn separately below so the two folded edges read as dashed crease lines while the
    // open edge stays solid — the wedge path itself carries only the fill (or texture).

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

    // Open edge only — no dashed crease lines on the folded edges (they don't represent actual crease
    // positions in the final paper and are visually confusing on top of the paper texture).
    const [, c1, c2] = verts;
    const openEdge = new paper.Path({ segments: [c1!, c2!] });
    openEdge.strokeColor = new paper.Color(0.4, 0.05, 0.1, 0.18);
    openEdge.strokeWidth = 1.5;
  }


  /**
   * Redraw, from model state, the editor layers: the committed cuts (holes) and — while the eraser
   * tool is active — a dimmed "tap to remove" hint over each cut. The scissors lasso draws its live
   * line directly during the drag, so it needs no persistent overlay here. Called on every
   * `pathschange` / `outlineschange` and on tool change.
   */
  refresh(): void {
    this.scope.activate();

    // ── Shadow layer — rebuilt here so it tracks the cut silhouette ──────────
    // CompoundPath with evenodd: outer = wedge, inners = cut holes. Canvas only casts shadow from
    // filled pixels, so no shadow bleeds through the holes. Three passes mirror --shadow-elevation-high.
    this.shadowLayer.removeChildren();
    this.shadowLayer.activate();
    const shadowVerts = this.wedgeVertices().map((v) => this.unitToView(v));
    const contours = this.model.composedContours;
    const shadowDark = new paper.Color(0.08, 0.04, 0.02);
    const makeSilhouette = () =>
      new paper.CompoundPath({
        children: [
          new paper.Path({ segments: shadowVerts, closed: true }),
          ...contours.map(
            (pts) => new paper.Path({ segments: pts.map((p) => this.unitToView(p)), closed: true }),
          ),
        ],
        fillRule: 'evenodd',
      });
    const s1 = makeSilhouette();
    s1.fillColor = shadowDark;
    s1.shadowColor = new paper.Color(0.08, 0.04, 0.02, 0.36);
    s1.shadowBlur = this.scale * 0.016;
    s1.shadowOffset = new paper.Point(this.scale * 0.005, this.scale * 0.022);
    const s2 = makeSilhouette();
    s2.fillColor = shadowDark;
    s2.shadowColor = new paper.Color(0.08, 0.04, 0.02, 0.18);
    s2.shadowBlur = this.scale * 0.055;
    s2.shadowOffset = new paper.Point(this.scale * 0.004, this.scale * 0.04);
    const s3 = makeSilhouette();
    s3.fillColor = shadowDark;
    s3.shadowColor = new paper.Color(0.08, 0.04, 0.02, 0.09);
    s3.shadowBlur = this.scale * 0.12;
    s3.shadowOffset = new paper.Point(this.scale * 0.003, this.scale * 0.07);

    this.pathsLayer.removeChildren();
    this.pathsLayer.activate();

    // Committed cuts punch holes in the red paper: fill the merged removed-region with the background
    // colour (even-odd so island-holes render correctly), so they read as hollow like the final piece.
    // Painted over the ink, so a cut area's pencil lines disappear under the clean hole.
    if (contours.length > 0) {
      const buildRegion = () =>
        new paper.CompoundPath({
          children: contours.map(
            (pts) => new paper.Path({ segments: pts.map((p) => this.unitToView(p)), closed: true }),
          ),
          fillRule: 'evenodd',
        });
      // Punch real holes: erase the red paper so the dotted-grid backdrop shows through the cut,
      // exactly like the removed paper of the finished piece. `destination-out` composites against
      // everything already drawn beneath (including shadowLayer), leaving those pixels transparent.
      const hole = buildRegion();
      hole.fillColor = HOLE_FILL; // colour is irrelevant under destination-out; alpha 1 = full erase
      hole.blendMode = 'destination-out';
      // Cut edge — drawn AFTER destination-out so its shadow survives and appears on both sides:
      // inward into the transparent hole (depth on the exposed surface) and outward onto the paper
      // surface (a crisp paper-edge shadow). This is the border that traces the cut paper.
      const edge = buildRegion();
      edge.strokeColor = new paper.Color(0.08, 0.04, 0.02, 0.6);
      edge.strokeWidth = 1.5;
      edge.shadowColor = new paper.Color(0.08, 0.04, 0.02, 0.5);
      edge.shadowBlur = this.scale * 0.006;
      edge.shadowOffset = new paper.Point(this.scale * 0.0015, this.scale * 0.003);
    }

    // Eraser overlay: a dimmed cyan wash over each committed cut so the user knows a tap removes it.
    if (this.current === 'erase' && contours.length > 0) {
      const hint = new paper.CompoundPath({
        children: contours.map(
          (pts) => new paper.Path({ segments: pts.map((p) => this.unitToView(p)), closed: true }),
        ),
      });
      hint.fillRule = 'evenodd';
      hint.fillColor = CUT_HINT_FILL;
      hint.strokeColor = CUT_HINT_STROKE;
      hint.strokeWidth = 1;
      hint.dashArray = [3, 3];
    }
  }

  // ── tool handlers ─────────────────────────────────────────────────────────
  /** Angle (radians) of a view-space point around the canvas centre, for the rotate handle. */
  private pointerAngle(p: paper.Point): number {
    return Math.atan2(p.y - this.center.y, p.x - this.center.x);
  }

  private onDown(e: paper.ToolEvent): void {
    const tool = this.current;
    const u = this.viewToUnit(e.point);
    if (tool === 'rotate') {
      this.scope.view.element.style.cursor = 'grabbing';
      this.rotateStart = { angle: this.pointerAngle(e.point), deg: this.rotationDeg };
      return; // rotation happens on drag; a bare click is a no-op
    }
    if (tool === 'erase') {
      this.model.removeCutAt(u); // tap a cut-out to un-cut it
      return;
    }
    if (STAMP_KINDS[tool]) {
      this.clearGhost();
      // A stamp commits its exact polygon directly (skipping the raster detector so the cut
      // matches the ghost preview — the detector's dilation would shift the boundary).
      const outline = makeStamp(STAMP_KINDS[tool], u, this.stampSize);
      this.model.commit(outline);
      return;
    }
    // Scissors: begin a freeform lasso draft — the enclosed area is cut out on release.
    this.toolLayer.activate();
    this.draft = new paper.Path({ segments: [e.point], closed: false });
    this.draft.strokeColor = LASSO_STROKE;
    this.draft.strokeWidth = 1.5;
    this.draft.strokeCap = 'round';
    // Clip the live lasso to the wedge so the line drawn off the paper is invisible while drawing.
    this.draftGroup = new paper.Group([this.wedgeViewPath(), this.draft]);
    this.draftGroup.clipped = true;
  }

  private onDrag(e: paper.ToolEvent): void {
    if (this.current === 'rotate') {
      // Turn the paper to follow the cursor's angle around the centre (a rotate handle).
      if (this.rotateStart) {
        const delta = ((this.pointerAngle(e.point) - this.rotateStart.angle) * 180) / Math.PI;
        this.setViewRotation(this.rotateStart.deg + delta);
      }
      return;
    }
    if (this.draft) this.draft.add(e.point);
  }

  private onUp(_e: paper.ToolEvent): void {
    if (this.current === 'rotate') {
      this.scope.view.element.style.cursor = 'grab';
      this.rotateStart = null;
      return;
    }
    if (!this.draft) return;
    const draft = this.draft;
    this.draft = null;
    // Smooth the freehand jitter, then FLATTEN the curve back into line segments before reading
    // points — `simplify()` alone leaves bézier handles our plain point model can't keep. Flatten
    // samples it faithfully into a dense polyline.
    // draft.simplify(1); // smooth freehand jitter (dev-spec §4)
    // draft.flatten(5); // → dense polyline following the curve, no handles
    draft.smooth()
    const pts = draft.segments.map((s) => this.viewToUnit(s.point));
    this.draftGroup?.remove();
    this.draftGroup = null;
    this.model.lassoCut(pts); // scissors lasso → cut the enclosed area immediately
  }

  /** Cursor preview under the pointer: a translucent stamp for the stamp tools, or a brush-size
   *  circle for the pencil and eraser so their width is visible before drawing. */
  private onMove(e: paper.ToolEvent): void {
    const kind = STAMP_KINDS[this.current];
    this.clearGhost();
    this.ghostLayer.activate();

    if (kind) {
      const ghost = new paper.Path({
        segments: makeStamp(kind, this.viewToUnit(e.point), this.stampSize).map((p) =>
          this.unitToView(p),
        ),
        closed: true,
      });
      ghost.fillColor = GHOST_FILL;
      ghost.strokeColor = INK_STROKE;
      ghost.strokeWidth = 1;
      ghost.dashArray = [4, 3];
    }
  }

  private clearGhost(): void {
    this.ghostLayer.removeChildren();
  }

  private cancelDraft(): void {
    this.draftGroup?.remove();
    this.draftGroup = null;
    this.draft = null;
  }

  dispose(): void {
    this.cancelDraft();
    this.scope.view.element.removeEventListener('wheel', this.onWheel);
    this.tool.remove();
    this.staticLayer.remove();
    this.pathsLayer.remove();
    this.toolLayer.remove();
    this.ghostLayer.remove();
  }
}
