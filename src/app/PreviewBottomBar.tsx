/**
 * PreviewBottomBar — the Preview & Share screen's floating action bar (Figma 50:412): Print, Save,
 * Share. Purely presentational: props in, callbacks out, no engine imports. Centred along the bottom
 * edge, mirroring the editor toolbar's floating treatment.
 */

import type { CSSProperties } from 'react';
import { Button } from './Button';

const bar: CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 6,
  display: 'flex',
  gap: 32,
  alignItems: 'center',
  justifyContent: 'center',
};

export interface PreviewBottomBarProps {
  /** Print the to-scale fold template (M7 — currently a basic `window.print`). */
  readonly onPrint: () => void;
  /** Save the design's JSON config. */
  readonly onSave: () => void;
  /** Open the share popup (link with the design parameters in the URL). */
  readonly onShare: () => void;
}

export function PreviewBottomBar({ onPrint, onSave, onShare }: PreviewBottomBarProps) {
  return (
    <div style={bar}>
      <Button type="icon-text" icon="print" label="Print" onClick={onPrint} />
      <Button type="icon-text" icon="save" label="Save" onClick={onSave} />
      <Button type="icon-text" icon="share" label="Share" onClick={onShare} />
    </div>
  );
}
