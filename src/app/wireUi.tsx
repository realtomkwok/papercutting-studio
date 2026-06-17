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

import { useEffect, useMemo, useState } from 'react';
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
import { PaperCuttingEngine } from '../engine/EditorEngine';
import { symmetricalTriangle } from '../core/foldConfig';
import type { DesignState, EngineTool, PaperStockProps } from '../engine/api';
import type { ColorPreset, PaperProperties } from './types';
import { COLOR_PRESET_HEX } from './types';

/** Reverse map (lowercased hex → preset) so a configurator colour can update the toolbar card. */
const PRESET_BY_HEX = new Map<string, ColorPreset>(
  (Object.entries(COLOR_PRESET_HEX) as [ColorPreset, string][]).map(([preset, hex]) => [
    hex.toLowerCase(),
    preset,
  ]),
);

type Screen = 'editor' | 'preview';

/** Build a share link encoding the full design state (`?design=<base64 JSON>`). */
function shareUrlFor(state: DesignState): string {
  const { origin, pathname } = window.location;
  const encoded = encodeURIComponent(btoa(JSON.stringify(state)));
  return `${origin}${pathname}?design=${encoded}`;
}

/** Read a `?design=` (or legacy `?stock=`) param from the URL, or `null` if absent/invalid. */
function designFromUrl(): DesignState | PaperStockProps | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const design = params.get('design');
    if (design) return JSON.parse(atob(decodeURIComponent(design))) as DesignState;
    const stock = params.get('stock');
    if (stock) return JSON.parse(atob(decodeURIComponent(stock))) as PaperStockProps;
    return null;
  } catch {
    return null;
  }
}

export function Studio() {
  const engine = useMemo(() => new PaperCuttingEngine(), []);
  const [screen, setScreen] = useState<Screen>('editor');
  const [shareOpen, setShareOpen] = useState(false);
  const [tool, setTool] = useState<EngineTool>('freehand');
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [cuts, setCuts] = useState(0);
  const [outlines, setOutlines] = useState(0);
  const [paperProperties, setPaperProperties] = useState<PaperProperties>({
    colorPreset: 'coral-red',
    texturePreset: 'rice-paper',
  });
  // Mirrors the M5 paper stock the engine bakes (seeds the configurator); {} = engine defaults.
  const [paperStock, setPaperStock] = useState<PaperStockProps>({});
  const [paperConfigOpen, setPaperConfigOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printPreviewUrl, setPrintPreviewUrl] = useState<string | null>(null);
  // Tool-parameter state, surfaced by the Selected-tool submenu sliders (pencil width, stamp size,
  // scissors cut-fit). Defaults mirror what the engine is seeded with on mount.
  const [pencilWidth, setPencilWidth] = useState(1.6);
  const [stampSize, setStampSize] = useState(0.12);
  const [scissorsMargin, setScissorsMargin] = useState(0);

  useEffect(() => {
    const unsubs = [
      engine.on('historychange', setHistory),
      engine.on('pathschange', ({ count }) => setCuts(count)),
      engine.on('outlineschange', ({ count }) => setOutlines(count)),
    ];
    // Seed the engine with the initial tool-param values (eraser width has no submenu yet).
    engine.setStampSize(stampSize);
    engine.setPencilWidth(pencilWidth);
    engine.setEraserWidth(0.025);
    engine.setScissorsMargin(scissorsMargin);
    // Restore a shared design from the URL (?design= full state, or legacy ?stock= stock only).
    const fromUrl = designFromUrl();
    if (fromUrl && 'version' in fromUrl) {
      // Full DesignState from ?design=
      engine.loadDesignState(fromUrl);
      handleApplyPaperStock(fromUrl.stock);
    } else if (fromUrl) {
      // Legacy ?stock= — only restores paper stock
      handleApplyPaperStock(fromUrl as PaperStockProps);
    }
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const handlePencilWidth = (v: number) => {
    setPencilWidth(v);
    engine.setPencilWidth(v);
  };
  const handleStampSize = (v: number) => {
    setStampSize(v);
    engine.setStampSize(v);
  };
  const handleScissorsMargin = (v: number) => {
    setScissorsMargin(v);
    engine.setScissorsMargin(v);
  };

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

  const handleNew = () => {
    if ((cuts > 0 || outlines > 0) && !window.confirm('Clear the current design?')) return;
    engine.clearPaths();
    if (screen === 'preview') goToEditor();
  };

  const handleApplyPaperStock = (props: PaperStockProps) => {
    setPaperStock(props);
    engine.setPaperStock(props);
    // Keep the toolbar card in sync if the chosen front colour matches a named preset.
    const preset = props.colorFront ? PRESET_BY_HEX.get(props.colorFront.toLowerCase()) : undefined;
    if (preset) setPaperProperties((p) => ({ ...p, colorPreset: preset }));
  };

  // ── Preview & Share actions ───────────────────────────────────────────────────────────────────
  // Print: open the print-preview dialog (M7) showing the to-scale instruction sheet.
  const handlePrint = () => {
    setPrintPreviewUrl(engine.getPreviewImageUrl());
    setPrintOpen(true);
  };
  // Save: download the full design state as JSON (cuts + fold + stock + tool params).
  const handleSave = () => {
    const state = engine.getDesignState();
    const config = {
      ...state,
      toolParams: { pencilWidth, stampSize, scissorsMargin },
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paper-cutting-design.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {screen === 'editor' ? (
        <TopBar
          onNew={handleNew}
          // TODO(import): the real target is the `lotus-cross` template, but it isn't built yet (only
          // `test-circles` exists). Loading `test-circles` for now so the button is functional; swap to
          // `lotus-cross` once that template's geometry is pinned.
          onImport={() => engine.loadTemplate('test-circles')}
          onShare={goToPreview}
        />
      ) : (
        <PreviewTopBar onBack={goToEditor} onNew={handleNew} />
      )}
      <main
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          minHeight: 0,
          backgroundColor: 'var(--color\\/background)',
          backgroundImage: 'radial-gradient(circle, var(--color\\/border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <CanvasHost engine={engine} />
        {screen === 'editor' ? (
          <>
            <Toolbar
              activeTool={tool}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              pencilWidth={pencilWidth}
              stampSize={stampSize}
              scissorsMargin={scissorsMargin}
              onUndo={() => engine.undo()}
              onRedo={() => engine.redo()}
              onTool={chooseTool}
              onPencilWidth={handlePencilWidth}
              onStampSize={handleStampSize}
              onScissorsMargin={handleScissorsMargin}
            />
            <PreviewPanel />
          </>
        ) : (
          <>
            <InstructionsCard />
            <PreviewBottomBar
              onPrint={handlePrint}
              onSave={handleSave}
              onShare={() => setShareOpen(true)}
            />
          </>
        )}
      </main>
      <PaperStockConfigurator
        open={paperConfigOpen}
        initial={paperStock}
        onApply={handleApplyPaperStock}
        onClose={() => setPaperConfigOpen(false)}
      />
      <SharePopup
        open={shareOpen}
        url={shareUrlFor(engine.getDesignState())}
        onClose={() => setShareOpen(false)}
      />
      <PrintDialog
        open={printOpen}
        fold={symmetricalTriangle}
        previewImageUrl={printPreviewUrl}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}
