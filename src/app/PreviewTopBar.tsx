/**
 * PreviewTopBar — the Preview & Share screen's top action bar (Figma 50:401 / TopBar 54:928).
 * Purely presentational: props in, callbacks out, no engine imports. Mirrors the editor `TopBar`
 * layout (three equal columns), but the left button steps *back* to the editor and the right button
 * starts a new design.
 */

import { Button } from './Button';

const COL = 'flex-1 min-w-0 flex items-center gap-2.5';

export interface PreviewTopBarProps {
  /** Return to the editor screen (left "← Editor" button). */
  readonly onBack: () => void;
  /** Start a fresh design (right "+ New design" button). */
  readonly onNew: () => void;
}

export function PreviewTopBar({ onBack, onNew }: PreviewTopBarProps) {
  return (
    <div className="flex items-center h-[42px] py-px px-4 gap-2.5 bg-card border-b border-border flex-shrink-0">
      {/* Left: back to editor */}
      <div className={COL}>
        <Button type="icon-text" icon="arrow_back" label="Editor" onClick={onBack} />
      </div>

      {/* Centre: title */}
      <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center font-serif text-body-large tracking-body-large uppercase text-foreground">
        剪紙 paper cutting studio
      </div>

      {/* Right: new design */}
      <div className={`${COL} justify-end`}>
        <Button type="icon-text" icon="add_2" label="New design" onClick={onNew} />
      </div>
    </div>
  );
}
