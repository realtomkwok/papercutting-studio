import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FoldRig, easeInOutCubic, segmentUnfold } from './FoldRig';
import { symmetricalTriangle } from '../core/foldConfig';
import { applyMat, generateCopies, type Point } from '../core/geometry';
import { wedgeCorners } from './PaperMesh';

/** World-space vertices of every panel mesh in the rig, at the rig's current progress. */
function panelWorldVerts(rig: FoldRig): Point[][] {
  rig.group.updateMatrixWorld(true);
  const out: Point[][] = [];
  rig.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    const verts: Point[] = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      verts.push({ x: v.x, y: v.y });
    }
    out.push(verts);
  });
  return out;
}

const near = (a: Point, b: Point, eps = 1e-5) => Math.hypot(a.x - b.x, a.y - b.y) < eps;
/** Is `v` one of the base-wedge corners? (x,y only; the per-leaf z offset is checked separately.) */
const isBaseCorner = (v: Point, corners: readonly Point[]) => corners.some((c) => near(v, c, 1e-6));

describe('FoldRig — symmetrical triangle', () => {
  const mat = new THREE.MeshBasicMaterial();

  it('builds one panel per symmetry copy', () => {
    const rig = new FoldRig(symmetricalTriangle, mat);
    expect(panelWorldVerts(rig).length).toBe(symmetricalTriangle.copies); // 8
    rig.dispose();
  });

  it('at progress=1 the panels lie flat and reconstruct the 2D bake tiling', () => {
    const rig = new FoldRig(symmetricalTriangle, mat);
    rig.setProgress(1);
    const panels = panelWorldVerts(rig);

    // Every panel sits exactly at its flat copy-transform position (z ignored — all flat).
    const corners = wedgeCorners(symmetricalTriangle);
    const expectedSets = generateCopies(
      symmetricalTriangle.foldLines.map((l) => l.angle).slice().reverse(),
    ).map((t) => corners.map((c) => applyMat(t.mat, c)));

    for (const panel of panels) {
      const match = expectedSets.some((exp) =>
        panel.every((v) => exp.some((e) => near(v, e))),
      );
      expect(match).toBe(true);
    }
    // Panels cover the full square: some vertex reaches each outer corner (±0.5, ±0.5).
    const allVerts = panels.flat();
    for (const corner of [
      { x: 0.5, y: 0.5 },
      { x: -0.5, y: 0.5 },
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
    ]) {
      expect(allVerts.some((v) => near(v, corner, 1e-5))).toBe(true);
    }
    rig.dispose();
  });

  it('at progress=0 every panel folds onto the single base wedge (single-wedge silhouette)', () => {
    const rig = new FoldRig(symmetricalTriangle, mat);
    rig.setProgress(0);
    const corners = wedgeCorners(symmetricalTriangle);

    // Folded flat: each panel coincides with the base wedge, so its world vertices are exactly the
    // base-wedge corners {(0,0), (0.5,0), (0.5,0.5)} in some order — and stay in the z=0 plane.
    for (const panel of panelWorldVerts(rig)) {
      for (const v of panel) expect(isBaseCorner(v, corners)).toBe(true);
    }
    rig.dispose();
  });

  it('stays in the z=0 plane at both endpoints and lifts out of it mid-fold', () => {
    const rig = new FoldRig(symmetricalTriangle, mat);
    const maxAbsZ = () => {
      rig.group.updateMatrixWorld(true);
      let m = 0;
      rig.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const pos = mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          const z = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).z;
          m = Math.max(m, Math.abs(z));
        }
      });
      return m;
    };

    rig.setProgress(1);
    expect(maxAbsZ()).toBeLessThan(1e-6); // fully unfolded: dead flat, offsets lerped to 0
    rig.setProgress(0);
    expect(maxAbsZ()).toBeLessThan(0.01); // folded flat stack, only the tiny anti-z-fight offsets
    rig.setProgress(0.4);
    expect(maxAbsZ()).toBeGreaterThan(0.01); // panels are lifted out of plane while folding
    rig.dispose();
  });

  it('clamps progress to [0,1]', () => {
    const rig = new FoldRig(symmetricalTriangle, mat);
    rig.setProgress(5);
    expect(rig.getProgress()).toBe(1);
    rig.setProgress(-2);
    expect(rig.getProgress()).toBe(0);
    rig.dispose();
  });
});

describe('segment easing', () => {
  it('easeInOutCubic pins the endpoints', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
  });

  it('every hinge is fully folded at progress=0 and fully open at progress=1', () => {
    const n = 3;
    for (let order = 0; order < n; order++) {
      expect(segmentUnfold(0, order, n)).toBe(0);
      expect(segmentUnfold(1, order, n)).toBe(1);
    }
  });

  it('opens innermost (order 0) before outermost (order n−1)', () => {
    // Partway through, the first-to-open hinge leads the last-to-open one.
    expect(segmentUnfold(0.3, 0, 3)).toBeGreaterThan(segmentUnfold(0.3, 2, 3));
  });
});
