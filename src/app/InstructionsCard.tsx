/**
 * InstructionsCard — the floating top-left hint card on the Preview & Share screen (Figma 109:717).
 * Purely presentational. Tells the viewer how to manipulate the 3D paper (driven by OrbitControls in
 * the engine's unfold view). The Figma mock repeats "Spin to rotate"; here the three lines describe
 * the actual orbit/zoom/pan gestures.
 *
 * Token note: escaped-slash token names need a DOUBLE backslash in JS strings (`'var(--color\\/x)'`).
 */

import type { CSSProperties } from 'react';

const FONT = "'Shippori Antique B1', serif";

const card: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  zIndex: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'center',
  padding: 8,
  background: 'var(--color\\/popover)',
  border: '1px solid var(--color\\/border)',
  boxShadow: '0 2px 0.5px rgba(0,0,0,0.12)',
};

const heading: CSSProperties = {
  fontFamily: FONT,
  fontSize: 11,
  letterSpacing: '4.4px',
  textTransform: 'uppercase',
  color: 'var(--color\\/popover-foreground)',
  whiteSpace: 'nowrap',
};

const row: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center' };

const lineText: CSSProperties = {
  fontFamily: FONT,
  fontSize: 10,
  letterSpacing: '0.1px',
  color: 'var(--color\\/popover-foreground)',
  whiteSpace: 'nowrap',
};

const glyph: CSSProperties = { fontSize: 20, lineHeight: 1, color: 'var(--color\\/popover-foreground)' };

const HINTS: { icon: string; text: string }[] = [
  { icon: 'rotate_right', text: 'Drag to rotate' },
  { icon: 'zoom_in', text: 'Scroll to zoom' },
  { icon: 'pan_tool', text: 'Right-drag to pan' },
];

export function InstructionsCard() {
  return (
    <div style={card}>
      <span style={heading}>Instructions</span>
      {HINTS.map((h) => (
        <div key={h.text} style={row}>
          <span className="material-symbols-outlined" style={glyph}>
            {h.icon}
          </span>
          <span style={lineText}>{h.text}</span>
        </div>
      ))}
    </div>
  );
}
