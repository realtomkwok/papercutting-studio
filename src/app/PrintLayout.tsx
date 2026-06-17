/**
 * PrintLayout — the printable paper-cutting instruction sheet (M7).
 *
 * Two zones on one page:
 *   1. A square at the top (width = print paper width) showing the unfolded design at scale.
 *      This is the result the user is making — useful as a reference while cutting.
 *   2. A tear-off instruction strip at the bottom with fold-sequence thumbnails and
 *      a scaled wedge cut template.
 *
 * Sizes are in `mm` so print output is physically accurate. `transform: scale()`
 * in the dialog wrapper makes the preview fit on-screen.
 */

import type { CSSProperties } from 'react';
import type { FoldConfig } from '../core/foldConfig';

const FONT = "'Shippori Antique B1', serif";

// ── Fold-step thumbnails ──────────────────────────────────────────────────────────────────────────

interface FoldStepSvgProps {
  step: 1 | 2 | 3;
  /** SVG is always a square of this size — paper shape is drawn at correct proportion inside. */
  sizePx: number;
}

function FoldStepSvg({ step, sizePx }: FoldStepSvgProps) {
  const S = sizePx;
  const m = S * 0.1; // margin inside the square
  const full = S - m * 2; // max paper dimension

  const fold = { stroke: '#aaa', strokeWidth: 1, strokeDasharray: '4 3', strokeLinecap: 'round' as const };
  const arrowFill = '#999';

  // Step 1: full square paper with horizontal fold line
  if (step === 1) {
    const py = m;
    return (
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ display: 'block' }}>
        <rect x={m} y={py} width={full} height={full} fill="#f0ece8" />
        <line x1={m} y1={py + full / 2} x2={m + full} y2={py + full / 2} {...fold} />
        <text x={m + full / 2} y={py + full * 0.77} textAnchor="middle"
          style={{ fontSize: S * 0.28, fill: arrowFill, fontFamily: 'sans-serif' }}>↑</text>
      </svg>
    );
  }

  // Step 2: landscape (2:1) paper centered in the square, vertical fold line
  if (step === 2) {
    const pw = full; const ph = full / 2;
    const px = m; const py = (S - ph) / 2;
    return (
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ display: 'block' }}>
        <rect x={px} y={py} width={pw} height={ph} fill="#f0ece8" />
        <line x1={px + pw / 2} y1={py} x2={px + pw / 2} y2={py + ph} {...fold} />
        <text x={px + pw * 0.25} y={py + ph / 2 + S * 0.1} textAnchor="middle"
          style={{ fontSize: S * 0.28, fill: arrowFill, fontFamily: 'sans-serif' }}>→</text>
      </svg>
    );
  }

  // Step 3: small square (quarter) centered, diagonal fold line
  const pw = full / 2; const ph = full / 2;
  const px = (S - pw) / 2; const py = (S - ph) / 2;
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ display: 'block' }}>
      <rect x={px} y={py} width={pw} height={ph} fill="#f0ece8" />
      <line x1={px} y1={py + ph} x2={px + pw} y2={py} {...fold} />
      <text x={px + pw * 0.3} y={py + ph * 0.52} textAnchor="middle"
        style={{ fontSize: S * 0.24, fill: arrowFill, fontFamily: 'sans-serif' }}>↗</text>
    </svg>
  );
}

const STEP_LABELS = [
  'Fold in half\nhorizontally',
  'Fold in half\nvertically',
  'Fold diagonally\nto the wedge',
] as const;

function FoldSteps({ fold, thumbPx }: { fold: FoldConfig; thumbPx: number }) {
  if (fold.id !== 'symmetrical-triangle') return null;

  const numStyle: CSSProperties = {
    fontFamily: FONT,
    fontSize: thumbPx * 0.17,
    color: '#bbb',
    letterSpacing: '1px',
    lineHeight: 1,
  };
  const labelStyle: CSSProperties = {
    fontFamily: FONT,
    fontSize: thumbPx * 0.15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 1.3,
    marginTop: thumbPx * 0.07,
    whiteSpace: 'pre-line',
  };
  const sepStyle: CSSProperties = {
    fontSize: thumbPx * 0.3,
    color: '#d0ccc8',
    alignSelf: 'center',
    lineHeight: 1,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: thumbPx * 0.2 }}>
      {([1, 2, 3] as const).map((step, i) => (
        <>
          {i > 0 && (
            <span key={`sep-${step}`} style={sepStyle}>›</span>
          )}
          <div
            key={step}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: thumbPx * 0.06,
            }}
          >
            <span style={numStyle}>0{step}</span>
            <FoldStepSvg step={step} sizePx={thumbPx} />
            <span style={labelStyle}>{STEP_LABELS[step - 1]}</span>
          </div>
        </>
      ))}
    </div>
  );
}

// ── PrintLayout ───────────────────────────────────────────────────────────────────────────────────

export interface PrintSpec {
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

export const PRINT_SPECS: Record<string, PrintSpec> = {
  A5: { label: 'A5', widthMm: 148, heightMm: 210 },
  A4: { label: 'A4', widthMm: 210, heightMm: 297 },
  Letter: { label: 'Letter', widthMm: 216, heightMm: 279 },
};

export interface PrintLayoutProps {
  readonly fold: FoldConfig;
  readonly printSpec: PrintSpec;
  readonly previewImageUrl: string | null;
  readonly paperColor?: string;
}

export function PrintLayout({
  fold,
  printSpec,
  previewImageUrl,
  paperColor = '#c8102e',
}: PrintLayoutProps) {
  const { widthMm, heightMm } = printSpec;
  const squareMm = widthMm; // top zone: full page width × full page width = square
  const stripMm = heightMm - squareMm; // remaining height for instruction strip

  // Thumb size chosen so step column (num + gap + svg + gap + 2-line label) fills ~88% of strip.
  const thumbPx = Math.round(Math.max(32, Math.min(60, stripMm * 0.46)) * (96 / 25.4));

  return (
    <div
      className="print-layout"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
      {/* ── Zone 1: Unfolded design at scale ── */}
      <div
        style={{
          width: `${squareMm}mm`,
          height: `${squareMm}mm`,
          flexShrink: 0,
          position: 'relative',
          background: '#f9f6f2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {previewImageUrl ? (
          <img
            src={previewImageUrl}
            alt="Unfolded pattern"
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
          />
        ) : (
          <span
            style={{
              fontFamily: FONT,
              fontSize: 12,
              color: '#ccc',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            No cuts yet
          </span>
        )}
        {/* Subtle corner label */}
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            right: 8,
            fontFamily: FONT,
            fontSize: 8,
            color: '#bbb',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {fold.id.replace(/-/g, ' ')}
        </div>
      </div>

      {/* ── Tear-here separator ── */}
      <div
        style={{
          width: '100%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '2mm 4mm',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ flex: 1, borderTop: '1.5px dashed #ccc' }} />
        <span
          style={{
            fontFamily: FONT,
            fontSize: 7,
            color: '#bbb',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            userSelect: 'none',
          }}
        >
          ✂ tear here
        </span>
        <div style={{ flex: 1, borderTop: '1.5px dashed #ccc' }} />
      </div>

      {/* ── Zone 2: Fold-sequence instruction strip ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 5mm 2mm',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 7,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#aaa',
            marginBottom: '1.5mm',
          }}
        >
          How to fold
        </div>
        <FoldSteps fold={fold} thumbPx={thumbPx} />
      </div>
    </div>
  );
}
