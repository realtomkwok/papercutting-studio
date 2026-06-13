/**
 * The engine ↔ UI contract (worked-example §3.2).
 *
 * Commands flow UI → engine; events flow engine → UI. No shared mutable objects.
 * The engine must run headless — every milestone acceptance check drives it through this API.
 * Only `src/app/wireUi.tsx` knows both sides; Figma Make–generated chrome never imports this file.
 */

export type EngineMode = 'draw' | 'preview' | 'unfold3d';

export type EngineTool = 'freehand' | 'crescent' | 'circle' | 'sawtooth' | 'erase';

export type ExportFormat = 'svg' | 'png';

/** Paper-shaders props that re-bake the colour map (full set lives in `@paper-design/shaders` —
 *  this is just the subset the UI panel exposes; expand as M5 lands). */
export interface PaperStockProps {
  readonly colorBack?: string;
  readonly fiber?: number;
  readonly fiberSize?: number;
  readonly crumples?: number;
  readonly drops?: number;
  readonly roughness?: number;
}

export type EngineEvent =
  | 'modechange'
  | 'pathschange'
  | 'validation'
  | 'unfoldprogress'
  | 'historychange'
  | 'ready';

export type EngineEventPayload = {
  modechange: { mode: EngineMode };
  pathschange: { count: number };
  validation: { ok: boolean; messages: readonly string[] };
  unfoldprogress: { t: number };
  historychange: { canUndo: boolean; canRedo: boolean };
  ready: Record<string, never>;
};

export type Unsubscribe = () => void;

export interface EditorEngine {
  // lifecycle
  mount(el: HTMLElement): void;
  dispose(): void;

  // commands (UI → engine)
  setMode(mode: EngineMode): void;
  setTool(tool: EngineTool): void;
  loadTemplate(id: string): void;
  loadFoldConfig(id: string): void;
  setUnfoldProgress(t: number): void;
  playUnfold(): void;
  setPaperStock(props: PaperStockProps): void;
  undo(): void;
  redo(): void;
  exportPattern(format: ExportFormat): Promise<Blob>;

  // events (engine → UI)
  on<E extends EngineEvent>(event: E, cb: (payload: EngineEventPayload[E]) => void): Unsubscribe;
}
