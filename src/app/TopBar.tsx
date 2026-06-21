/**
 * TopBar — the editor's top action bar (editor-chrome-spec.md §TopBar). Purely presentational:
 * props in, callbacks out, no engine imports. Three equal columns — New/Import on the left, the
 * studio title centred, Share on the right. Buttons are the shared `Button` component (Figma 34:40),
 * so they pick up the Default/Hover (dark-fill, inverted) styling automatically.
 */

import { Button } from './Button';

const COL = 'flex-1 min-w-0 flex items-center gap-2.5';

export interface TopBarProps {
  readonly onNew: () => void;
  readonly onImport: () => void;
  readonly onShare: () => void;
}

export function TopBar({ onNew, onImport, onShare }: TopBarProps) {
  return (
    <div className="flex items-center h-[42px] px-4 gap-2.5 bg-card border-b border-border flex-shrink-0">
      {/* Left: new + import */}
      <div className={COL}>
        <Button
          type="icon"
          icon="add_2"
          title="New design"
          ariaLabel="New design"
          onClick={onNew}
          style={{ borderBottom: 'none' }}
        />
        <Button
          type="icon-text"
          icon="publish"
          label="Import Design"
          onClick={onImport}
          style={{ borderBottom: 'none' }}
        />
      </div>

      {/* Centre: title */}
      <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center font-serif text-body-large tracking-body-large uppercase text-foreground">
        剪紙 paper cutting studio
      </div>

      {/* Right: share */}
      <div className={`${COL} justify-end`}>
        <Button
          type="icon-text"
          icon="arrow_forward"
          iconRight
          label="Share"
          onClick={onShare}
          style={{ borderBottom: 'none' }}
        />
      </div>
    </div>
  );
}
