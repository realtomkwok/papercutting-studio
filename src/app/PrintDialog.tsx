/**
 * PrintDialog — print preview modal (M7).
 *
 * Shows a to-scale preview of the PrintLayout sheet at a reduced zoom so it fits on-screen,
 * lets the user pick a print paper size (A5/A4/Letter), then calls `window.print()` so the
 * browser sends the layout to the printer. `@media print` in index.css hides everything else
 * and renders `.print-layout` full-page during the print job.
 *
 * Static chrome is Tailwind utilities; the to-scale preview geometry (computed pixel sizes,
 * `transform: scale`) stays inline since it's derived from the chosen paper spec at runtime.
 */

import { useState } from 'react';
import { Button } from './Button';
import { PrintLayout, PRINT_SPECS } from './PrintLayout';
import type { FoldConfig } from '../core/foldConfig';
import type { Point } from '../core/geometry';

/** Browsers render CSS `mm` at 96 DPI (1 inch = 25.4 mm → 1 mm = 96/25.4 px). */
const PX_PER_MM = 96 / 25.4;

/** Maximum pixel dimensions for the preview pane. Scale is clamped so the full page fits.
 *  Height is chosen so the total dialog (toolbar ~44px + preview padding 48px + preview + overlay
 *  padding 52px) fits in a ~700px browser viewport without scrolling. */
const MAX_PREVIEW_W = 660;
const MAX_PREVIEW_H = 530;

export interface PrintDialogProps {
  readonly open: boolean;
  readonly fold: FoldConfig;
  /** Composed cut contours (`DesignState.cuts`) for the to-scale wedge template. */
  readonly cuts: readonly (readonly Point[])[];
  readonly previewImageUrl: string | null;
  /** Shareable preview URL — printed as a QR code on the sheet. */
  readonly shareUrl: string | null;
  readonly onClose: () => void;
}

export function PrintDialog({
  open,
  fold,
  cuts,
  previewImageUrl,
  shareUrl,
  onClose,
}: PrintDialogProps) {
  const [sizeKey, setSizeKey] = useState<string>('A4');

  if (!open) return null;

  const spec = PRINT_SPECS[sizeKey]!;
  const paperWidthPx = spec.widthMm * PX_PER_MM;
  const paperHeightPx = spec.heightMm * PX_PER_MM;
  // Scale to fit within both max width and max height.
  const scale = Math.min(MAX_PREVIEW_W / paperWidthPx, MAX_PREVIEW_H / paperHeightPx);

  const sizeBtnClass = (key: string) =>
    'font-serif text-caption tracking-[0.06em] px-2.5 py-[3px] border border-border cursor-pointer ' +
    (key === sizeKey ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground');

  return (
    <>
      {/* Print-only copy, rendered OUTSIDE the scaled preview wrapper. A CSS `transform` on an
        ancestor makes `position: fixed` descendants scale + offset with it, so the in-dialog
        preview (transform: scale) cannot be reused for printing — it would print tiny in the
        corner. This copy has no transformed ancestor, so it fills the page at true mm size. */}
      <div className="print-root" aria-hidden>
        <PrintLayout
          fold={fold}
          printSpec={spec}
          cuts={cuts}
          previewImageUrl={previewImageUrl}
          shareUrl={shareUrl}
        />
      </div>

      <div
        className="print-dialog-overlay fixed inset-0 bg-black/50 flex flex-col items-center justify-start z-[60] overflow-y-auto pt-5 px-4 pb-8"
        onClick={onClose}
      >
        <div
          className="bg-popover border border-border w-full flex flex-col"
          style={{ maxWidth: Math.round(paperWidthPx * scale) + 48 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Toolbar ── */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
            {/* Print paper size */}
            <span className="font-serif text-eyebrow tracking-[0.1em] uppercase text-secondary-foreground flex-shrink-0">
              Print on
            </span>
            {Object.keys(PRINT_SPECS).map((key) => (
              <button
                key={key}
                type="button"
                className={sizeBtnClass(key)}
                onClick={() => setSizeKey(key)}
              >
                {key}
              </button>
            ))}

            <div className="ml-auto flex-shrink-0">
              <Button
                type="icon-text"
                icon="print"
                label="Print"
                onClick={() => {
                  // Inject the correct @page size for the chosen spec, then print and remove.
                  const style = document.createElement('style');
                  style.textContent = `@page { size: ${spec.widthMm}mm ${spec.heightMm}mm; margin: 0; }`;
                  document.head.appendChild(style);
                  window.print();
                  document.head.removeChild(style);
                }}
              />
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="border-none bg-transparent cursor-pointer font-serif text-[16px] text-foreground flex-shrink-0"
            >
              ✕
            </button>
          </div>

          {/* ── Preview area ── */}
          <div className="p-6 flex justify-center items-start" style={{ background: '#d8d4ce' }}>
            {/* Clip the scaled layout to paper size */}
            <div
              className="overflow-hidden shadow-elevation-high flex-shrink-0"
              style={{
                width: Math.round(paperWidthPx * scale),
                height: Math.round(paperHeightPx * scale),
              }}
            >
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  width: paperWidthPx,
                  height: paperHeightPx,
                }}
              >
                <PrintLayout
                  fold={fold}
                  printSpec={spec}
                  cuts={cuts}
                  previewImageUrl={previewImageUrl}
                  shareUrl={shareUrl}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
