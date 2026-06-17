/**
 * PreviewPanel — top-right preview frame (editor-chrome-spec.md §PreviewPanel). A placeholder until
 * the engine exposes a picture-in-picture render target; scales down on narrow viewports.
 */

import type { CSSProperties } from 'react';

const panel: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 'min(240px, 28vw)',
  aspectRatio: '1 / 1',
  background: 'var(--color\\/card)',
  border: '1px solid var(--color\\/border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const label: CSSProperties = {
  fontFamily: "'Shippori Antique B1', serif",
  fontSize: 14,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color\\/border)',
};

export function PreviewPanel() {
  return (
    <div style={panel}>
      <span style={label}>Preview</span>
    </div>
  );
}
