/**
 * Template format (M2.5) — a starting design authored as plain cut paths in the editable wedge.
 *
 * Stored as JSON so a template is a self-contained, version-controllable data file that the loader
 * and the unit tests can both consume without any Paper.js/Three.js dependency. Each `cuts` entry is
 * a closed polygon in unit-square wedge coordinates (x,y ∈ [−0.5, 0.5], the shared frame of
 * dev-spec §2.1); the loader replays them through `EditorEngine.addCutPath`, so the same
 * validation/clip/snap pipeline (`core/validate.ts`) that guards hand-drawn cuts also guards
 * template cuts. Templates are therefore editable starting points, not static images (§8 criterion 4).
 *
 * The richer SVG-traced templates of dev-spec §8 (`lotus-cross`, …) can adopt the same schema once
 * their geometry is pinned; `test-circles.json` is the minimal fixture used to exercise M1→M3.
 */

import type { FoldId } from '../core/foldConfig';
import type { Point } from '../core/geometry';

export interface TemplateJSON {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Which `foldConfig` this design was authored against. */
  readonly foldId: FoldId;
  /** Closed cut polygons in unit-square wedge coordinates; each becomes one committed cut batch. */
  readonly cuts: readonly (readonly Point[])[];
}
