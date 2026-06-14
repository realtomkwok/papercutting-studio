/**
 * PaperMesh (M4) — per-panel geometry for the fold rig.
 *
 * One panel = one symmetry copy of the editable wedge (8 panels for the symmetrical triangle). Each
 * panel is a flat triangle built at its **unfolded** (flat, progress=1) position in unit-square space
 * (x,y ∈ [−0.5, 0.5]), z = 0. The fold rig nests these under hinge groups and rotates them about the
 * fold lines; at progress=1 every hinge is at zero rotation, so the panels tile the full square and
 * reconstruct the M3 flat plane exactly (dev-spec §6.1).
 *
 * UVs map each flat vertex straight to unit-square UV space — `uv = (x + 0.5, y + 0.5)` — identical to
 * the convention `AlphaMapBaker` uses for its full-square plane (unit-square space = UV space, gotcha
 * §10.7). This lets the single full-square alphaMap/colour map paint all 8 panels with zero per-panel
 * texture work, and guarantees progress=1 matches the 2D bake pixel-for-pixel (M4 acceptance §9).
 */

import * as THREE from 'three';
import { applyMat, boundaryPointAtAngle, type CopyTransform, type Point } from '../core/geometry';
import type { FoldConfig } from '../core/foldConfig';

/** The editable wedge as a triangle in unit space: apex at the origin + the two outer-edge corners
 *  where the wedge boundary rays meet the square (half-extent 0.5). Mirrors `EditorEngine.wedgeVerts`
 *  / `WedgeEditor.wedgeVertices`. */
export function wedgeCorners(fold: FoldConfig): readonly [Point, Point, Point] {
  return [
    { x: 0, y: 0 },
    boundaryPointAtAngle(fold.wedgeStart, 0.5),
    boundaryPointAtAngle(fold.wedgeEnd, 0.5),
  ];
}

/**
 * Build one panel's geometry in the **base-wedge local frame**: positions are always the base wedge
 * (apex + two outer corners at θ ∈ [wedgeStart, wedgeEnd]), regardless of which symmetry copy this is.
 * The fold rig's nested hinge rotations compose to `transform` at progress=1, carrying this base wedge
 * to its unfolded position — so the rotations *are* the transform (no baked matrix to double-apply),
 * and at progress=0 (all hinges at rest) every panel coincides on the base wedge (single silhouette).
 *
 * UVs, however, are taken from the panel's **unfolded** position `transform(corner)` so the one shared
 * full-square alphaMap/colour map still paints each panel's correct region of the unit square (and so
 * progress=1 matches the 2D bake — M4 acceptance §9).
 */
export function buildPanelGeometry(
  transform: CopyTransform,
  fold: FoldConfig,
): THREE.BufferGeometry {
  const base = wedgeCorners(fold);

  const positions = new Float32Array(9);
  const uvs = new Float32Array(6);
  for (let i = 0; i < 3; i++) {
    const p = base[i]!; // local position: base wedge, untransformed
    const uv = applyMat(transform.mat, p); // texture region: the panel's unfolded position
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = 0;
    uvs[i * 2 + 0] = uv.x + 0.5;
    uvs[i * 2 + 1] = uv.y + 0.5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  // Winding can be either way after a reflection (mirror copies flip orientation); the material is
  // DoubleSide so face culling never hides a panel. A flat z=0 normal is correct for the lit look.
  geo.computeVertexNormals();
  return geo;
}
