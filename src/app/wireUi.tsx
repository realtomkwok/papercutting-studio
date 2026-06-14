/**
 * wireUi — the single seam that knows BOTH the engine and the UI (dev-spec §3.3 / architecture).
 *
 * It owns the `PaperCuttingEngine`, renders the presentational `Toolbar` + `CanvasHost`, maps the
 * toolbar's callbacks to engine commands, and mirrors engine events into React state for the
 * toolbar's enabled/active states. When the Figma Make chrome is regenerated, only this file should
 * need re-checking — the engine and the presentational components stay put.
 */

import { useEffect, useMemo, useState } from 'react';
import { CanvasHost } from './CanvasHost';
import { Toolbar } from './Toolbar';
import { PaperCuttingEngine } from '../engine/EditorEngine';
import type { EngineMode, EngineTool } from '../engine/api';

export function Studio() {
  const engine = useMemo(() => new PaperCuttingEngine(), []);
  const [tool, setTool] = useState<EngineTool>('freehand');
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [cuts, setCuts] = useState(0);
  const [outlines, setOutlines] = useState(0);
  const [stampSize, setStampSize] = useState(0.12);
  const [rotation, setRotation] = useState(0);
  const [mode, setModeState] = useState<EngineMode>('draw');
  const [unfoldProgress, setUnfoldProgress] = useState(1);

  useEffect(() => {
    const unsubs = [
      engine.on('historychange', setHistory),
      engine.on('pathschange', ({ count }) => setCuts(count)),
      engine.on('outlineschange', ({ count }) => setOutlines(count)),
      engine.on('modechange', ({ mode }) => setModeState(mode)),
      // The play animation drives progress engine-side; mirror it so the scrubber tracks the fold.
      engine.on('unfoldprogress', ({ t }) => setUnfoldProgress(t)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [engine]);

  const chooseTool = (t: EngineTool) => {
    setTool(t);
    engine.setTool(t);
  };
  const changeStampSize = (size: number) => {
    setStampSize(size);
    engine.setStampSize(size);
  };
  const rotate = (delta: number) => {
    const deg = ((rotation + delta) % 360 + 360) % 360;
    setRotation(deg);
    engine.setViewRotation(deg);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Toolbar
        activeTool={tool}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        cuts={cuts}
        outlines={outlines}
        stampSize={stampSize}
        rotation={rotation}
        mode={mode}
        unfoldProgress={unfoldProgress}
        onTool={chooseTool}
        onCut={() => engine.cut()}
        onUndo={() => engine.undo()}
        onRedo={() => engine.redo()}
        onClear={() => engine.clearPaths()}
        onStampSize={changeStampSize}
        onRotate={rotate}
        onSetMode={(m) => engine.setMode(m)}
        onLoadTemplate={() => engine.loadTemplate('test-circles')}
        onUnfoldProgress={(t) => engine.setUnfoldProgress(t)}
        onPlayUnfold={() => engine.playUnfold()}
      />
      <main style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <CanvasHost engine={engine} />
      </main>
    </div>
  );
}
