/**
 * PreviewTopBar — the Preview & Share screen's top action bar (Figma 50:401 / TopBar 54:928).
 * Purely presentational: props in, callbacks out, no engine imports. Mirrors the editor `TopBar`
 * layout (three equal columns), but the left button steps *back* to the editor and the right button
 * starts a new design.
 *
 * Token note: escaped-slash token names need a DOUBLE backslash in JS strings (`'var(--color\\/x)'`).
 */

import type { CSSProperties } from 'react';
import { Button } from './Button';

const C = {
  card: 'var(--color\\/card)',
  border: 'var(--color\\/border)',
  foreground: 'var(--color\\/foreground)',
} as const;

const bar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: 42,
  padding: '1px 16px',
  gap: 10,
  background: C.card,
  borderBottom: `1px solid ${C.border}`,
  flexShrink: 0,
};

const col: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 };

const title: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  fontFamily: "'Shippori Antique B1', serif",
  fontSize: 'var(--sds-typography-subheading-size-small)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: C.foreground,
};

export interface PreviewTopBarProps {
  /** Return to the editor screen (left "← Editor" button). */
  readonly onBack: () => void;
  /** Start a fresh design (right "+ New design" button). */
  readonly onNew: () => void;
}

export function PreviewTopBar({ onBack, onNew }: PreviewTopBarProps) {
  return (
    <div style={bar}>
      {/* Left: back to editor */}
      <div style={col}>
        <Button type="icon-text" icon="arrow_back" label="Editor" onClick={onBack} />
      </div>

      {/* Centre: title */}
      <div style={title}>剪紙 paper cutting studio</div>

      {/* Right: new design */}
      <div style={{ ...col, justifyContent: 'flex-end' }}>
        <Button type="icon-text" icon="add_2" label="New design" onClick={onNew} />
      </div>
    </div>
  );
}
