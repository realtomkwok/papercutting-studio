/**
 * wireUi — the single seam that knows BOTH the engine and the UI (dev-spec §3.3 / architecture).
 *
 * It owns the `PaperCuttingEngine`, renders the presentational chrome (`TopBar`, `Toolbar`,
 * `PreviewPanel`, `CanvasHost`), maps callbacks to engine commands, and mirrors engine events into
 * React state for enabled/active states. When the Figma Make chrome is regenerated, only this file
 * should need re-checking.
 */

import { useEffect, useMemo, useState } from 'react';
import { CanvasHost } from './CanvasHost';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { PreviewPanel } from './PreviewPanel';
import { PaperStockConfigurator } from './PaperStockConfigurator';
import { PaperCuttingEngine } from '../engine/EditorEngine';
import type { EngineTool, PaperStockProps } from '../engine/api';
import type { ColorPreset, PaperProperties } from './types';
import { COLOR_PRESET_HEX } from './types';

/** Reverse map (lowercased hex → preset) so a configurator colour can update the toolbar card. */
const PRESET_BY_HEX = new Map<string, ColorPreset>(
  (Object.entries(COLOR_PRESET_HEX) as [ColorPreset, string][]).map(([preset, hex]) => [
    hex.toLowerCase(),
    preset,
  ]),
);

export function Studio() {
  const engine = useMemo(() => new PaperCuttingEngine(), []);
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

  const handleNew = () => {
    if ((cuts > 0 || outlines > 0) && !window.confirm('Clear the current design?')) return;
    engine.clearPaths();
  };

  const handleApplyPaperStock = (props: PaperStockProps) => {
    setPaperStock(props);
    engine.setPaperStock(props);
    // Keep the toolbar card in sync if the chosen front colour matches a named preset.
    const preset = props.colorFront ? PRESET_BY_HEX.get(props.colorFront.toLowerCase()) : undefined;
    if (preset) setPaperProperties((p) => ({ ...p, colorPreset: preset }));
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        onNew={handleNew}
        // TODO(import): the real target is the `lotus-cross` template, but it isn't built yet (only
        // `test-circles` exists). Loading `test-circles` for now so the button is functional; swap to
        // `lotus-cross` once that template's geometry is pinned.
        onImport={() => engine.loadTemplate('test-circles')}
        onShare={() => {
          /* TODO: navigate to the Share screen (separate Figma frame). */
        }}
      />
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
        <Toolbar
          activeTool={tool}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          paperProperties={paperProperties}
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
      </main>
      <PaperStockConfigurator
        open={paperConfigOpen}
        initial={paperStock}
        onApply={handleApplyPaperStock}
        onClose={() => setPaperConfigOpen(false)}
      />
    </div>
  );
}
