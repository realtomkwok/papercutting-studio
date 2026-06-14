/**
 * Empty `EditorEngine` for M0 — owns three canvases (Paper.js editor, hidden bake, Three.js view)
 * and a typed event bus. Subsequent milestones flesh out each subsystem; the API surface stays
 * stable (worked-example §3.2 contract).
 */

import paper from 'paper';
import * as THREE from 'three';
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
import { CutCompositor } from '../editor/CutCompositor';

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
  private fold: FoldConfig = symmetricalTriangle;
  private currentTool: EngineTool = 'freehand';
  private unsubPaths: Unsubscribe | null = null;

  constructor() {
    this.model = new EditorModel({
      emit: <E extends EngineEvent>(event: E, payload: EngineEventPayload[E]) =>
        this.emit(event, payload),
      onUnfold: (result) => {
        this.preview?.render(result); // hidden bake (white/black → alphaMap at M3)
        this.visiblePreview?.render(result); // visible side preview (red sheet, open holes)
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
    this.renderer.render(this.scene, this.camera);

    // M2 editor views: Paper.js wedge editor on the visible canvas, 2D-canvas preview on the bake
    // canvas. Re-render committed cuts whenever the model's path set changes (commit/undo/redo).
    // Boolean compositor (Paper.js): merges overlapping cuts and drops disconnected paper. Inject it
    // into the headless model so both the editor and the previews work off the merged region.
    this.compositor = new CutCompositor(this.paperScope!, () => this.wedgeVerts());
    this.model.setCompositor({
      design: (ops) => this.compositor!.design(ops),
      committed: (batches) => this.compositor!.committed(batches),
    });

    this.editor = new WedgeEditor(this.paperScope!, this.model, this.fold);
    this.editor.setTool(this.currentTool);
    this.preview = new UnfoldPreview(this.bakeCanvas!);
    this.visiblePreview = new UnfoldPreview(this.previewCanvas!, PREVIEW_COLORS);
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

  dispose(): void {
    this.unsubPaths?.();
    this.unsubPaths = null;
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.model.dispose();
    this.editor?.dispose();
    this.preview?.dispose();
    this.visiblePreview?.dispose();
    this.editor = null;
    this.preview = null;
    this.visiblePreview = null;
    this.compositor = null;
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
    const showEditor = mode === 'draw' || mode === 'preview';
    if (this.editorCanvas) this.editorCanvas.style.display = showEditor ? 'block' : 'none';
    if (this.previewCanvas) this.previewCanvas.style.display = showEditor ? 'block' : 'none';
    if (this.viewCanvas) this.viewCanvas.style.display = mode === 'unfold3d' ? 'block' : 'none';
    this.emit('modechange', { mode });
  }

  setTool(tool: EngineTool): void {
    this.currentTool = tool;
    this.editor?.setTool(tool);
  }

  drawOutline(points: readonly Point[]): void {
    this.model.drawOutline(points);
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

  setViewRotation(deg: number): void {
    this.editor?.setViewRotation(deg);
  }

  loadTemplate(_id: string): void {
    // TODO: M2.5 wires template loading (importSVG → addCutPath per sub-path).
  }

  loadFoldConfig(id: string): void {
    const fold = foldConfigs[id as keyof typeof foldConfigs];
    if (!fold) return;
    this.fold = fold;
    this.model.setFold(fold);
    this.editor?.setFold(fold);
  }

  setUnfoldProgress(t: number): void {
    this.emit('unfoldprogress', { t });
  }

  playUnfold(): void {
    // TODO: M4 wires the fold rig.
  }

  setPaperStock(_props: PaperStockProps): void {
    // TODO: M5 wires the paper-shaders bake.
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
