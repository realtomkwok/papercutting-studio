/**
 * Template registry + loader (M2.5).
 *
 * Templates are JSON data files (see `./types.ts`); this module imports them, exposes a typed
 * registry, and provides `loadTemplateInto` — the single helper the engine calls to replay a
 * template's cuts through the editor. Keeping the replay here (not in `EditorEngine`) means the
 * loader is unit-testable against a headless engine API.
 */

import type { EditorEngine } from '../engine/api';
import testCircles from './test-circles.json';
import type { TemplateJSON } from './types';

export type { TemplateJSON } from './types';

export const templates: Record<string, TemplateJSON> = {
  [testCircles.id]: testCircles as TemplateJSON,
};

export function getTemplate(id: string): TemplateJSON | undefined {
  return templates[id];
}

/**
 * Replay a template into an engine: select its fold, clear the wedge, then commit each cut as its
 * own batch (so each circle is an independent hole, exactly as `addCutPath` treats a drawn cut).
 * Returns false if the id is unknown. Each cut still passes through validate/clip/snap, so an
 * edge-touching template cut merges across its seam just like a hand-drawn one.
 */
export function loadTemplateInto(engine: EditorEngine, id: string): boolean {
  const tpl = getTemplate(id);
  if (!tpl) return false;
  engine.loadFoldConfig(tpl.foldId);
  engine.clearPaths();
  for (const cut of tpl.cuts) engine.addCutPath(cut);
  return true;
}
