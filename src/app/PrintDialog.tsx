/**
 * PrintDialog — print preview modal (M7).
 *
 * Shows a to-scale preview of the PrintLayout sheet at a reduced zoom so it fits on-screen,
 * lets the user pick a print paper size (A5/A4/Letter), then calls `window.print()` so the
 * browser sends the layout to the printer. `@media print` in index.css hides everything else
 * and renders `.print-layout` full-page during the print job.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from './Button';
import { PrintLayout, PRINT_SPECS } from './PrintLayout';
import type { FoldConfig } from '../core/foldConfig';
import type { Point } from '../core/geometry';

const FONT = "'Shippori Antique B1', serif";

/** Browsers render CSS `mm` at 96 DPI (1 inch = 25.4 mm → 1 mm = 96/25.4 px). */
const PX_PER_MM = 96 / 25.4;

/** Maximum pixel dimensions for the preview pane. Scale is clamped so the full page fits.
 *  Height is chosen so the total dialog (toolbar ~44px + preview padding 48px + preview + overlay
 *  padding 52px) fits in a ~700px browser viewport without scrolling. */
const MAX_PREVIEW_W = 660;
const MAX_PREVIEW_H = 530;

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  zIndex: 60,
  overflowY: 'auto',
  padding: '20px 16px 32px',
};

const panel: CSSProperties = {
  background: 'var(--color\\/popover)',
  border: '1px solid var(--color\\/border)',
  width: '100%',
  maxWidth: MAX_PREVIEW_W + 48,
  display: 'flex',
  flexDirection: 'column',
};

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px',
  borderBottom: '1px solid var(--color\\/border)',
  flexShrink: 0,
};

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

  const sizeBtn = (key: string): CSSProperties => ({
    fontFamily: FONT,
    fontSize: 10,
    letterSpacing: '0.06em',
    padding: '3px 10px',
    border: '1px solid var(--color\\/border)',
    background: key === sizeKey ? 'var(--color\\/primary)' : 'var(--color\\/background)',
    color: key === sizeKey ? 'var(--color\\/primary-foreground)' : 'var(--color\\/foreground)',
    cursor: 'pointer',
  });

  const labelStyle: CSSProperties = {
    fontFamily: FONT,
    fontSize: 9,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color\\/secondary-foreground)',
    flexShrink: 0,
  };

  return (
    <>
    {/* Print-only copy, rendered OUTSIDE the scaled preview wrapper. A CSS `transform` on an
        ancestor makes `position: fixed` descendants scale + offset with it, so the in-dialog
        preview (transform: scale) cannot be reused for printing — it would print tiny in the
        corner. This copy has no transformed ancestor, so it fills the page at true mm size. */}
    <div className="print-root" aria-hidden>
      <PrintLayout fold={fold} printSpec={spec} cuts={cuts} previewImageUrl={previewImageUrl} shareUrl={shareUrl} />
    </div>

    <div className="print-dialog-overlay" style={overlay} onClick={onClose}>
      <div style={{ ...panel, maxWidth: Math.round(paperWidthPx * scale) + 48 }} onClick={(e) => e.stopPropagation()}>
        {/* ── Toolbar ── */}
        <div style={toolbar}>
          {/* Print paper size */}
          <span style={labelStyle}>Print on</span>
          {Object.keys(PRINT_SPECS).map((key) => (
            <button key={key} type="button" style={sizeBtn(key)} onClick={() => setSizeKey(key)}>
              {key}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
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
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: FONT,
              fontSize: 16,
              color: 'var(--color\\/foreground)',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Preview area ── */}
        <div
          style={{
            background: '#d8d4ce',
            padding: 24,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}
        >
          {/* Clip the scaled layout to paper size */}
          <div
            style={{
              width: Math.round(paperWidthPx * scale),
              height: Math.round(paperHeightPx * scale),
              overflow: 'hidden',
              boxShadow: 'var(--shadow-elevation-high)',
              flexShrink: 0,
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
