/**
 * SidePanel — left-side panel with Paper (texture + colour) and About sections.
 * Design: Figma node 130:644 / 130:1015 (WFrsqSKE0foMLl1rxMWgqG).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
    crumpleSize: 0.60,
    drops: 0.10,
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
    crumpleSize: 0.10,
    drops: 0.01,
    roughness: 0.90,
    contrast: 0.12,
  },
];

const COLOR_PRESETS = Object.keys(COLOR_PRESET_HEX) as ColorPreset[];

const WEBSITE_TOMKWOK = 'https://tomkwok.xyz';

export function SidePanel({ colorPreset, texturePreset, onColorChange, onTextureChange }: SidePanelProps) {
  const [paperOpen, setPaperOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(true);

  return (
    <div style={s.panel}>
      {/* ── PAPER section ─────────────────────────────────────────────────── */}
      <SectionHeader title="Paper" open={paperOpen} onToggle={() => setPaperOpen((v) => !v)} />

      {paperOpen && (
        <div style={s.sectionBody}>
          {/* Texture row */}
          <p style={s.subsectionLabel}>Texture</p>
          <div style={s.textureRow}>
            {TEXTURES.map((t) => (
              <button
                key={t.id}
                type="button"
                style={s.textureBtn}
                onClick={() => onTextureChange(t.id)}
              >
                <LiveTextureSwatch profile={t} selected={texturePreset === t.id} />
                <span style={s.textureLabel}>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Colour row */}
          <div style={s.colourSection}>
            <p style={s.subsectionLabel}>Colour</p>
            <div style={s.colorGrid}>
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  title={preset}
                  onClick={() => onColorChange(preset)}
                  style={{
                    ...s.colorSwatch,
                    background: `var(--paper\\/${preset})`,
                    outline:
                      colorPreset === preset
                        ? '2px solid var(--color\\/foreground)'
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
        <div style={{ ...s.sectionBody, ...s.aboutBody }}>
          <p style={s.aboutText}>
            剪紙 Papercutting is a traditional folk art reimagined for the web. Fold, draw, and cut
            — then watch your design unfold into a beautiful symmetric pattern.
          </p>
          <p style={s.aboutText}>
            Share your creation with friends via a link, or print the folding guide to make your
            design tangible.
          </p>
          <p style={s.madeBy}>
            made by{' '}
            <a href={WEBSITE_TOMKWOK} style={s.link}>
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
      style={{
        width: '100%',
        height: 88,
        overflow: 'hidden',
        boxShadow: selected ? 'var(--shadow-elevation-medium)' : 'var(--shadow-elevation-low)',
        outline: selected ? '2px solid var(--color\\/foreground)' : 'none',
        outlineOffset: selected ? -2 : 0,
        transition: 'box-shadow 150ms, outline 150ms',
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
    <div style={s.header}>
      <span style={s.headerTitle}>{title}</span>
      <button
        type="button"
        style={s.toggleBtn}
        onClick={onToggle}
        aria-label={open ? 'Collapse' : 'Expand'}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, lineHeight: 1, display: 'block' }}
        >
          {open ? 'remove' : 'add'}
        </span>
      </button>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 240,
    background: 'var(--color\\/popover)',
    border: '1px solid var(--color\\/border)',
    boxShadow: 'var(--shadow-elevation-low)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    maxHeight: 'calc(100vh - 42px - 24px)',
    overflowY: 'auto',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    height: 40,
    borderBottom: '1px solid var(--color\\/border)',
    flexShrink: 0,
  },

  headerTitle: {
    fontFamily: 'var(--font\\/serif)',
    fontSize: 'var(--typography\\/label\\/size)',
    letterSpacing: 'var(--typography\\/label\\/letter-spacing)',
    textTransform: 'uppercase',
    color: 'var(--color\\/foreground)',
    userSelect: 'none',
  },

  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    background: 'var(--color\\/background)',
    border: '1px solid var(--color\\/border)',
    cursor: 'pointer',
    padding: 0,
    color: 'var(--color\\/foreground)',
    flexShrink: 0,
  },

  sectionBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '14px 16px',
  },

  subsectionLabel: {
    margin: 0,
    fontFamily: 'var(--font\\/serif)',
    fontSize: 'var(--typography\\/label\\/size)',
    letterSpacing: 'var(--typography\\/label\\/letter-spacing)',
    textTransform: 'uppercase',
    color: 'var(--color\\/muted-foreground)',
    whiteSpace: 'nowrap',
  },

  textureRow: {
    display: 'flex',
    gap: 8,
  },

  textureBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    flex: 1,
    minWidth: 0,
  },

  textureLabel: {
    fontFamily: 'var(--font\\/serif)',
    fontSize: 8,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color\\/foreground)',
    textAlign: 'center',
    lineHeight: 1.3,
    width: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  colourSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingBottom: 4,
  },

  colorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: 6,
  },

  colorSwatch: {
    width: '100%',
    aspectRatio: '1 / 1',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'outline 80ms',
  },

  aboutBody: {
    paddingBottom: 20,
  },

  aboutText: {
    margin: 0,
    fontFamily: 'var(--font\\/serif)',
    fontSize: 'var(--typography\\/body-small\\/size)',
    color: 'var(--color\\/muted-foreground)',
    lineHeight: 1.5,
  },

  madeBy: {
    margin: 0,
    fontFamily: 'var(--font\\/serif)',
    fontSize: 'var(--typography\\/eyebrow\\/size)',
    letterSpacing: 'var(--typography\\/eyebrow\\/letter-spacing)',
    textTransform: 'uppercase',
    color: 'var(--color\\/muted-foreground)',
  },

  link: {
    color: 'var(--color\\/muted-foreground)',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  },
};
