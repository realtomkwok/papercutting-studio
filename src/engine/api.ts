/**
 * The engine ↔ UI contract (worked-example §3.2).
 *
 * Commands flow UI → engine; events flow engine → UI. No shared mutable objects.
 * The engine must run headless — every milestone acceptance check drives it through this API.
 * Only `src/app/wireUi.tsx` knows both sides; Figma Make–generated chrome never imports this file.
 */

import type { Point } from '../core/geometry';

export type EngineMode = 'draw' | 'preview' | 'unfold3d';

/** Serialisable snapshot of the full design — cuts, pending ink, fold config, paper stock.
 *  Used for JSON export (Save) and URL encoding (Share). Re-load via `loadDesignState`. */
export interface DesignState {
  readonly version: 1;
  /** `FoldConfig.id` — the fold template. */
  readonly foldId: string;
  /** Committed cut contours in unit-square coords (the composed removed-material regions). */
  readonly cuts: readonly (readonly Point[])[];
  /** Pending pencil ink strokes in unit-square coords. */
  readonly strokes: readonly (readonly Point[])[];
  readonly stock: PaperStockProps;
}

/** The four stamp shapes (unit patterns). */
export type StampTool = 'crescent' | 'circle' | 'sawtooth' | 'triangle';

/** The cutting tools (lasso model). `scissors` is a lasso: draw a freeform path and the enclosed area
 *  is cut out immediately. The stamp kinds drop a saved unit pattern and cut it out immediately too.
 *  `erase` removes a committed cut (tap a cut-out to un-cut it). */
export type EngineTool =
  | 'crescent'
  | 'circle'
  | 'sawtooth'
  | 'triangle'
  | 'contour'
  | 'scissors'
  | 'erase'
  // View-only "hand" tool: drag the canvas to rotate the paper (geometry unaffected). Not a drawing
  // tool — handled in the editor's pointer handlers, produces no strokes.
  | 'rotate';

export type ExportFormat = 'svg' | 'png';

/** Paper-shaders props that re-bake the colour map (M5). Mirrors the tunable subset of the
 *  `@paper-design/shaders` paper-texture params; the configurator panel exposes all of these and a
 *  full set round-trips as JSON. Every field optional so partial updates merge over the defaults
 *  (`DEFAULT_PAPER_STOCK`). The decorative `folds`/`foldCount` are deliberately omitted — our creases
 *  are geometric (gotcha §10.8). All numeric knobs are 0..1. */
export interface PaperStockProps {
  /** Base sheet colour (the paper). */
  readonly colorBack?: string;
  /** Fibre/noise overlay colour. */
  readonly colorFront?: string;
  readonly fiber?: number;
  readonly fiberSize?: number;
  readonly crumples?: number;
  readonly crumpleSize?: number;
  readonly drops?: number;
  /** Pixel-noise roughness of the shader pattern (not the Three.js material roughness). */
  readonly roughness?: number;
  readonly contrast?: number;
  /** Pattern seed (0..1; scaled to the shader's 0..1000 internally). */
  readonly seed?: number;
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
  /** Number of pencil ink strokes in the current sketch (absent from the preview until cut). */
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
  /** Pencil: add a freehand ink stroke (open polyline, unit-square coords) to the sketch. Shown as a
   *  pencil line in the editor, but NOT removed — it doesn't reach the preview until cut. */
  drawStroke(points: readonly Point[]): void;
  /** Scissors: cut out the enclosed areas the sketch seals off. With a point, cuts only the area
   *  under it; without one, cuts every detected area ("Cut all"). Each becomes a hole and the
   *  keep-largest rule applies across all committed batches. */
  cut(at?: Point): void;
  /** Eraser: rub the drawn polyline over the sketch, trimming the ink strokes it touches. It never
   *  touches the committed cuts. */
  erase(points: readonly Point[]): void;
  /** Directly commit a closed cut, skipping the pending step — for templates (M2.5) and headless
   *  tests injecting cuts without pointer events. Validated/snapped/clipped first (dev-spec §2.3–2.4). */
  addCutPath(points: readonly Point[]): void;
  /** Remove all committed cuts and the pending design. */
  clearPaths(): void;
  /** Stamp size (≈ pattern radius) in unit-square units, for the stamp tools' ghost + placement. */
  setStampSize(size: number): void;
  /** Scissors cut-fit margin (unit-square units): how tightly the cut hugs the lasso line. 0 hugs
   *  the centerline; negative insets the cut; positive grows it past the line. Re-detects regions. */
  setScissorsMargin(margin: number): void;
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
  /** Snapshot the current design (cuts + strokes + stock). For Save and Share. */
  getDesignState(): DesignState;
  /** Restore a previously saved design state: replays cuts + strokes + applies stock. */
  loadDesignState(state: DesignState): void;
  /** PNG data URL of the live 2D unfold preview canvas (for the print instructions sheet). */
  getPreviewImageUrl(): string | null;

  // events (engine → UI)
  on<E extends EngineEvent>(event: E, cb: (payload: EngineEventPayload[E]) => void): Unsubscribe;
}
