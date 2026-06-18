/**
 * Toolbar — the floating visual tool picker at the bottom of the editor (editor-chrome-spec.md
 * §Toolbar, Figma 35:84 + tool states 109:1383 + submenu 75:680). Purely presentational.
 *
 * Structure: a fixed-height **clip container** (overflow:hidden) bottom-anchored to the viewport,
 * with the card **band** at its base. Tools are taller than the band, so they stick up into the
 * container (and their bases overflow below, clipped) while the hover tooltip / selected submenu
 * float above — all bounded by the container, so nothing spills loose over the canvas.
 *
 * Three states per tool (Figma `state` variant): Active (resting) · Hover (lift + name tooltip) ·
 * Selected (the active tool: subtle shadow + its parameter submenu — stamp→size only for now).
 *
 * Each tool art is a tight bbox **frame** with the source SVG overflowing it via negative insets
 * (exactly as Figma lays it out), so every icon keeps its true proportions instead of being shrunk
 * unevenly by object-fit.
 *
 * Token note: escaped-slash token names need a DOUBLE backslash in JS strings (`'var(--color\\/x)'`).
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { EngineTool } from '../engine/api';
import { Button, Tooltip } from './Button';
import eraserIcon from '../assets/icons/tool-eraser.svg';
import stampIcon from '../assets/icons/tool-stamp.svg';
import scissorsIcon from '../assets/icons/tool-scissors.svg';

const C = {
  background: 'var(--color\\/background)',
  card: 'var(--color\\/card)',
  border: 'var(--color\\/border)',
  foreground: 'var(--color\\/foreground)',
  secondaryForeground: 'var(--color\\/secondary-foreground)',
  input: 'var(--color\\/input)',
} as const;

const BAR_H = 92; // visible card band; fits the 80px undo/redo column
const CONTAINER_H = 190; // clip bounds: band + room above for the hover tag / selected submenu

export interface ToolbarProps {
  readonly activeTool: EngineTool;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly stampSize: number;
  readonly scissorsMargin: number;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onTool: (tool: EngineTool) => void;
  readonly onStampSize: (v: number) => void;
  readonly onScissorsMargin: (v: number) => void;
}

// ── tool art: tight-bbox frame + source SVG overflowing it via negative insets (Figma 35:84) ──
type Art = { src: string; w: number; h: number; inset: [number, number, number, number] }; // inset %: T R B L
const ART: Record<string, Art> = {
  eraser:   { src: eraserIcon,   w: 65,  h: 104, inset: [-7, 0, -14, 0] },
  stamp:    { src: stampIcon,    w: 87.6, h: 127, inset: [-7.95, -16.1, -14.25, -16.1] },
  scissors: { src: scissorsIcon, w: 88,  h: 144, inset: [-2.66, -10.69, -9.33, -10.69] },
};

// ── per-tool config ──────────────────────────────────────────────────────────
type SubmenuParam = { tag: string; min: number; max: number; step: number };
type Entry = { key: string; tool?: EngineTool; label: string; param?: SubmenuParam };

const ENTRIES: Entry[] = [
  { key: 'scissors', tool: 'scissors', label: 'scissors'
    /* param: { tag: 'fit', min: -0.03, max: 0.03, step: 0.002 } — restore when submenu is ready */ },
  { key: 'stamp',    tool: 'circle',   label: 'stamp',   param: { tag: 'size', min: 0.03, max: 0.25, step: 0.005 } },
  { key: 'eraser',   tool: 'erase',    label: 'eraser' },
];

// ── shared styles ────────────────────────────────────────────────────────────
const clipContainer: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'max-content',
  height: CONTAINER_H,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
};

const band: CSSProperties = {
  height: BAR_H,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--sds-size-space-1200)',
  background: C.card,
  borderTop: `1px solid ${C.border}`,
  borderLeft: `1px solid ${C.border}`,
  borderRight: `1px solid ${C.border}`,
};

// marginLeft -1 overlaps the buttons' left border onto the band's, collapsing the doubled edge line.
const undoRedoCol: CSSProperties = { display: 'flex', flexDirection: 'column', flexShrink: 0, alignSelf: 'center', marginLeft: -1 };
const toolRow: CSSProperties = { display: 'flex', gap: 9, alignItems: 'center', flexShrink: 0, alignSelf: 'center' };

const slotWrap: CSSProperties = {
  width: 120,
  height: BAR_H,
  flexShrink: 0,
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const toolButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// Figma elevation tokens (Elevation/1 → /3). Multi-layer shadows simulate depth of a tall object.
// color/shadow/10 = rgba(46,41,38,0.2)
function shadowFor(state: 'active' | 'hover' | 'selected'): string {
  const c = 'rgba(46,41,38,0.2)';
  if (state === 'hover') {
    return [
      `drop-shadow(0px 0.7px 0.35px ${c})`,
      `drop-shadow(-0.1px 5px 2.55px ${c})`,
      `drop-shadow(-0.1px 13.4px 6.85px ${c})`,
      `drop-shadow(-0.4px 31.8px 16.2px ${c})`,
      `drop-shadow(-0.7px 66.7px 34px ${c})`,
    ].join(' ');
  }
  if (state === 'selected') {
    return [
      `drop-shadow(0px 0.7px 0.35px ${c})`,
      `drop-shadow(0px 3.1px 1.6px ${c})`,
      `drop-shadow(-0.1px 13.2px 6.75px ${c})`,
    ].join(' ');
  }
  // active — Elevation/1
  return [
    `drop-shadow(0px 0.7px 0.35px ${c})`,
    `drop-shadow(0px 2.6px 1.35px ${c})`,
  ].join(' ');
}

function liftFor(state: 'active' | 'hover' | 'selected'): string {
  switch (state) {
    case 'active':
      return 'translateY(0)';
    case 'hover':
      return 'translateY(-12px)';
    case 'selected':
      return 'translateY(-6px)';
  }
}

const ART_MOTION: CSSProperties = { transition: 'filter 180ms ease, transform 180ms ease', willChange: 'filter, transform' };

function popover(interactive: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: '50%',
    bottom: 134,
    transform: 'translate(-50%, 0)',
    zIndex: 2,
    pointerEvents: interactive ? 'auto' : 'none',
    animation: 'toolPopoverIn 160ms ease',
  };
}

function ToolArt({ art }: { art: Art }) {
  const [t, r, b, l] = art.inset;
  return (
    <div style={{ width: art.w, height: art.h, position: 'relative' }}>
      <div style={{ position: 'absolute', top: `${t}%`, right: `${r}%`, bottom: `${b}%`, left: `${l}%` }}>
        <img src={art.src} alt="" draggable={false} style={{ display: 'block', width: '100%', height: '100%', maxWidth: 'none' }} />
      </div>
    </div>
  );
}

// ── parameter submenu (functional slider — Figma 75:680) ─────────────────────
const tagText: CSSProperties = {
  fontFamily: 'var(--font\\/serif)',
  fontSize: 'var(--typography\\/button\\/size)',
  letterSpacing: 'var(--typography\\/button\\/letter-spacing)',
  textTransform: 'uppercase',
  color: C.secondaryForeground,
  whiteSpace: 'nowrap',
};
const minMaxText: CSSProperties = {
  fontFamily: 'var(--font\\/serif)',
  fontSize: 'var(--typography\\/button-small\\/size)',
  letterSpacing: 'var(--typography\\/button-small\\/letter-spacing)',
  textTransform: 'uppercase',
  color: C.foreground,
};

function Slider({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const pct = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  return (
    <div style={{ width: 268, height: 24, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
      <span style={minMaxText}>MIN</span>
      <div style={{ flex: 1, height: 24, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, height: 40, position: 'relative' }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 10, transform: 'translateY(-50%)', background: C.input, borderRadius: 4 }} />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              width: `${pct * 100}%`,
              height: 10,
              transform: 'translateY(-50%)',
              background: C.foreground,
              borderTopLeftRadius: 4,
              borderBottomLeftRadius: 4,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `calc(${pct * 100}% - 12px)`,
              width: 24,
              height: 40,
              transform: 'translateY(-50%)',
              background: C.foreground,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
            }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(ev) => onChange(Number(ev.target.value))}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' }}
        />
      </div>
      <span style={minMaxText}>MAX</span>
    </div>
  );
}

function Submenu({ param, value, onChange }: { param: SubmenuParam; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ height: 24, display: 'flex', alignItems: 'center', background: C.background, border: `1px solid ${C.border}` }}>
      <div
        style={{
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: 4,
          background: C.card,
          border: `1px solid ${C.border}`,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.secondaryForeground }}>
          expand_content
        </span>
        <span style={tagText}>{param.tag}</span>
      </div>
      <Slider value={value} min={param.min} max={param.max} step={param.step} onChange={onChange} />
    </div>
  );
}

// ── component ────────────────────────────────────────────────────────────────
export function Toolbar(props: ToolbarProps) {
  const { activeTool, canUndo, canRedo, onUndo, onRedo, onTool } = props;
  const [hovered, setHovered] = useState<string | null>(null);

  const paramValue = (e: Entry): number => {
    if (e.tool === 'circle') return props.stampSize;
    if (e.tool === 'scissors') return props.scissorsMargin;
    return 0;
  };
  const paramOnChange = (e: Entry): ((v: number) => void) => {
    if (e.tool === 'circle') return props.onStampSize;
    if (e.tool === 'scissors') return props.onScissorsMargin;
    return () => {};
  };

  const renderInner = (key: string) => {
    const art = ART[key];
    return art ? <ToolArt art={art} /> : null;
  };

  return (
    <div style={clipContainer}>
      <div style={band}>
        {/* Undo / redo column — shared Button (icon, disabled state) */}
        <div style={undoRedoCol}>
          <Button type="icon" icon="undo" title="Undo" ariaLabel="Undo" disabled={!canUndo} onClick={onUndo} style={{ marginBottom: -1 }} />
          <Button type="icon" icon="redo" title="Redo" ariaLabel="Redo" disabled={!canRedo} onClick={onRedo} />
        </div>

        {/* Tool row */}
        <div style={toolRow}>
          {ENTRIES.map((e) => {
            const isSelected = !!e.tool && activeTool === e.tool;
            const isHovered = hovered === e.key;
            const showSubmenu = isSelected && !!e.param;
            const showTag = !showSubmenu && isHovered;
            const state = showSubmenu ? 'selected' : isHovered ? 'hover' : 'active';
            const shadow = shadowFor(state);
            return (
              <div
                key={e.key}
                style={slotWrap}
                onPointerEnter={() => setHovered(e.key)}
                onPointerLeave={() => setHovered((h) => (h === e.key ? null : h))}
              >
                {showSubmenu && e.param && (
                  <div style={popover(true)}>
                    <Submenu param={e.param} value={paramValue(e)} onChange={paramOnChange(e)} />
                  </div>
                )}
                {showTag && (
                  <div style={popover(false)}>
                    <Tooltip label={e.label} />
                  </div>
                )}
                <button
                  type="button"
                  style={toolButton}
                  title={e.label}
                  aria-label={e.label}
                  aria-pressed={isSelected}
                  onClick={() => e.tool && onTool(e.tool)}
                >
                  <div style={{ ...ART_MOTION, filter: shadow, transform: liftFor(state) }}>{renderInner(e.key)}</div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
