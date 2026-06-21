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
import {
  ShaderMount,
  getShaderNoiseTexture,
  paperTextureFragmentShader,
  emptyPixel,
} from '@paper-design/shaders';
import type { PaperStockProps } from '../engine/api';
import { DEFAULT_PAPER_STOCK, paperTextureUniforms, resolvePaperStock } from '../bridge/paperStock';
import { Modal } from './Modal';

// ── shared chrome class strings (Tailwind) ────────────────────────────────────
const BTN =
  'font-serif text-body-small px-3 py-1.5 border border-border bg-background text-foreground cursor-pointer';
const PRIMARY_BTN =
  'font-serif text-body-small px-3 py-1.5 border border-primary bg-primary text-primary-foreground cursor-pointer';
const GHOST_BTN =
  'font-serif text-[16px] px-2 py-1 border-none bg-transparent text-foreground cursor-pointer';

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
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="paper-stock-title"
      overlayClassName="bg-black/35"
      panelClassName="bg-popover border border-border p-[18px] w-[620px] max-w-[92vw] max-h-[90vh] overflow-auto shadow-elevation-high font-serif text-body-small text-foreground"
    >
      <div className="flex items-baseline gap-2">
        <h2 id="paper-stock-title" className="m-0 text-[16px] font-serif">
          Paper texture
        </h2>
        <span className="text-muted-foreground text-caption">
          live preview · tune · export · apply
        </span>
        <button type="button" aria-label="Close" className={`${GHOST_BTN} ml-auto`} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-[18px] mt-3">
        <div className="flex flex-col gap-2.5">
          <LivePreview stock={stock} />
          <div className="flex gap-1.5 flex-wrap w-60">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => set('colorBack', c)}
                className="w-[22px] h-[22px] rounded-full cursor-pointer"
                style={{
                  background: c,
                  border: stock.colorBack === c ? '2px solid #333' : '1px solid rgba(0,0,0,0.25)',
                }}
              />
            ))}
          </div>
          <div className="flex gap-3">
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

        <div className="flex flex-col gap-2 flex-1 min-w-[260px]">
          {SLIDERS.map((s) => (
            <label key={s.key} className="flex items-center gap-2" title={s.hint}>
              <span className="w-[84px] text-secondary-foreground">{s.label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stock[s.key] as number}
                onChange={(e) => set(s.key, Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-[34px] text-right text-muted-foreground tabular-nums">
                {(stock[s.key] as number).toFixed(2)}
              </span>
            </label>
          ))}
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-muted-foreground text-caption">
          Export / import configuration (JSON)
        </summary>
        <textarea
          readOnly
          value={exportJson}
          className="w-full h-24 mt-1.5 font-mono text-caption"
        />
        <div className="flex gap-1.5 mt-1.5">
          <button type="button" className={BTN} onClick={copyConfig}>
            Copy
          </button>
          <button type="button" className={BTN} onClick={downloadConfig}>
            Download
          </button>
        </div>
        <textarea
          placeholder="Paste a configuration here to load it…"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          className="w-full h-16 mt-1.5 font-mono text-caption"
        />
        <button type="button" className={BTN} onClick={importJson}>
          Load pasted config
        </button>
      </details>

      <div className="flex items-center gap-2 mt-3.5">
        <span className="text-muted-foreground text-caption flex-1">{status}</span>
        <button type="button" className={BTN} onClick={() => setStock(DEFAULT_FULL)}>
          Reset
        </button>
        <button
          type="button"
          className={PRIMARY_BTN}
          onClick={() => {
            onApply(stock);
            setStatus('Applied to the design');
          }}
        >
          Apply to design
        </button>
      </div>
    </Modal>
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
      className="w-60 h-60 overflow-hidden"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }}
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
    <label className="flex items-center gap-1.5 text-secondary-foreground text-caption">
      {label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
