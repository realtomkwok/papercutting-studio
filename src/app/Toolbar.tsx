/**
 * Toolbar — a minimal, purely presentational test harness for the editor (props in, callbacks out).
 * It imports only the `EngineTool` type from the engine contract, never the engine itself; all
 * wiring to `EditorEngine` lives in `wireUi.tsx` (dev-spec engine/UI separation contract).
 *
 * Not the final Figma Make chrome — just enough to drive pencil → scissors → eraser, the stamps,
 * and undo/redo by hand.
 */

import type { CSSProperties } from 'react';
import type { EngineTool } from '../engine/api';

const TOOLS: { id: EngineTool; label: string }[] = [
  { id: 'freehand', label: '✏︎ Pencil' },
  { id: 'scissors', label: '✂︎ Scissors' },
  { id: 'erase', label: '⌫ Eraser' },
  { id: 'circle', label: '● Circle' },
  { id: 'crescent', label: '☾ Crescent' },
  { id: 'sawtooth', label: '⋀ Sawtooth' },
  { id: 'triangle', label: '▲ Triangle' },
];

const STAMP_TOOLS = new Set<EngineTool>(['circle', 'crescent', 'sawtooth', 'triangle']);

export interface ToolbarProps {
  readonly activeTool: EngineTool;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly cuts: number;
  readonly outlines: number;
  readonly stampSize: number;
  readonly rotation: number;
  readonly onTool: (tool: EngineTool) => void;
  readonly onCut: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClear: () => void;
  readonly onStampSize: (size: number) => void;
  readonly onRotate: (deltaDeg: number) => void;
}

const bar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderBottom: '1px solid #e6e1d8',
  background: '#fbf9f5',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  flexWrap: 'wrap',
};

const sep: CSSProperties = { width: 1, alignSelf: 'stretch', background: '#e0dad0', margin: '0 4px' };

function btn(active: boolean, disabled = false): CSSProperties {
  return {
    padding: '5px 10px',
    border: `1px solid ${active ? '#c8102e' : '#d4cdc1'}`,
    borderRadius: 5,
    background: active ? '#c8102e' : '#fff',
    color: disabled ? '#bbb' : active ? '#fff' : '#333',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    font: 'inherit',
  };
}

export function Toolbar(props: ToolbarProps) {
  const { activeTool, canUndo, canRedo, cuts, outlines, stampSize, rotation } = props;
  return (
    <div style={bar}>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          style={btn(activeTool === t.id)}
          onClick={() => props.onTool(t.id)}
        >
          {t.label}
        </button>
      ))}
      {STAMP_TOOLS.has(activeTool) && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#555' }}>
          size
          <input
            type="range"
            min={0.03}
            max={0.25}
            step={0.005}
            value={stampSize}
            onChange={(e) => props.onStampSize(Number(e.target.value))}
          />
        </label>
      )}
      <span style={sep} />
      <button type="button" style={btn(false)} onClick={props.onCut} title="Cut out all pending outlines">
        Cut all
      </button>
      <button type="button" style={btn(false, !canUndo)} disabled={!canUndo} onClick={props.onUndo}>
        ↶ Undo
      </button>
      <button type="button" style={btn(false, !canRedo)} disabled={!canRedo} onClick={props.onRedo}>
        ↷ Redo
      </button>
      <button type="button" style={btn(false)} onClick={props.onClear}>
        Clear
      </button>
      <span style={sep} />
      <button type="button" style={btn(false)} onClick={() => props.onRotate(-15)} title="Rotate paper left">
        ⟲
      </button>
      <button type="button" style={btn(false)} onClick={() => props.onRotate(15)} title="Rotate paper right">
        ⟳
      </button>
      <span style={{ color: '#aaa', minWidth: 32 }}>{rotation}°</span>
      <span style={sep} />
      <span style={{ color: '#888' }}>
        {cuts} cut{cuts === 1 ? '' : 's'}
        {outlines > 0 ? `, ${outlines} pending` : ''}
      </span>
    </div>
  );
}
