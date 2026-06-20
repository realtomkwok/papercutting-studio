/**
 * wireUi — the single seam that knows BOTH the engine and the UI (dev-spec §3.3 / architecture).
 *
 * It owns the `PaperCuttingEngine`, renders the presentational chrome (`TopBar`, `Toolbar`,
 * `PreviewPanel`, `CanvasHost`, and the Preview & Share screen), maps callbacks to engine commands,
 * and mirrors engine events into React state for enabled/active states. When the Figma Make chrome is
 * regenerated, only this file should need re-checking.
 *
 * Two screens share ONE mounted engine (the engine owns its canvases inside `CanvasHost`, which stays
 * mounted across screens): the **editor** (draw mode) and **Preview & Share** (the 3D unfold view).
 * Switching screens just toggles the engine mode and swaps the surrounding chrome — no remount.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasHost } from './CanvasHost';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { PreviewTopBar } from './PreviewTopBar';
import { PreviewPanel } from './PreviewPanel';
import { InstructionsCard } from './InstructionsCard';
import { PreviewBottomBar } from './PreviewBottomBar';
import { SharePopup } from './SharePopup';
import { PrintDialog } from './PrintDialog';
import { PaperStockConfigurator } from './PaperStockConfigurator';
import { SidePanel, TEXTURES } from './SidePanel';
import { PaperShaderBg } from './PaperShaderBg';
import { PaperCuttingEngine } from '../engine/EditorEngine';
import { symmetricalTriangle } from '../core/foldConfig';
import type { DesignState, EngineTool, PaperStockProps, StampTool } from '../engine/api';
import {
  buildShareUrl,
  decodeDesign,
  decodeLegacyDesign,
  SHARE_PARAM,
  LEGACY_PARAM,
} from './shareCodec';
import type { Point } from '../core/geometry';
import type { ColorPreset, PaperProperties } from './types';
import { COLOR_PRESET_HEX } from './types';

/** Darken a hex colour by multiplying each channel by `factor` (used to derive fiber colour). */
function darkenHex(hex: string, factor = 0.82): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const ch = (v: number) => Math.round(v * factor).toString(16).padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

/** Reverse map (lowercased hex → preset) so a loaded design colour can update the side panel. */
const PRESET_BY_HEX = new Map<string, ColorPreset>(
  (Object.entries(COLOR_PRESET_HEX) as [ColorPreset, string][]).map(([preset, hex]) => [
    hex.toLowerCase(),
    preset,
  ]),
);

type Screen = 'editor' | 'preview';

/** Read a design from the URL: the compact `?d=` param, a legacy `?design=` link, or a legacy
 *  `?stock=` (stock only). Async because the compact codec decompresses asynchronously. */
async function designFromUrl(): Promise<DesignState | PaperStockProps | null> {
  const params = new URLSearchParams(window.location.search);
  const compact = params.get(SHARE_PARAM);
  if (compact) {
    const decoded = await decodeDesign(compact);
    if (decoded) return decoded;
  }
  const design = params.get(LEGACY_PARAM);
  if (design) {
    const decoded = decodeLegacyDesign(design);
    if (decoded) return decoded;
  }
  const stock = params.get('stock');
  if (stock) {
    try {
      return JSON.parse(atob(decodeURIComponent(stock))) as PaperStockProps;
    } catch {
      return null;
    }
  }
  return null;
}

export function Studio() {
  const engine = useMemo(() => new PaperCuttingEngine(), []);
  const [screen, setScreen] = useState<Screen>('editor');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [tool, setTool] = useState<EngineTool>('scissors');
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [cuts, setCuts] = useState(0);
  const [outlines, setOutlines] = useState(0);
  const [_paperProperties, setPaperProperties] = useState<PaperProperties>({
    colorPreset: 'coral-red',
    texturePreset: 'xuan',
  });
  // Mirrors the M5 paper stock the engine bakes (seeds the configurator); {} = engine defaults.
  const [paperStock, setPaperStock] = useState<PaperStockProps>({});
  const [paperConfigOpen, setPaperConfigOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printPreviewUrl, setPrintPreviewUrl] = useState<string | null>(null);
  const [printShareUrl, setPrintShareUrl] = useState<string | null>(null);
  const [printCuts, setPrintCuts] = useState<readonly (readonly Point[])[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Tool-parameter state, surfaced by the Selected-tool submenu sliders (stamp size, scissors
  // cut-fit). Defaults mirror what the engine is seeded with on mount.
  const [stampSize, setStampSize] = useState(0.03);
  const [stampShape, setStampShape] = useState<StampTool>('circle');
  const [scissorsMargin, setScissorsMargin] = useState(0);

  useEffect(() => {
    const unsubs = [
      engine.on('historychange', setHistory),
      engine.on('pathschange', ({ count }) => setCuts(count)),
      engine.on('outlineschange', ({ count }) => setOutlines(count)),
    ];
    // Seed the engine with the initial tool-param values.
    engine.setStampSize(stampSize);
    engine.setScissorsMargin(scissorsMargin);
    // Seed the wedge colour from the initially-selected swatch — otherwise the engine falls back to its
    // own hardcoded default, which won't match the selected preset. A URL-restored design (below)
    // overrides this with its own stock.
    const initialHex = COLOR_PRESET_HEX[_paperProperties.colorPreset];
    handleApplyPaperStock({ colorBack: initialHex, colorFront: darkenHex(initialHex) });
    // Restore a shared design from the URL (?d= compact, legacy ?design= full state, or legacy
    // ?stock= stock only). Async because the compact codec decompresses asynchronously.
    void designFromUrl().then((fromUrl) => {
      if (fromUrl && 'version' in fromUrl) {
        engine.loadDesignState(fromUrl);
        handleApplyPaperStock(fromUrl.stock);
        // A shared design opens straight into the 3D unfold preview (the recipient wants to *see* the
        // pattern, not edit a blank-looking folded wedge); the Back button drops into the editor.
        goToPreview();
      } else if (fromUrl) {
        handleApplyPaperStock(fromUrl as PaperStockProps);
      }
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const handleStampSize = (v: number) => {
    setStampSize(v);
    engine.setStampSize(v);
  };
  const handleStampShape = (shape: StampTool) => {
    setStampShape(shape);
    chooseTool(shape);
  };
  const handleScissorsMargin = (v: number) => {
    setScissorsMargin(v);
    engine.setScissorsMargin(v);
  };

  // Rebuild the (async, compressed) share link whenever the Share popup opens.
  useEffect(() => {
    if (!shareOpen) return;
    let live = true;
    setShareUrl('');
    void buildShareUrl(engine.getDesignState()).then((url) => {
      if (live) setShareUrl(url);
    });
    return () => {
      live = false;
    };
  }, [shareOpen, engine]);

  // Shift+P opens the paper-stock configurator (temporary — no Paper-Texture submenu designed yet).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'P') setPaperConfigOpen(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const chooseTool = (t: EngineTool) => {
    setTool(t);
    engine.setTool(t);
  };

  // ── Screen navigation ─────────────────────────────────────────────────────────────────────────
  // Editor → Preview & Share: switch the engine to the 3D unfold view and play the reveal.
  const goToPreview = () => {
    setScreen('preview');
    engine.setMode('unfold3d');
    engine.playUnfold();
  };
  // Preview & Share → Editor: back to the flat draw view.
  const goToEditor = () => {
    setScreen('editor');
    engine.setMode('draw');
  };

  const handleImport = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as DesignState & {
          toolParams?: { stampSize?: number; scissorsMargin?: number };
        };
        if ('version' in parsed) {
          engine.loadDesignState(parsed);
          handleApplyPaperStock(parsed.stock ?? {});
          if (parsed.toolParams) {
            if (parsed.toolParams.stampSize !== undefined) handleStampSize(parsed.toolParams.stampSize);
            if (parsed.toolParams.scissorsMargin !== undefined) handleScissorsMargin(parsed.toolParams.scissorsMargin);
          }
          if (screen === 'preview') goToEditor();
        }
      } catch {
        // ignore invalid JSON
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so the same file can be re-imported
  };

  const handleNew = () => {
    if ((cuts > 0 || outlines > 0) && !window.confirm('Clear the current design?')) return;
    engine.clearPaths();
    if (screen === 'preview') goToEditor();
  };

  const handleApplyPaperStock = (props: PaperStockProps) => {
    setPaperStock(props);
    engine.setPaperStock(props);
    // Keep the side panel card in sync if the paper base colour matches a named preset.
    const preset = props.colorBack ? PRESET_BY_HEX.get(props.colorBack.toLowerCase()) : undefined;
    if (preset) setPaperProperties((p) => ({ ...p, colorPreset: preset }));
  };

  // ── Preview & Share actions ───────────────────────────────────────────────────────────────────
  // Print: open the print-preview dialog (M7) showing the to-scale instruction sheet.
  const handlePrint = () => {
    const state = engine.getDesignState();
    setPrintPreviewUrl(engine.getPreviewImageUrl());
    setPrintCuts(state.cuts);
    setPrintShareUrl(null);
    // Build the (async, compressed) preview link so it can be printed as a QR code.
    void buildShareUrl(state).then(setPrintShareUrl);
    setPrintOpen(true);
  };
  // Save: download the full design state as JSON (cuts + fold + stock + tool params).
  const handleSave = () => {
    const state = engine.getDesignState();
    const config = {
      ...state,
      toolParams: { stampSize, scissorsMargin },
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paper-cutting-design.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const editorActive = screen === 'editor';
  const previewActive = screen === 'preview';
  // Fade strategy for the top bar (not over the canvas): full-coverage absolute wrappers are fine
  // since no canvas lives under them. visibility:hidden flips at the end of the transition so
  // buttons are non-interactive once invisible.
  const barFadeBase: React.CSSProperties = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, transition: 'opacity 250ms ease, visibility 250ms' };
  const editorBarFade: React.CSSProperties = { ...barFadeBase, opacity: editorActive ? 1 : 0, visibility: editorActive ? 'visible' : 'hidden' };
  const previewBarFade: React.CSSProperties = { ...barFadeBase, opacity: previewActive ? 1 : 0, visibility: previewActive ? 'visible' : 'hidden' };
  // Fade strategy for chrome OVER the canvas: zero-height wrappers (no position:absolute, so they
  // don't block the canvas hit region). The absolutely-positioned children (Toolbar, InstructionsCard
  // etc.) remain positioned relative to `main` — unchanged from before the wrappers existed.
  // visibility:hidden gates interactivity of the entire inactive subtree.
  const chromeFadeBase: React.CSSProperties = { transition: 'opacity 250ms ease, visibility 250ms' };
  const editorChromeFade: React.CSSProperties = { ...chromeFadeBase, opacity: editorActive ? 1 : 0, visibility: editorActive ? 'visible' : 'hidden' };
  const previewChromeFade: React.CSSProperties = { ...chromeFadeBase, opacity: previewActive ? 1 : 0, visibility: previewActive ? 'visible' : 'hidden' };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar — both bars always mounted; fade between them */}
      <div style={{ position: 'relative', height: 42, flexShrink: 0 }}>
        <div style={editorBarFade}>
          <TopBar
            onNew={handleNew}
            // TODO(import): the real target is the `lotus-cross` template, but it isn't built yet (only
            // `test-circles` exists). Loading `test-circles` for now so the button is functional; swap to
            // `lotus-cross` once that template's geometry is pinned.
            onImport={handleImport}
            onShare={goToPreview}
          />
        </div>
        <div style={previewBarFade}>
          <PreviewTopBar onBack={goToEditor} onNew={handleNew} />
        </div>
      </div>
      <main
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Paper texture background — absolute first child, naturally behind everything in DOM order */}
        <PaperShaderBg
          colorBack="#f5f2ef"
          colorFront="#e4dcd4"
          fiber={0.14}
          fiberSize={0.20}
          crumples={0.07}
          crumpleSize={0.60}
          drops={0.06}
          roughness={0.90}
          contrast={0.20}
          worldSize={512}
        />
        {/* Line grid overlay — second absolute child, in front of shader but behind canvas */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: [
              'linear-gradient(to right, rgba(154,144,136,0.18) 1px, transparent 1px)',
              'linear-gradient(to bottom, rgba(154,144,136,0.18) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '24px 24px',
          }}
        />
        <CanvasHost engine={engine} />
        {/* Editor chrome — zero-height wrapper; children remain positioned relative to main */}
        <div style={editorChromeFade}>
          <Toolbar
            activeTool={tool}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            stampSize={stampSize}
            stampShape={stampShape}
            scissorsMargin={scissorsMargin}
            onUndo={() => engine.undo()}
            onRedo={() => engine.redo()}
            onTool={chooseTool}
            onStampSize={handleStampSize}
            onStampShape={handleStampShape}
            onScissorsMargin={handleScissorsMargin}
          />
          <SidePanel
            colorPreset={_paperProperties.colorPreset}
            texturePreset={_paperProperties.texturePreset}
            onColorChange={(preset) => {
              setPaperProperties((p) => ({ ...p, colorPreset: preset }));
              const hex = COLOR_PRESET_HEX[preset];
              handleApplyPaperStock({ ...paperStock, colorBack: hex, colorFront: darkenHex(hex) });
            }}
            onTextureChange={(preset) => {
              setPaperProperties((p) => ({ ...p, texturePreset: preset }));
              const profile = TEXTURES.find((t) => t.id === preset);
              if (profile) {
                const { id: _id, label: _label, ...shaderParams } = profile;
                handleApplyPaperStock({ ...paperStock, ...shaderParams });
              }
            }}
          />
          <PreviewPanel />
        </div>
        {/* Preview chrome — zero-height wrapper */}
        <div style={previewChromeFade}>
          <InstructionsCard />
          <PreviewBottomBar
            onPrint={handlePrint}
            onSave={handleSave}
            onShare={() => setShareOpen(true)}
          />
        </div>
      </main>
      <PaperStockConfigurator
        open={paperConfigOpen}
        initial={paperStock}
        onApply={handleApplyPaperStock}
        onClose={() => setPaperConfigOpen(false)}
      />
      <SharePopup
        open={shareOpen}
        url={shareUrl}
        onClose={() => setShareOpen(false)}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />
      <PrintDialog
        open={printOpen}
        fold={symmetricalTriangle}
        cuts={printCuts}
        previewImageUrl={printPreviewUrl}
        shareUrl={printShareUrl}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}
