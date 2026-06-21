/**
 * PreviewBottomBar — the Preview & Share screen's floating action bar (Figma 50:412): Print, Save,
 * Share. Purely presentational: props in, callbacks out, no engine imports. Centred along the bottom
 * edge, mirroring the editor toolbar's floating treatment.
 */

import { Button } from './Button';

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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[6] flex gap-4 sm:gap-8 items-center justify-center">
      <Button type="icon-text" icon="print" label="Print" onClick={onPrint} />
      <Button type="icon-text" icon="save" label="Save" onClick={onSave} />
      <Button type="icon-text" icon="share" label="Share" onClick={onShare} />
    </div>
  );
}
