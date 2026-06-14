/**
 * FoldRig (M4) — the nested-hinge rig that folds/unfolds the paper in 3D.
 *
 * **One rig strategy for every fold** (dev-spec §6.2). Real paper-cutting only uses straight creases,
 * so every fold unfolds as a sequence of nested door-hinges. We build one flat panel per symmetry copy
 * (`PaperMesh`), then nest them in groups whose rotation axes are the fold lines. A panel that is the
 * reflection of another across fold line L coincides with it after a 180° rotation about L (in 2D a
 * reflection across a line = a π rotation about that line in 3D), so rotating each hinge π → 0 unfolds.
 *
 * Hierarchy (symmetrical triangle, 8 panels, 3 hinges — fold order F1=0°, F2=90°, F3=45°):
 *
 *     group
 *     ├─ [static half: 4 panels]
 *     └─ hingeF1 (axis 0°)              // outermost fold — unfolds LAST
 *        ├─ [static quarter: 2 panels]
 *        └─ hingeF2 (axis 90°)          // unfolds 2nd
 *           ├─ [static: 1 panel]
 *           └─ hingeF3 (axis 45°)       // innermost fold — unfolds FIRST
 *              └─ [moving panel]
 *
 * The 8 copy transforms come from `generateCopies` in reverse-fold order; their array order is exactly
 * `[static-half, moving-half]` at every level (the reflect-and-double construction), so the tree is a
 * straight recursive halving. Panel count = symmetry copies; hinge count = number of folds — both from
 * `foldConfig` (dev-spec §6.2). This generalises to any fold-line axes (cone folds included); only the
 * angles and counts change.
 *
 * A single `progress ∈ [0,1]` scrubber drives every hinge: progress is partitioned into eased,
 * ~10%-overlapping segments, innermost fold first (reverse of folding). At progress=0 all hinges are
 * fully folded → the silhouette is a single wedge; at progress=1 all hinges are flat → the panels tile
 * the square and match the 2D bake (M4 acceptance §9).
 */

import * as THREE from 'three';
import { generateCopies, type CopyTransform } from '../core/geometry';
import type { FoldConfig } from '../core/foldConfig';
import { buildPanelGeometry, wedgeCorners } from './PaperMesh';

const DEG = Math.PI / 180;

/** Fraction of a hinge's time-window that overlaps its neighbour, so motion flows (dev-spec §6.2). */
const SEGMENT_OVERLAP = 0.1;
/** Per-layer z separation (unit-square units) at progress=0, lerped to 0 by progress=1 — keeps the
 *  stacked folded layers from z-fighting without leaving a visible gap when flat (gotcha §10.3 / §6.2a). */
const LAYER_OFFSET = 0.0008;

/** `easeInOutCubic` — symmetric ease for each hinge segment (dev-spec §6.2). */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Eased unfold amount of one hinge at global `progress`. Hinges open in `order` 0,1,…,n−1 (0 first);
 * each gets a window of length `1/(n − (n−1)·overlap)`, windows stepped by `(1−overlap)` of that
 * length so consecutive hinges overlap by `overlap`. Returns 0 before the window, 1 after, eased
 * in between. With n=1 the single hinge tracks progress directly.
 */
export function segmentUnfold(
  progress: number,
  order: number,
  n: number,
  overlap = SEGMENT_OVERLAP,
): number {
  if (n <= 1) return easeInOutCubic(clamp01(progress));
  const span = 1 / (n - (n - 1) * overlap);
  const start = order * span * (1 - overlap);
  const local = clamp01((progress - start) / span);
  return easeInOutCubic(local);
}

interface Hinge {
  readonly group: THREE.Group;
  /** Fold-line axis in the z=0 plane: (cosθ, sinθ, 0). */
  readonly axis: THREE.Vector3;
  /** Sign that lifts the moving flap to +z during the fold (so layers don't dive through the ground). */
  readonly sign: number;
  /** Unfold order: 0 = innermost fold (opens first), n−1 = outermost (opens last). */
  readonly order: number;
}

export class FoldRig {
  /** Add this to the scene. Holds the whole panel hierarchy. */
  readonly group = new THREE.Group();

  private readonly hinges: Hinge[] = [];
  private readonly leaves: THREE.Mesh[] = []; // panel meshes, for the per-layer z-fight offset
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly hingeCount: number;
  private progress = 1;

  constructor(
    private readonly fold: FoldConfig,
    private readonly material: THREE.Material,
  ) {
    // Reverse-fold-order angles drive the reflect-and-double copy construction (innermost fold last).
    const reverseFoldAngles = fold.foldLines.map((l) => l.angle).slice().reverse();
    const transforms = generateCopies(reverseFoldAngles);
    if (transforms.length !== fold.copies) {
      // Non-power-of-two (cone) folds need the direct construction — out of scope until their angles
      // land (foldConfig.ts). Guard so a mis-specified config fails loudly instead of rendering wrong.
      throw new Error(
        `FoldRig: ${fold.id} expects ${fold.copies} copies but generateCopies produced ${transforms.length}`,
      );
    }

    // Fold order, top → bottom of the tree: F1 outermost … Fk innermost.
    const foldAngles = fold.foldLines.map((l) => l.angle);
    this.hingeCount = foldAngles.length;
    this.group.add(this.build(transforms, foldAngles, 0));

    this.setProgress(1);
  }

  /**
   * Recursively build the hinge tree. `transforms` is one reflect-and-double level (its first half is
   * static, its second half is the reflection of the first across `foldAngles[0]`). Returns a group
   * holding the static subtree plus a hinge group wrapping the moving subtree.
   */
  private build(
    transforms: readonly CopyTransform[],
    foldAngles: readonly number[],
    depth: number,
  ): THREE.Object3D {
    if (foldAngles.length === 0) {
      // Leaf: one panel. Geometry is the base wedge (local frame); the ancestor hinge rotations carry
      // it to this copy's unfolded position at progress=1 (its UVs encode that position for texturing).
      const geo = buildPanelGeometry(transforms[0]!, this.fold);
      this.geometries.push(geo);
      const mesh = new THREE.Mesh(geo, this.material);
      this.leaves.push(mesh);
      return mesh;
    }

    const angle = foldAngles[0]!;
    const rest = foldAngles.slice(1);
    const half = transforms.length / 2;
    const staticSet = transforms.slice(0, half);
    const movingSet = transforms.slice(half);

    const node = new THREE.Group();
    node.add(this.build(staticSet, rest, depth + 1));

    const hingeGroup = new THREE.Group();
    hingeGroup.add(this.build(movingSet, rest, depth + 1));
    node.add(hingeGroup);

    this.hinges.push({
      group: hingeGroup,
      axis: new THREE.Vector3(Math.cos(angle * DEG), Math.sin(angle * DEG), 0),
      sign: liftSign(this.fold, angle),
      order: this.hingeCount - 1 - depth, // outermost (depth 0) opens last
    });

    return node;
  }

  /**
   * Drive every hinge from one scrubber value (clamped to [0,1]). Each hinge rotates 0 (folded flat
   * onto its static sibling — at progress=0 all panels coincide on the base wedge) → ±π (unfolded; the
   * nested π-rotations compose to each panel's copy transform, so the paper lands flat and matches the
   * 2D bake). Per-panel z micro-offsets separate the stacked folded layers and lerp to 0 when flat.
   */
  setProgress(t: number): void {
    this.progress = clamp01(t);
    for (const h of this.hinges) {
      const u = segmentUnfold(this.progress, h.order, this.hingeCount);
      h.group.quaternion.setFromAxisAngle(h.axis, h.sign * Math.PI * u);
    }
    const fade = 1 - this.progress; // full separation when folded, none when flat
    for (let i = 0; i < this.leaves.length; i++) {
      this.leaves[i]!.position.z = i * LAYER_OFFSET * fade;
    }
  }

  getProgress(): number {
    return this.progress;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.geometries.length = 0;
    this.hinges.length = 0;
    this.leaves.length = 0;
    this.group.clear();
  }
}

/** Choose each hinge's rotation sign so the moving flap lifts toward +z as it opens, rather than
 *  diving below the ground plane. Geometry is the base wedge for every panel, so the flap starts at
 *  the base wedge; its out-of-plane lift under a small rotation about the fold line is `−perp · sin θ`
 *  with `perp` the base wedge centroid's signed distance from the line — so `sign = −sign(perp)`.
 *  (Either sign reaches the same flat endpoint at ±π; this only picks the nicer mid-fold path.) */
function liftSign(fold: FoldConfig, angleDeg: number): number {
  const corners = wedgeCorners(fold);
  const cx = (corners[0].x + corners[1].x + corners[2].x) / 3;
  const cy = (corners[0].y + corners[1].y + corners[2].y) / 3;
  const perp = cx * Math.sin(angleDeg * DEG) - cy * Math.cos(angleDeg * DEG);
  return perp > 0 ? -1 : 1;
}
