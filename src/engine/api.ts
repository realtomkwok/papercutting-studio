/**
 * The engine ↔ UI contract (worked-example §3.2).
 *
 * Commands flow UI → engine; events flow engine → UI. No shared mutable objects.
 * The engine must run headless — every milestone acceptance check drives it through this API.
 * Only `src/app/wireUi.tsx` knows both sides; Figma Make–generated chrome never imports this file.
 */

import type { Point } from '../core/geometry';

export type EngineMode = 'draw' | 'preview' | 'unfold3d';

/** The drawing/cutting tools. `freehand` is the pencil (adds to the pending design); the stamp kinds
 *  drop a saved unit pattern; `contour` traces along the open edge; `scissors` cuts the pending design
 *  into an actual cut; `erase` subtracts from the pending design (never the committed cuts). */
export type EngineTool =
  | 'freehand'
  | 'crescent'
  | 'circle'
  | 'sawtooth'
  | 'triangle'
  | 'contour'
  | 'scissors'
  | 'erase';

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
  | 'outlineschange'
  | 'validation'
  | 'unfoldprogress'
  | 'historychange'
  | 'ready';

export type EngineEventPayload = {
  modechange: { mode: EngineMode };
  /** Number of committed cut batches (the removed material that reaches the preview). */
  pathschange: { count: number };
  /** Number of ops in the pending design (pencil adds + eraser subtracts; absent from the preview). */
  outlineschange: { count: number };
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
  /** Pencil: add a closed outline to the pending design (unit-square coords): drawn, validated/snapped,
   *  and shown dotted in the editor, but NOT yet removed — it doesn't reach the preview until cut. */
  drawOutline(points: readonly Point[]): void;
  /** Scissors: cut the pending design out, committing it as one cut batch. With a point, only cuts
   *  when it lies inside the design; without one, always commits a non-empty design. The cut becomes
   *  a hole and the keep-largest rule applies across all committed batches. */
  cut(at?: Point): void;
  /** Eraser: subtract a drawn region from the pending design (carves the dotted shape). It never
   *  touches the committed cuts. */
  erase(points: readonly Point[]): void;
  /** Directly commit a closed cut, skipping the pending step — for templates (M2.5) and headless
   *  tests injecting cuts without pointer events. Validated/snapped/clipped first (dev-spec §2.3–2.4). */
  addCutPath(points: readonly Point[]): void;
  /** Remove all committed cuts and the pending design. */
  clearPaths(): void;
  /** Stamp size (≈ pattern radius) in unit-square units, for the stamp tools' ghost + placement. */
  setStampSize(size: number): void;
  /** Rotate the editor view (the paper) by `deg` — a display convenience; geometry is unchanged. */
  setViewRotation(deg: number): void;
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
