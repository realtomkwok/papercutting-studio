import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AlphaMapBaker } from './AlphaMapBaker';

/** A stand-in for the bake canvas — THREE.CanvasTexture only stores the reference (no DOM in the
 *  node test env), which is all this bridge needs until a real WebGL upload happens at runtime. */
function fakeCanvas(): HTMLCanvasElement {
  return { width: 2048, height: 2048 } as HTMLCanvasElement;
}

describe('AlphaMapBaker', () => {
  it('builds a cutout-textured square mesh from the bake canvas', () => {
    const baker = new AlphaMapBaker(fakeCanvas());
    const mat = baker.mesh.material as THREE.MeshStandardMaterial;

    expect(baker.mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(mat.alphaMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(mat.alphaMap!.image).toMatchObject({ width: 2048, height: 2048 });
    expect(mat.alphaTest).toBe(0.5); // hard cutout, not alpha blending (gotcha §10.3)
    expect(mat.side).toBe(THREE.DoubleSide);

    baker.dispose();
  });

  it('flags the texture for re-upload on update (gotcha §10.5)', () => {
    const baker = new AlphaMapBaker(fakeCanvas());
    const mat = baker.mesh.material as THREE.MeshStandardMaterial;
    // `needsUpdate` is a write-only setter that bumps `version`; assert the version advances.
    const before = mat.alphaMap!.version;

    baker.update();
    expect(mat.alphaMap!.version).toBeGreaterThan(before);

    baker.dispose();
  });
});
