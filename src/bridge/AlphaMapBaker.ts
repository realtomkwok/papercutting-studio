/**
 * AlphaMapBaker (M3) — the bridge from the Paper.js/2D world to Three.js.
 *
 * The editor bakes the unfolded pattern into a hidden 2D canvas using the alphaMap convention
 * (white = opaque paper, black = hole — see `UnfoldPreview` / dev-spec §5.1). This class wraps that
 * canvas in a `THREE.CanvasTexture` and hangs it as the `alphaMap` of a single flat full-square mesh,
 * so the 3D view shows the unfolded cut pattern as a textured plane. No folding yet — that's M4.
 *
 * Live update: whenever the editor re-renders the bake canvas, the engine calls {@link update}, which
 * flips `texture.needsUpdate` (gotcha §10.5 — without it the 3D view silently goes stale).
 *
 * Cutout, not blending: `alphaTest: 0.5` punches the holes as a hard cutout rather than via
 * transparent blending, so the stacked folded layers of M4 won't suffer alpha sorting artefacts
 * (dev-spec §5.1, gotcha §10.3).
 */

import * as THREE from 'three';

export interface AlphaMapOptions {
  /** Paper sheet colour shown where the alphaMap is opaque. Defaults to the classic cut-paper red. */
  readonly paperColor?: THREE.ColorRepresentation;
  /** Edge length of the square plane in world units (the unit square is 1). */
  readonly size?: number;
}

export class AlphaMapBaker {
  readonly mesh: THREE.Mesh;
  private readonly texture: THREE.CanvasTexture;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshStandardMaterial;

  constructor(bakeCanvas: HTMLCanvasElement, opts: AlphaMapOptions = {}) {
    const size = opts.size ?? 1;

    // The bake canvas IS the texture source. PlaneGeometry's default UVs map the full canvas across
    // the square — unit-square space = UV space (dev-spec §2.1, gotcha §10.7), so the unfolded
    // pattern lands 1:1 on the plane.
    this.texture = new THREE.CanvasTexture(bakeCanvas);
    this.texture.colorSpace = THREE.NoColorSpace; // alpha data, not colour — keep it linear

    this.geometry = new THREE.PlaneGeometry(size, size);
    this.material = new THREE.MeshStandardMaterial({
      color: opts.paperColor ?? 0xc8102e,
      alphaMap: this.texture,
      alphaTest: 0.5, // hard cutout (no blending) — see class doc
      side: THREE.DoubleSide,
      roughness: 0.95,
      metalness: 0,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }

  /** The shared cutout material (alphaMap + paper colour). The M4 fold rig reuses it across all
   *  panels so the single live texture upload repaints every folded layer at once. */
  getMaterial(): THREE.MeshStandardMaterial {
    return this.material;
  }

  /** Re-upload the bake canvas to the GPU. Call after every editor redraw of the bake canvas. */
  update(): void {
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
