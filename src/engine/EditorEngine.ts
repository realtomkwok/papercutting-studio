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

type Listener<E extends EngineEvent> = (payload: EngineEventPayload[E]) => void;

export class PaperCuttingEngine implements EditorEngine {
  private root: HTMLElement | null = null;
  private editorCanvas: HTMLCanvasElement | null = null;
  private bakeCanvas: HTMLCanvasElement | null = null;
  private viewCanvas: HTMLCanvasElement | null = null;

  private paperScope: paper.PaperScope | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  private listeners = new Map<EngineEvent, Set<Listener<EngineEvent>>>();

  mount(el: HTMLElement): void {
    if (this.root) throw new Error('EditorEngine.mount called twice');
    this.root = el;

    this.editorCanvas = makeCanvas(el, 'pc-editor-canvas', {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
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

    this.viewCanvas = makeCanvas(el, 'pc-view-canvas', {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'none',
    });

    this.paperScope = new paper.PaperScope();
    this.paperScope.setup(this.editorCanvas);

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

    this.emit('ready', {});
  }

  dispose(): void {
    this.renderer?.dispose();
    this.paperScope?.project?.clear();
    if (this.root) {
      for (const c of [this.editorCanvas, this.bakeCanvas, this.viewCanvas]) {
        if (c && c.parentNode === this.root) this.root.removeChild(c);
      }
    }
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.paperScope = null;
    this.editorCanvas = this.bakeCanvas = this.viewCanvas = null;
    this.root = null;
    this.listeners.clear();
  }

  setMode(mode: EngineMode): void {
    const showEditor = mode === 'draw' || mode === 'preview';
    if (this.editorCanvas) this.editorCanvas.style.display = showEditor ? 'block' : 'none';
    if (this.viewCanvas) this.viewCanvas.style.display = mode === 'unfold3d' ? 'block' : 'none';
    this.emit('modechange', { mode });
  }

  setTool(_tool: EngineTool): void {
    // TODO: M2 wires real tools.
  }

  loadTemplate(_id: string): void {
    // TODO: M2.5 wires template loading.
  }

  loadFoldConfig(_id: string): void {
    // TODO: M1 wires foldConfig into the unfold engine.
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
    this.emit('historychange', { canUndo: false, canRedo: false });
  }

  redo(): void {
    this.emit('historychange', { canUndo: false, canRedo: false });
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
