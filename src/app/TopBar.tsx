/**
 * TopBar — the editor's top action bar (editor-chrome-spec.md §TopBar). Purely presentational:
 * props in, callbacks out, no engine imports. Three equal columns — New/Import on the left, the
 * studio title centred, Share on the right. Buttons are the shared `Button` component (Figma 34:40),
 * so they pick up the Default/Hover (dark-fill, inverted) styling automatically.
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
  letterSpacing: '6.4px',
  textTransform: 'uppercase',
  color: C.foreground,
};

export interface TopBarProps {
  readonly onNew: () => void;
  readonly onImport: () => void;
  readonly onShare: () => void;
}

export function TopBar({ onNew, onImport, onShare }: TopBarProps) {
  return (
    <div style={bar}>
      {/* Left: new + import */}
      <div style={col}>
        <Button type="icon" icon="add_2" title="New design" ariaLabel="New design" onClick={onNew} />
        <Button type="icon-text" icon="publish" label="Import Design" onClick={onImport} />
      </div>

      {/* Centre: title */}
      <div style={title}>剪紙 paper cutting studio</div>

      {/* Right: share */}
      <div style={{ ...col, justifyContent: 'flex-end' }}>
        <Button type="icon-text" icon="arrow_forward" iconRight label="Share" onClick={onShare} />
      </div>
    </div>
  );
}
