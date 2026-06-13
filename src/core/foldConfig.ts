/**
 * Fold configuration — single source of truth for both 2D copy generation and the 3D hinge rig.
 *
 * Only `symmetrical-triangle` is pinned at M0 (dev-spec §2.2b, §8). The other three folds
 * (`asymmetrical-triangle`, `ice-cream-cone`, `bouquet-wrap`) need their crease angles measured
 * from the reference diagrams before their configs are trustworthy — they're not declared here.
 */

export type FoldId = 'symmetrical-triangle';

/** A fold line is a line through the origin at `angle` (degrees, CCW from +x). `moves` records
 *  which side of the line is the moving flap during the physical fold — informational only for
 *  the unfold math, but the 3D hinge rig needs it. */
export interface FoldLine {
  readonly angle: number;
  readonly moves: 'above' | 'below' | 'left' | 'right' | 'upper' | 'lower';
}

export interface FoldConfig {
  readonly id: FoldId;
  readonly copies: number;
  readonly wedgeAngle: number;
  /** Ordered fold-line list (first fold first). Drives both 2D copy generation and 3D rig. */
  readonly foldLines: readonly FoldLine[];
  /** Wedge boundary in polar coords: editable region is θ ∈ [wedgeStart, wedgeEnd]. */
  readonly wedgeStart: number;
  readonly wedgeEnd: number;
}

export const symmetricalTriangle: FoldConfig = {
  id: 'symmetrical-triangle',
  copies: 8,
  wedgeAngle: 45,
  foldLines: [
    { angle: 0, moves: 'below' }, // 1st fold: half (horizontal axis)
    { angle: 90, moves: 'left' }, // 2nd fold: quarter (vertical axis)
    { angle: 45, moves: 'upper' }, // 3rd fold: diagonal
  ],
  wedgeStart: 0,
  wedgeEnd: 45,
};

export const foldConfigs: Record<FoldId, FoldConfig> = {
  'symmetrical-triangle': symmetricalTriangle,
};
