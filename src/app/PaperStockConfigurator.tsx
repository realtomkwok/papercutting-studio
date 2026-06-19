/**
 * PaperStockConfigurator (M5) — a live visual configurator for the paper-shaders stock.
 *
 * Presentational, app-layer: a modal with a *live* paper-shaders preview (its own `ShaderMount`, which
 * is cheap to update per-slider — no bake/snapshot needed here) plus the full tunable control set, and
 * JSON export/import so a refined stock can be saved and re-applied. "Apply" pushes the stock to the
 * engine via `onApply` (which triggers the one-off colour-map re-bake); the engine itself stays UI-free
 * (the contract lives in `engine/api.ts`). This component only knows the shader uniform mapping (from
 * the pure `bridge/paperStock` helper) and the core `@paper-design/shaders` mount — never the engine.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ShaderMount,
  getShaderNoiseTexture,
  paperTextureFragmentShader,
  emptyPixel,
} from '@paper-design/shaders';
import type { PaperStockProps } from '../engine/api';
import { DEFAULT_PAPER_STOCK, paperTextureUniforms, resolvePaperStock } from '../bridge/paperStock';

/** A fully-specified stock for the controls (no optionals — every field has a live value). */
type FullStock = Required<PaperStockProps>;

const DEFAULT_FULL: FullStock = {
  colorBack: DEFAULT_PAPER_STOCK.colorBack,
  colorFront: DEFAULT_PAPER_STOCK.colorFront,
  fiber: DEFAULT_PAPER_STOCK.fiber,
  fiberSize: DEFAULT_PAPER_STOCK.fiberSize,
  crumples: DEFAULT_PAPER_STOCK.crumples,
  crumpleSize: DEFAULT_PAPER_STOCK.crumpleSize,
  drops: DEFAULT_PAPER_STOCK.drops,
  roughness: DEFAULT_PAPER_STOCK.roughness,
  contrast: DEFAULT_PAPER_STOCK.contrast,
  seed: DEFAULT_PAPER_STOCK.seed,
};

/** Slider knobs, in panel order (all 0..1). */
const SLIDERS: { key: keyof FullStock; label: string; hint: string }[] = [
  { key: 'fiber', label: 'Fibre', hint: 'Curly fibre noise intensity' },
  { key: 'fiberSize', label: 'Fibre size', hint: 'Scale of the fibre noise' },
  { key: 'crumples', label: 'Crumples', hint: 'Cell-based crumple intensity' },
  { key: 'crumpleSize', label: 'Crumple size', hint: 'Scale of the crumple cells' },
  { key: 'drops', label: 'Speckle', hint: 'Visibility of the speckle/dots' },
  { key: 'roughness', label: 'Roughness', hint: 'Fine pixel noise' },
  { key: 'contrast', label: 'Contrast', hint: 'Sharp vs smooth colour transitions' },
  { key: 'seed', label: 'Seed', hint: 'Reseed the crumple/speckle pattern' },
];

const PRESET_COLORS = ['#c8102e', '#d4a017', '#1f3a93', '#2e7d32', '#f2ece0', '#3a3a3a'];

export interface PaperStockConfiguratorProps {
  readonly open: boolean;
  readonly initial: PaperStockProps;
  /** Commit the stock to the engine (triggers the colour-map re-bake). */
  readonly onApply: (props: PaperStockProps) => void;
  readonly onClose: () => void;
}

export function PaperStockConfigurator(props: PaperStockConfiguratorProps) {
  const { open, initial, onApply, onClose } = props;
  const [stock, setStock] = useState<FullStock>({ ...DEFAULT_FULL, ...initial });
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState('');

  // Re-seed the controls from the engine's current stock whenever the modal (re)opens.
  useEffect(() => {
    if (open) setStock({ ...DEFAULT_FULL, ...initial });
  }, [open, initial]);

  if (!open) return null;

  const set = (key: keyof FullStock, value: number | string) =>
    setStock((s) => ({ ...s, [key]: value }));

  const exportJson = JSON.stringify(stock, null, 2);

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setStatus('Copied configuration to clipboard');
    } catch {
      setStatus('Clipboard unavailable — copy from the box below');
    }
  };

  const downloadConfig = () => {
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paper-stock.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded paper-stock.json');
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText) as PaperStockProps;
      setStock({ ...DEFAULT_FULL, ...parsed });
      setStatus('Loaded configuration');
    } catch {
      setStatus('Invalid JSON');
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Paper texture</h2>
          <span style={{ color: '#999', fontSize: 12 }}>live preview · tune · export · apply</span>
          <button type="button" style={{ ...ghostBtn, marginLeft: 'auto' }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <LivePreview stock={stock} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: 240 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => set('colorBack', c)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    border: stock.colorBack === c ? '2px solid #333' : '1px solid rgba(0,0,0,0.25)',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <ColorField
                label="Paper"
                value={stock.colorBack}
                onChange={(v) => set('colorBack', v)}
              />
              <ColorField
                label="Fibre"
                value={stock.colorFront}
                onChange={(v) => set('colorFront', v)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 260 }}>
            {SLIDERS.map((s) => (
              <label key={s.key} style={row} title={s.hint}>
                <span style={{ width: 84, color: '#555' }}>{s.label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={stock[s.key] as number}
                  onChange={(e) => set(s.key, Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ width: 34, textAlign: 'right', color: '#888', fontVariantNumeric: 'tabular-nums' }}>
                  {(stock[s.key] as number).toFixed(2)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', color: '#666', fontSize: 12 }}>
            Export / import configuration (JSON)
          </summary>
          <textarea
            readOnly
            value={exportJson}
            style={{ width: '100%', height: 96, marginTop: 6, font: '12px ui-monospace, monospace' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button type="button" style={btn} onClick={copyConfig}>
              Copy
            </button>
            <button type="button" style={btn} onClick={downloadConfig}>
              Download
            </button>
          </div>
          <textarea
            placeholder="Paste a configuration here to load it…"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            style={{ width: '100%', height: 64, marginTop: 6, font: '12px ui-monospace, monospace' }}
          />
          <button type="button" style={btn} onClick={importJson}>
            Load pasted config
          </button>
        </details>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <span style={{ color: '#888', fontSize: 12, flex: 1 }}>{status}</span>
          <button type="button" style={btn} onClick={() => setStock(DEFAULT_FULL)}>
            Reset
          </button>
          <button
            type="button"
            style={primaryBtn}
            onClick={() => {
              onApply(stock);
              setStatus('Applied to the design');
            }}
          >
            Apply to design
          </button>
        </div>
      </div>
    </div>
  );
}

/** A live paper-shaders preview that updates its uniforms as the stock changes (no bake/snapshot). */
function LivePreview({ stock }: { stock: FullStock }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<ShaderMount | null>(null);
  const assets = useMemo(() => {
    const empty = new Image();
    empty.src = emptyPixel;
    return { noise: getShaderNoiseTexture(), empty };
  }, []);

  const uniforms = useMemo(
    () => ({
      ...paperTextureUniforms(resolvePaperStock(stock), 240),
      u_noiseTexture: assets.noise,
      u_image: assets.empty,
    }),
    [stock, assets],
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
    // Create once; subsequent uniform changes flow through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountRef.current?.setUniforms(uniforms);
  }, [uniforms]);

  return (
    <div
      ref={hostRef}
      style={{
        width: 240,
        height: 240,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
      }}
    />
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#555', fontSize: 12 }}>
      {label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};

const panel: CSSProperties = {
  background: '#fff',
  borderRadius: 10,
  padding: 18,
  width: 620,
  maxWidth: '92vw',
  maxHeight: '90vh',
  overflow: 'auto',
  boxShadow: 'var(--shadow-elevation-high)',
  font: '13px system-ui, sans-serif',
};

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

function baseBtn(): CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid #d4cdc1',
    background: '#fff',
    color: '#333',
    cursor: 'pointer',
    font: 'inherit',
  };
}
const btn = baseBtn();
const primaryBtn: CSSProperties = { ...baseBtn(), background: '#c8102e', color: '#fff', border: '1px solid #c8102e' };
const ghostBtn: CSSProperties = { ...baseBtn(), border: 'none', padding: '4px 8px' };
