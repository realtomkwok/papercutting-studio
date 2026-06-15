/**
 * Empty `EditorEngine` for M0 — owns three canvases (Paper.js editor, hidden bake, Three.js view)
 * and a typed event bus. Subsequent milestones flesh out each subsystem; the API surface stays
 * stable (worked-example §3.2 contract).
 */

import paper from 'paper';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  EditorEngine,
  EngineEvent,
  EngineEventPayload,
  EngineMode,
  EngineTool,
  ExportFormat,
  PaperStockProps,
  Unsubscribe,
} from './api';
import { boundaryPointAtAngle, type Point } from '../core/geometry';
import { foldConfigs, symmetricalTriangle, type FoldConfig } from '../core/foldConfig';
import { EditorModel } from '../editor/EditorModel';
import { WedgeEditor } from '../editor/WedgeEditor';
import { UnfoldPreview, PREVIEW_COLORS } from '../editor/UnfoldPreview';
import type { UnfoldResult } from '../core/unfold';
import { CutCompositor } from '../editor/CutCompositor';
import { RegionDetector } from '../bridge/RegionDetector';
import { AlphaMapBaker } from '../bridge/AlphaMapBaker';
import { PaperTextureBaker } from '../bridge/PaperTextureBaker';
import { FoldRig } from '../scene/FoldRig';
import { generateCreases } from '../core/unfold';
import { loadTemplateInto } from '../templates';

/** Total unfold duration for `playUnfold`, scaled to hinge count (~2.5 s for the 8-panel case, dev-spec §6.2). */
const UNFOLD_DURATION_MS = 2500;

type Listener<E extends EngineEvent> = (payload: EngineEventPayload[E]) => void;

export class PaperCuttingEngine implements EditorEngine {
  private root: HTMLElement | null = null;
  private editorCanvas: HTMLCanvasElement | null = null;
  private bakeCanvas: HTMLCanvasElement | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private viewCanvas: HTMLCanvasElement | null = null;
  private resizeObs: ResizeObserver | null = null;

  private paperScope: paper.PaperScope | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  private listeners = new Map<EngineEvent, Set<Listener<EngineEvent>>>();

  // M2 editor subsystem. The model is headless (created eagerly); the views attach on mount.
  private readonly model: EditorModel;
  private editor: WedgeEditor | null = null;
  private preview: UnfoldPreview | null = null;
  private visiblePreview: UnfoldPreview | null = null;
  private compositor: CutCompositor | null = null;
  private detector: RegionDetector | null = null; // scissors: flood-fill enclosed-area detection
  private baker: AlphaMapBaker | null = null; // M3 bridge: bake canvas → THREE alphaMap mesh
  private paperBaker: PaperTextureBaker | null = null; // M5: paper-shaders colour map + crease bump
  private foldRig: FoldRig | null = null; // M4: nested-hinge rig driven by the unfold scrubber
  private controls: OrbitControls | null = null; // M4: orbit the 3D paper in the unfold view
  private fold: FoldConfig = symmetricalTriangle;
  private currentTool: EngineTool = 'freehand';
  private unsubPaths: Unsubscribe | null = null;
  private lastUnfold: UnfoldResult | null = null; // cached so a re-bake can repaint the 2D previews

  // M4 3D loop: a RAF loop runs only while the unfold view is shown (orbit damping + play animation).
  private mode: EngineMode = 'draw';
  private rafId: number | null = null;
  private unfoldProgress = 1;
  private playStart: number | null = null; // timestamp while playUnfold animates; null when idle

  constructor() {
    this.model = new EditorModel({
      emit: <E extends EngineEvent>(event: E, payload: EngineEventPayload[E]) =>
        this.emit(event, payload),
      onUnfold: (result) => {
        this.lastUnfold = result;
        this.preview?.render(result); // hidden bake (white/black → alphaMap, M3)
        this.visiblePreview?.render(result); // visible side preview (paper texture, open holes)
        // M3 bridge: the bake canvas just changed → re-upload it and repaint the 3D view.
        this.baker?.update();
        this.render3d();
      },
      fold: this.fold,
    });
  }

  mount(el: HTMLElement): void {
    if (this.root) throw new Error('EditorEngine.mount called twice');
    this.root = el;

    this.editorCanvas = makeCanvas(el, 'pc-editor-canvas', {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      background: '#faf7f2', // light paper backdrop, independent of the OS colour scheme
    });

    // Hidden bake canvas: full-square unfolded pattern at texture resolution.
    this.bakeCanvas = makeCanvas(el, 'pc-bake-canvas', {
      position: 'absolute',
      left: '-10000px',
      top: '-10000px',
      width: '2048px',
      height: '2048px',
    });
    this.bakeCanvas.width = 2048;
    this.bakeCanvas.height = 2048;

    // Visible side preview: the live 8-fold unfolded result, overlaid in the corner. Non-interactive
    // (pointerEvents none) so it never intercepts drawing on the editor beneath it.
    this.previewCanvas = makeCanvas(el, 'pc-preview-canvas', {
      position: 'absolute',
      top: '12px',
      right: '12px',
      width: '240px',
      height: '240px',
      border: '1px solid rgba(0,0,0,0.12)',
      borderRadius: '6px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
      background: '#faf7f2',
      pointerEvents: 'none',
      zIndex: '5',
    });
    this.previewCanvas.width = 512;
    this.previewCanvas.height = 512;

    this.viewCanvas = makeCanvas(el, 'pc-view-canvas', {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'none',
    });

    // Size the editor canvas to its display box *before* paper reads it, then keep paper's logical
    // view size in CSS pixels (paper rescales the backing store by devicePixelRatio for crispness).
    // Without this the canvas keeps its 300×150 default and the wedge renders tiny and stretched.
    const cw = el.clientWidth || 800;
    const ch = el.clientHeight || 600;
    this.editorCanvas.width = cw;
    this.editorCanvas.height = ch;
    this.paperScope = new paper.PaperScope();
    this.paperScope.setup(this.editorCanvas);
    this.paperScope.view.viewSize = new this.paperScope.Size(cw, ch);

    // Keep the view in sync with container resizes; WedgeEditor relays out on view.onResize.
    this.resizeObs = new ResizeObserver(() => {
      const s = this.paperScope;
      const r = this.root;
      if (!s || !r) return;
      s.view.viewSize = new s.Size(r.clientWidth || 1, r.clientHeight || 1);
    });
    this.resizeObs.observe(el);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.viewCanvas, antialias: true });
    const { clientWidth, clientHeight } = el;
    this.renderer.setSize(clientWidth || 1, clientHeight || 1, false);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f1ea);
    this.camera = new THREE.PerspectiveCamera(
      45,
      (clientWidth || 1) / (clientHeight || 1),
      0.1,
      100,
    );
    this.camera.position.set(0, 0, 2);

    // Lighting for the MeshStandardMaterial: soft ambient fill + a key light so the cutout reads.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(1, 1, 2);
    this.scene.add(key);

    this.renderer.render(this.scene, this.camera);

    // M2 editor views: Paper.js wedge editor on the visible canvas, 2D-canvas preview on the bake
    // canvas. Re-render committed cuts whenever the model's path set changes (commit/undo/redo).
    // Boolean compositor (Paper.js): merges overlapping cuts and drops disconnected paper. Inject it
    // into the headless model so both the editor and the previews work off the merged region.
    this.compositor = new CutCompositor(this.paperScope!, () => this.wedgeVerts());
    this.model.setCompositor({
      committed: (batches) => this.compositor!.committed(batches),
    });
    // Scissors region detector (raster flood fill): finds the enclosed areas the pencil sketch seals
    // off, so the editor can highlight them and the model can cut them out.
    this.detector = new RegionDetector();
    this.model.setDetector({
      detect: (strokes, fold) => this.detector!.detect(strokes, fold),
    });

    // The 2D editor + side preview paint their paper with the M5 paper-shaders bake (a lazy closure —
    // the baker is created just below; it seeds a flat colour immediately so the closure is safe).
    const paperTex = () => this.paperBaker?.getMapCanvas() ?? null;
    this.editor = new WedgeEditor(this.paperScope!, this.model, this.fold, paperTex);
    this.editor.setTool(this.currentTool);
    this.preview = new UnfoldPreview(this.bakeCanvas!); // hidden alphaMap bake stays solid white
    this.visiblePreview = new UnfoldPreview(this.previewCanvas!, PREVIEW_COLORS, paperTex);

    // M3 bridge: wrap the bake canvas as a THREE alphaMap material. M4 fold rig: build one panel per
    // symmetry copy, all sharing that material, nested in hinge groups. The flat `baker.mesh` is no
    // longer added to the scene — the rig replaces it (at progress=1 the rig tiles the same square).
    this.baker = new AlphaMapBaker(this.bakeCanvas!);
    this.foldRig = new FoldRig(this.fold, this.baker.getMaterial());
    this.scene!.add(this.foldRig.group);
    this.foldRig.setProgress(this.unfoldProgress);

    // M5 paper-shaders bake: render the paper texture once into the shared material's colour `map`,
    // compositing crease bump + tint from the fold's crease star. Async (its own WebGL RAF), so repaint
    // the 3D view on completion. Seeds a flat colour immediately so the mesh never shows black.
    this.paperBaker = new PaperTextureBaker(this.baker.getMaterial(), el, {
      onBaked: () => {
        this.render3d(); // repaint the 3D paper with the new colour/bump map
        this.editor?.redrawPaper(); // 2D editor wedge picks up the new texture
        if (this.lastUnfold) this.visiblePreview?.render(this.lastUnfold); // side preview too
      },
    });
    this.paperBaker.setCreases(generateCreases(this.fold));
    void this.paperBaker.bake();

    // OrbitControls: spin/zoom the unfolded paper. Enabled only in the 3D view (toggled in setMode).
    this.controls = new OrbitControls(this.camera!, this.viewCanvas!);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    // Re-render the editor (merged cuts + pending outlines) on either change.
    const u1 = this.on('pathschange', () => this.editor?.refresh());
    const u2 = this.on('outlineschange', () => this.editor?.refresh());
    this.unsubPaths = () => {
      u1();
      u2();
    };
    this.model.renderPreviewNow(); // seed both previews with the (empty) starting state

    this.emit('ready', {});
  }

  /** Repaint the Three.js view. Render-on-demand for M3 (no animation loop until the M4 fold rig).
   *  Sizes the renderer + camera to the container first: the view canvas is `display:none` at mount,
   *  so its size isn't reliable until it's shown — sync here so the square plane stays square. */
  private render3d(): void {
    if (!this.renderer || !this.scene || !this.camera || !this.root) return;
    const w = this.root.clientWidth || 1;
    const h = this.root.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  /** RAF loop, alive only while the unfold view is shown. Advances the play-unfold animation, steps
   *  OrbitControls' damping, and repaints. Stops (and stops rescheduling) the moment we leave 3D. */
  private loop = (now: number): void => {
    if (this.mode !== 'unfold3d') {
      this.rafId = null;
      return;
    }
    if (this.playStart !== null) {
      const t = Math.min(1, (now - this.playStart) / UNFOLD_DURATION_MS);
      this.applyUnfoldProgress(t);
      if (t >= 1) this.playStart = null;
    }
    this.controls?.update();
    this.renderer?.render(this.scene!, this.camera!);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private startLoop(): void {
    if (this.rafId === null) this.rafId = requestAnimationFrame(this.loop);
  }

  /** Set the rig's fold state and notify the UI. Shared by the scrubber and the play animation. */
  private applyUnfoldProgress(t: number): void {
    this.unfoldProgress = Math.max(0, Math.min(1, t));
    this.foldRig?.setProgress(this.unfoldProgress);
    this.emit('unfoldprogress', { t: this.unfoldProgress });
  }

  dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.unsubPaths?.();
    this.unsubPaths = null;
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.model.dispose();
    this.editor?.dispose();
    this.preview?.dispose();
    this.visiblePreview?.dispose();
    this.controls?.dispose();
    this.foldRig?.dispose();
    this.paperBaker?.dispose();
    this.baker?.dispose();
    this.detector?.dispose();
    this.editor = null;
    this.preview = null;
    this.visiblePreview = null;
    this.compositor = null;
    this.detector = null;
    this.controls = null;
    this.foldRig = null;
    this.paperBaker = null;
    this.baker = null;
    this.renderer?.dispose();
    this.paperScope?.project?.clear();
    if (this.root) {
      for (const c of [this.editorCanvas, this.bakeCanvas, this.previewCanvas, this.viewCanvas]) {
        if (c && c.parentNode === this.root) this.root.removeChild(c);
      }
    }
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.paperScope = null;
    this.editorCanvas = this.bakeCanvas = this.previewCanvas = this.viewCanvas = null;
    this.root = null;
    this.listeners.clear();
  }

  /** Wedge outline (unit space) for the current fold: apex + the two outer-edge corners. Shared by
   *  the cut compositor. Mirrors WedgeEditor.wedgeVertices. */
  private wedgeVerts(): Point[] {
    return [
      { x: 0, y: 0 },
      boundaryPointAtAngle(this.fold.wedgeStart, 0.5),
      boundaryPointAtAngle(this.fold.wedgeEnd, 0.5),
    ];
  }

  setMode(mode: EngineMode): void {
    this.mode = mode;
    const showEditor = mode === 'draw' || mode === 'preview';
    const in3d = mode === 'unfold3d';
    if (this.editorCanvas) this.editorCanvas.style.display = showEditor ? 'block' : 'none';
    if (this.previewCanvas) this.previewCanvas.style.display = showEditor ? 'block' : 'none';
    if (this.viewCanvas) this.viewCanvas.style.display = in3d ? 'block' : 'none';
    if (this.controls) this.controls.enabled = in3d;
    if (in3d) {
      this.render3d(); // size + paint the latest bake before the loop takes over
      this.startLoop(); // orbit damping + play animation run only while the 3D view is visible
    }
    this.emit('modechange', { mode });
  }

  setTool(tool: EngineTool): void {
    this.currentTool = tool;
    this.editor?.setTool(tool);
  }

  drawStroke(points: readonly Point[]): void {
    this.model.drawStroke(points);
  }

  cut(at?: Point): void {
    this.model.cut(at);
  }

  erase(points: readonly Point[]): void {
    this.model.erase(points);
  }

  addCutPath(points: readonly Point[]): void {
    this.model.commit(points);
  }

  clearPaths(): void {
    this.model.clear();
  }

  setStampSize(size: number): void {
    this.editor?.setStampSize(size);
  }

  setPencilWidth(px: number): void {
    this.editor?.setPencilWidth(px);
  }

  setEraserWidth(size: number): void {
    this.editor?.setEraseRadius(size);
  }

  setScissorsMargin(margin: number): void {
    this.detector?.setCutMargin(margin);
    this.model.refreshRegions(); // re-detect with the new fit; editor repaints the highlights
  }

  setViewRotation(deg: number): void {
    this.editor?.setViewRotation(deg);
  }

  loadTemplate(id: string): void {
    // M2.5: replay a JSON template's cuts through the editor (validated/snapped like drawn cuts).
    loadTemplateInto(this, id);
  }

  loadFoldConfig(id: string): void {
    const fold = foldConfigs[id as keyof typeof foldConfigs];
    if (!fold) return;
    this.fold = fold;
    this.model.setFold(fold);
    this.editor?.setFold(fold);
    // Rebuild the 3D rig for the new panel/hinge layout (panel count + hinge axes come from foldConfig).
    if (this.foldRig && this.scene && this.baker) {
      this.scene.remove(this.foldRig.group);
      this.foldRig.dispose();
      this.foldRig = new FoldRig(fold, this.baker.getMaterial());
      this.scene.add(this.foldRig.group);
      this.foldRig.setProgress(this.unfoldProgress);
    }
    // The crease star follows the wedge angle — refresh it and re-bake the colour/bump composite.
    if (this.paperBaker) {
      this.paperBaker.setCreases(generateCreases(fold));
      void this.paperBaker.bake(); // no props → keep current stock, recomposite the new crease star
    }
  }

  setUnfoldProgress(t: number): void {
    this.playStart = null; // a manual scrub cancels any running play animation
    this.applyUnfoldProgress(t);
  }

  playUnfold(): void {
    // Animate progress 0 → 1 from a folded start. The RAF loop reads `playStart`; ensure it's running
    // (it only runs in the 3D view) so calling play in 2D still arms the animation for when 3D opens.
    this.applyUnfoldProgress(0);
    this.playStart = performance.now();
    if (this.mode === 'unfold3d') this.startLoop();
  }

  setPaperStock(props: PaperStockProps): void {
    // Re-bake the paper-shaders colour map + crease composite for the new stock; the baker repaints
    // the 3D view via its onBaked callback when the (async) render completes.
    void this.paperBaker?.bake(props);
  }

  undo(): void {
    this.model.undo();
  }

  redo(): void {
    this.model.redo();
  }

  async exportPattern(_format: ExportFormat): Promise<Blob> {
    // M6 wires real export.
    return new Blob([], { type: 'application/octet-stream' });
  }

  on<E extends EngineEvent>(event: E, cb: (payload: EngineEventPayload[E]) => void): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as Listener<EngineEvent>);
    return () => {
      this.listeners.get(event)?.delete(cb as Listener<EngineEvent>);
    };
  }

  private emit<E extends EngineEvent>(event: E, payload: EngineEventPayload[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) (cb as Listener<E>)(payload);
  }
}

function makeCanvas(
  parent: HTMLElement,
  id: string,
  style: Partial<CSSStyleDeclaration>,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.id = id;
  Object.assign(c.style, style);
  parent.appendChild(c);
  return c;
}
