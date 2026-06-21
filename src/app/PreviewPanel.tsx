/**
 * PreviewPanel — the top-right live-preview frame (editor-chrome-spec §PreviewPanel; Figma 99:689).
 *
 * The preview *pixels* are drawn by the engine's own `pc-preview-canvas` (positioned identically at
 * top-3/right-3). This component is the presentational frame layered exactly over it: it owns the
 * expand/collapse interaction. Per the Figma component the box has two sizes — Expanded (240²) and
 * Collapsed (120²) — and on hover reveals a centred tooltip button (COLLAPSE / EXPAND) over a faint
 * scrim. Toggling resizes this frame and, via `onToggle`, the engine resizes its canvas to match.
 */

import { cx } from './cx';

export interface PreviewPanelProps {
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

export function PreviewPanel({ expanded, onToggle }: PreviewPanelProps) {
  return (
    <div
      className={cx(
        'group absolute top-3 right-3 z-10 transition-[width,height] duration-200 ease-out',
        expanded ? 'w-60 h-60' : 'w-[120px] h-[120px]',
      )}
    >
      {/* Hover scrim + toggle. The live preview shows through from the engine canvas beneath; this
          button only darkens + reveals the COLLAPSE/EXPAND tag on hover (and toggles on click). */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={expanded ? 'Collapse preview' : 'Expand preview'}
        className="absolute inset-0 flex items-center justify-center border-none cursor-pointer bg-black/20 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150"
      >
        <span className="flex items-center gap-1 px-1 py-0.5 bg-card border border-border">
          <span className="material-symbols-outlined text-[20px] leading-none text-secondary-foreground">
            {expanded ? 'collapse_content' : 'expand_content'}
          </span>
          <span className="font-serif text-label tracking-label uppercase text-secondary-foreground whitespace-nowrap">
            {expanded ? 'Collapse' : 'Expand'}
          </span>
        </span>
      </button>
    </div>
  );
}
