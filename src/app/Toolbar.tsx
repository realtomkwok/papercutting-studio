/**
 * Toolbar — the floating visual tool picker at the bottom of the editor (editor-chrome-spec.md
 * §Toolbar, Figma 35:84 + tool states 42:146 + submenu 75:680). Purely presentational.
 *
 * Structure: a fixed-height **clip container** (overflow:hidden) bottom-anchored to the viewport, with
 * the card **band** at its base. Tools are taller than the band, so they stick up into the container
 * (and their bases overflow below, clipped) while the hover tooltip / selected submenu float above —
 * all bounded by the container, so nothing spills loose over the canvas.
 *
 * Three states per tool (Figma `state` variant): Active (resting) · Hover (lift + name tooltip) ·
 * Selected (the active tool: subtle shadow + its parameter submenu — a functional slider for
 * pencil→width, stamp→size, scissors→fit).
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
import type { PaperProperties } from './types';
import { COLOR_PRESET_HEX } from './types';
import { Button, Tooltip } from './Button';
import pencilIcon from '../assets/icons/tool-pencil.svg';
import stampIcon from '../assets/icons/tool-stamp.svg';
import scissorsIcon from '../assets/icons/tool-scissors.svg';
import rotateIcon from '../assets/icons/tool-rotate.svg';

const C = {
  background: 'var(--color\\/background)',
  card: 'var(--color\\/card)',
  border: 'var(--color\\/border)',
  foreground: 'var(--color\\/foreground)',
  secondaryForeground: 'var(--color\\/secondary-foreground)',
  input: 'var(--color\\/input)',
  parchment: 'var(--neutral\\/parchment)',
  warmWhite: 'var(--neutral\\/warm-white)',
  linen: 'var(--neutral\\/linen)',
  ink: 'var(--neutral\\/ink)',
} as const;

const FONT = "'Shippori Antique B1', serif";
const BAR_H = 92; // visible card band; fits the 80px undo/redo column
const CONTAINER_H = 190; // clip bounds: band + room above for the hover tag / selected submenu

export interface ToolbarProps {
  readonly activeTool: EngineTool;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly paperProperties: PaperProperties;
  readonly pencilWidth: number;
  readonly stampSize: number;
  readonly scissorsMargin: number;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onTool: (tool: EngineTool) => void;
  readonly onPencilWidth: (v: number) => void;
  readonly onStampSize: (v: number) => void;
  readonly onScissorsMargin: (v: number) => void;
}

// ── tool art: tight-bbox frame + source SVG overflowing it via negative insets (Figma 35:84) ──
type Art = { src: string; w: number; h: number; inset: [number, number, number, number] }; // inset %: T R B L
const ART: Record<string, Art> = {
  pencil: { src: pencilIcon, w: 36, h: 136, inset: [-5.1, -39.17, -13.31, -39.17] },
  stamp: { src: stampIcon, w: 87.6, h: 127, inset: [-7.95, -16.1, -14.25, -16.1] },
  scissors: { src: scissorsIcon, w: 88, h: 144, inset: [-2.66, -10.69, -9.33, -10.69] },
  hand: { src: rotateIcon, w: 122, h: 140, inset: [-7.23, -11.14, -12.96, -11.55] },
};

// ── per-tool config ──────────────────────────────────────────────────────────
type SubmenuParam = { tag: string; min: number; max: number; step: number };
type Entry = { key: string; tool?: EngineTool; label: string; param?: SubmenuParam };

const ENTRIES: Entry[] = [
  { key: 'paper', label: 'colour' },
  { key: 'pencil', tool: 'freehand', label: 'pencil', param: { tag: 'width', min: 1, max: 8, step: 0.5 } },
  { key: 'eraser', tool: 'erase', label: 'eraser' },
  { key: 'stamp', tool: 'circle', label: 'stamp', param: { tag: 'size', min: 0.03, max: 0.25, step: 0.005 } },
  { key: 'scissors', tool: 'scissors', label: 'scissors', param: { tag: 'fit', min: -0.03, max: 0.03, step: 0.002 } },
  { key: 'hand', tool: 'rotate', label: 'hand' },
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

// Warm ink-tinted shadows (Figma #2E2926); the tool lifts and the shadow grows on hover, settles low
// when selected. Transitioned on the art wrapper so state changes animate.
function shadowFor(state: 'active' | 'hover' | 'selected'): string {
  if (state === 'hover') return 'drop-shadow(0px 12px 13px rgba(46,41,38,0.22))';
  if (state === 'selected') return 'drop-shadow(0px 2px 4px rgba(46,41,38,0.10))';
  return 'drop-shadow(0px 4px 6px rgba(46,41,38,0.13))';
}

function liftFor(state: 'active' | 'hover' | 'selected'): string {
  return state === 'hover' ? 'translateY(-6px)' : 'translateY(0)';
}

const ART_MOTION: CSSProperties = { transition: 'filter 180ms ease, transform 180ms ease', willChange: 'filter, transform' };

function popover(interactive: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: '50%',
    bottom: 134, // sits clear above the tool with breathing room; clipped by the container if it exceeds
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
  fontFamily: FONT,
  fontSize: 14,
  letterSpacing: '5.6px',
  textTransform: 'uppercase',
  color: C.secondaryForeground,
  whiteSpace: 'nowrap',
};
const minMaxText: CSSProperties = {
  fontFamily: FONT,
  fontSize: 10,
  letterSpacing: '4px',
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

// ── tool inner visuals ───────────────────────────────────────────────────────
function PaperCard({ color }: { color: string }) {
  return (
    <div style={{ transform: 'rotate(-3deg)' }}>
      <div style={{ width: 101, height: 143, background: color }} />
    </div>
  );
}

function Eraser() {
  const rect = (s: CSSProperties): CSSProperties => ({ gridArea: '1 / 1', border: `1px solid ${C.ink}`, ...s });
  return (
    <span
      style={{
        display: 'inline-grid',
        gridTemplateColumns: 'max-content',
        gridTemplateRows: 'max-content',
        placeItems: 'start',
        lineHeight: 0,
      }}
    >
      <span style={rect({ width: 65, height: 104, marginTop: 64, marginLeft: 0, background: C.parchment })} />
      <span style={rect({ width: 50, height: 104, marginTop: 64, marginLeft: 15, background: C.parchment, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 })} />
      <span style={rect({ width: 61, height: 64, marginTop: 0, marginLeft: 2, background: C.warmWhite, borderTopLeftRadius: 12, borderTopRightRadius: 12 })} />
      <span
        style={{
          gridArea: '1 / 1',
          width: 24,
          height: 104,
          marginTop: 64,
          marginLeft: 23,
          background: C.linen,
          borderTop: `1px solid ${C.ink}`,
          borderBottom: `1px solid ${C.ink}`,
        }}
      />
    </span>
  );
}

// ── component ────────────────────────────────────────────────────────────────
export function Toolbar(props: ToolbarProps) {
  const { activeTool, canUndo, canRedo, paperProperties, onUndo, onRedo, onTool } = props;
  const [hovered, setHovered] = useState<string | null>(null);

  const paramValue = (e: Entry): number => {
    if (e.tool === 'freehand') return props.pencilWidth;
    if (e.tool === 'circle') return props.stampSize;
    if (e.tool === 'scissors') return props.scissorsMargin;
    return 0;
  };
  const paramOnChange = (e: Entry): ((v: number) => void) => {
    if (e.tool === 'freehand') return props.onPencilWidth;
    if (e.tool === 'circle') return props.onStampSize;
    if (e.tool === 'scissors') return props.onScissorsMargin;
    return () => {};
  };

  const renderInner = (key: string) => {
    switch (key) {
      case 'paper':
        return <PaperCard color={COLOR_PRESET_HEX[paperProperties.colorPreset]} />;
      case 'eraser':
        return <Eraser />;
      default: {
        const art = ART[key];
        return art ? <ToolArt art={art} /> : null;
      }
    }
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
