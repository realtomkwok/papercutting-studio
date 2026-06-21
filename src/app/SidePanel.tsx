/**
 * SidePanel — left-side panel with Paper (texture + colour) and About sections.
 * Design: Figma node 130:644 / 130:1015 (WFrsqSKE0foMLl1rxMWgqG).
 *
 * Static structure is Tailwind utilities; the per-swatch live values (selected outline/shadow,
 * the runtime `--color-<preset>` swatch fill) stay inline.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShaderMount,
  getShaderNoiseTexture,
  paperTextureFragmentShader,
  emptyPixel,
} from '@paper-design/shaders';
import { paperTextureUniforms } from '../bridge/paperStock';
import type { ColorPreset, TexturePreset } from './types';
import { COLOR_PRESET_HEX } from './types';

export interface SidePanelProps {
  colorPreset: ColorPreset;
  texturePreset: TexturePreset;
  onColorChange: (preset: ColorPreset) => void;
  onTextureChange: (preset: TexturePreset) => void;
}

// ── Texture profiles ──────────────────────────────────────────────────────────
// Each profile encodes the visual character described in the paper spec.
// All preview at the card colour (#eae2dc) so texture differences read clearly.

const CARD_COLOR = '#eae2dc';
const CARD_FIBER = '#c8bfb6'; // slightly darker for fibre visibility

interface TextureProfile {
  id: TexturePreset;
  label: string;
  fiber: number;
  fiberSize: number;
  crumples: number;
  crumpleSize: number;
  drops: number;
  roughness: number;
  contrast: number;
}

export type { TextureProfile };

export const TEXTURES: TextureProfile[] = [
  {
    id: 'xuan',
    label: 'Xuan 宣紙',
    // Ultra-matte, velvety, subtle organic grain. No strong individual fibres —
    // the surface reads as a soft homogeneous matte with micro-noise.
    fiber: 0.22,
    fiberSize: 0.12,
    crumples: 0.08,
    crumpleSize: 0.6,
    drops: 0.1,
    roughness: 0.92,
    contrast: 0.22,
  },
  {
    id: 'washi',
    label: 'Washi 和紙',
    // Long swirling translucent fibre strands dominate the surface. High contrast
    // makes the web-like fibre matrix visible and high-key against the base.
    fiber: 0.88,
    fiberSize: 0.58,
    crumples: 0.14,
    crumpleSize: 0.38,
    drops: 0.04,
    roughness: 0.65,
    contrast: 0.78,
  },
  {
    id: 'copypaper',
    label: 'Copy Paper',
    // Perfectly uniform, chalky, machine-pressed. Near-zero fibres, near-zero
    // crumples, very high roughness to simulate the OBA-bleached flat surface.
    fiber: 0.03,
    fiberSize: 0.06,
    crumples: 0.02,
    crumpleSize: 0.1,
    drops: 0.01,
    roughness: 0.9,
    contrast: 0.12,
  },
];

const COLOR_PRESETS = Object.keys(COLOR_PRESET_HEX) as ColorPreset[];

const WEBSITE_TOMKWOK = 'https://tomkwok.xyz';

const SUBSECTION_LABEL =
  'm-0 font-serif text-label tracking-label uppercase text-muted-foreground whitespace-nowrap';
const SECTION_BODY = 'flex flex-col gap-3 px-4 py-3.5';
const ABOUT_TEXT = 'm-0 font-serif text-body-small text-muted-foreground leading-normal';

export function SidePanel({
  colorPreset,
  texturePreset,
  onColorChange,
  onTextureChange,
}: SidePanelProps) {
  const [paperOpen, setPaperOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(true);

  return (
    <div className="absolute top-3 left-3 w-60 bg-popover border border-border shadow-elevation-low flex flex-col overflow-x-hidden overflow-y-auto max-h-[calc(100vh-42px-24px)]">
      {/* ── PAPER section ─────────────────────────────────────────────────── */}
      <SectionHeader title="Paper" open={paperOpen} onToggle={() => setPaperOpen((v) => !v)} />

      {paperOpen && (
        <div className={SECTION_BODY}>
          {/* Texture row */}
          <p className={SUBSECTION_LABEL}>Texture</p>
          <div className="flex gap-2">
            {TEXTURES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="flex flex-col items-center gap-2 bg-transparent border-none p-0 cursor-pointer flex-1 min-w-0"
                onClick={() => onTextureChange(t.id)}
              >
                <LiveTextureSwatch profile={t} selected={texturePreset === t.id} />
                <span className="font-serif text-footnote tracking-[0.04em] uppercase text-foreground text-center leading-[1.3] w-full whitespace-nowrap overflow-hidden text-ellipsis">
                  {t.label}
                </span>
              </button>
            ))}
          </div>

          {/* Colour row */}
          <div className="flex flex-col gap-2.5 pb-1">
            <p className={SUBSECTION_LABEL}>Colour</p>
            <div className="grid grid-cols-8 gap-1.5">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  title={preset}
                  onClick={() => onColorChange(preset)}
                  className="w-full aspect-square border-none cursor-pointer p-0 transition-[outline] duration-[80ms]"
                  style={{
                    background: `var(--color-${preset})`,
                    outline:
                      colorPreset === preset
                        ? '2px solid var(--color-foreground)'
                        : '1px solid rgba(46,41,38,0.2)',
                    outlineOffset: colorPreset === preset ? 2 : 0,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ABOUT section ─────────────────────────────────────────────────── */}
      <SectionHeader title="About" open={aboutOpen} onToggle={() => setAboutOpen((v) => !v)} />

      {aboutOpen && (
        <div className={`${SECTION_BODY} pb-5`}>
          <p className={ABOUT_TEXT}>
            剪紙 Papercutting is a traditional folk art reimagined for the web. Fold, draw, and cut
            — then watch your design unfold into a beautiful symmetric pattern.
          </p>
          <p className={ABOUT_TEXT}>
            Share your creation with friends via a link, or print the folding guide to make your
            design tangible.
          </p>
          <p className="m-0 font-serif text-eyebrow tracking-eyebrow uppercase text-muted-foreground">
            made by{' '}
            <a
              href={WEBSITE_TOMKWOK}
              className="text-muted-foreground underline underline-offset-2"
            >
              tom kwok
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

// ── LiveTextureSwatch ─────────────────────────────────────────────────────────

function LiveTextureSwatch({ profile, selected }: { profile: TextureProfile; selected: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<ShaderMount | null>(null);

  const assets = useMemo(() => {
    const empty = new Image();
    empty.src = emptyPixel;
    return { noise: getShaderNoiseTexture(), empty };
  }, []);

  const SWATCH_SIZE = 64;

  const uniforms = useMemo(
    () => ({
      ...paperTextureUniforms(
        {
          colorBack: CARD_COLOR,
          colorFront: CARD_FIBER,
          fiber: profile.fiber,
          fiberSize: profile.fiberSize,
          crumples: profile.crumples,
          crumpleSize: profile.crumpleSize,
          drops: profile.drops,
          roughness: profile.roughness,
          contrast: profile.contrast,
          seed: 0,
        },
        SWATCH_SIZE,
      ),
      u_noiseTexture: assets.noise,
      u_image: assets.empty,
    }),
    [profile, assets],
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
    // uniforms changes handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountRef.current?.setUniforms(uniforms);
  }, [uniforms]);

  return (
    <div
      ref={hostRef}
      className="w-full h-[88px] overflow-hidden transition-[box-shadow,outline] duration-150"
      style={{
        boxShadow: selected ? 'var(--shadow-elevation-medium)' : 'var(--shadow-elevation-low)',
        outline: selected ? '2px solid var(--color-foreground)' : 'none',
        outlineOffset: selected ? -2 : 0,
      }}
    />
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 h-10 border-b border-border flex-shrink-0">
      <span className="font-serif text-label tracking-label uppercase text-foreground select-none">
        {title}
      </span>
      <button
        type="button"
        className="flex items-center justify-center w-6 h-6 bg-background border border-border cursor-pointer p-0 text-foreground flex-shrink-0"
        onClick={onToggle}
        aria-label={open ? 'Collapse' : 'Expand'}
      >
        <span className="material-symbols-outlined text-[16px] leading-none block">
          {open ? 'remove' : 'add'}
        </span>
      </button>
    </div>
  );
}
