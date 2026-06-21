/**
 * PaperShaderBg — a ShaderMount that fills its container with a subtle paper texture.
 * Position: absolute, inset: 0. The parent must be position:relative (or absolute/fixed).
 */

import { useEffect, useMemo, useRef } from 'react';
import {
  ShaderMount,
  getShaderNoiseTexture,
  paperTextureFragmentShader,
  emptyPixel,
  getShaderColorFromString,
  ShaderFitOptions,
} from '@paper-design/shaders';

export interface PaperShaderBgProps {
  /** Base paper colour (background). Defaults to the app background warm-white. */
  colorBack?: string;
  /** Fibre overlay colour, slightly darker than base. */
  colorFront?: string;
  /** Fibre amount 0–1. Keep low for background surfaces so it reads as atmosphere. */
  fiber?: number;
  fiberSize?: number;
  crumples?: number;
  crumpleSize?: number;
  drops?: number;
  roughness?: number;
  contrast?: number;
  seed?: number;
  /**
   * Pattern scale in CSS pixels. The shader tiles at this world size.
   * Smaller = denser texture. Default 512 suits a full-screen background.
   */
  worldSize?: number;
}

export function PaperShaderBg({
  colorBack = '#f5f2ef',
  colorFront = '#e8e0d8',
  fiber = 0.12,
  fiberSize = 0.18,
  crumples = 0.06,
  crumpleSize = 0.55,
  drops = 0.06,
  roughness = 0.88,
  contrast = 0.18,
  seed = 0,
  worldSize = 512,
}: PaperShaderBgProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<ShaderMount | null>(null);

  const assets = useMemo(() => {
    const empty = new Image();
    empty.src = emptyPixel;
    return { noise: getShaderNoiseTexture(), empty };
  }, []);

  const uniforms = useMemo(
    () => ({
      u_colorBack: getShaderColorFromString(colorBack),
      u_colorFront: getShaderColorFromString(colorFront),
      u_contrast: contrast,
      u_roughness: roughness,
      u_fiber: fiber,
      u_fiberSize: fiberSize,
      u_crumples: crumples,
      u_crumpleSize: crumpleSize,
      u_folds: 0,
      u_foldCount: 1,
      u_fade: 0,
      u_drops: drops,
      u_seed: seed * 1000,
      u_imageAspectRatio: 1,
      u_fit: ShaderFitOptions.none,
      u_scale: 1,
      u_rotation: 0,
      u_originX: 0.5,
      u_originY: 0.5,
      u_offsetX: 0,
      u_offsetY: 0,
      u_worldWidth: worldSize,
      u_worldHeight: worldSize,
      u_noiseTexture: assets.noise,
      u_image: assets.empty,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      colorBack,
      colorFront,
      fiber,
      fiberSize,
      crumples,
      crumpleSize,
      drops,
      roughness,
      contrast,
      seed,
      worldSize,
    ],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mount = new ShaderMount(host, paperTextureFragmentShader, uniforms, undefined, 0, 0, 1);
    mountRef.current = mount;
    return () => {
      mount.dispose();
      mountRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountRef.current?.setUniforms(uniforms);
  }, [uniforms]);

  return <div ref={hostRef} className="absolute inset-0 pointer-events-none" />;
}
