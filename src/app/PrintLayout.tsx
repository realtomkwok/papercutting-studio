/**
 * PrintLayout — the printable paper-cutting instruction sheet (M7).
 *
 * Two zones on one page:
 *   1. A square at the top (width = print paper width) holding the *to-scale cutting template*:
 *      the folded wedge outline (open edge solid, folded edges dashed creases) with the cut-out
 *      borders drawn as light dotted guide lines. You fold a sheet of the print-paper width the same
 *      way, lay this on top, and cut along the dotted lines through the folded stack.
 *   2. A tear-off instruction strip at the bottom with the fold-sequence thumbnails and a small
 *      expected-result preview for reference.
 *
 * Sizes are in `mm` so print output is physically accurate — the wedge template prints at the size of
 * the wedge you get by folding a sheet of `printSpec.widthMm`. `transform: scale()` in the dialog
 * wrapper makes the on-screen preview fit.
 */

import type { CSSProperties } from 'react';
import type { FoldConfig } from '../core/foldConfig';
import { boundaryPointAtAngle, type Point } from '../core/geometry';

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

// ── To-scale folded-wedge cut template ──────────────────────────────────────────────────────────

/** The wedge outline (unit space): apex at the origin + the two outer-edge corners. Mirrors
 *  WedgeEditor.wedgeVertices / EditorEngine.wedgeVerts. */
function wedgeVertices(fold: FoldConfig): Point[] {
  return [
    { x: 0, y: 0 },
    boundaryPointAtAngle(fold.wedgeStart, 0.5),
    boundaryPointAtAngle(fold.wedgeEnd, 0.5),
  ];
}

interface WedgeTemplateProps {
  readonly fold: FoldConfig;
  /** Composed cut contours in unit-square coords (`DesignState.cuts`) — the full unfolded pattern.
   *  Clipped to the wedge here, so only the fundamental-domain cut borders show. */
  readonly cuts: readonly (readonly Point[])[];
  /** Side of the (square) zone in mm. The full unfolded sheet is `sideMm` wide, so 1 unit = `sideMm`
   *  mm and the folded wedge prints to-scale at half that. */
  readonly sideMm: number;
}

/**
 * The to-scale cut template: an SVG (coordinates in mm) of the folded wedge with cut borders as light
 * dotted guide lines. The wedge is centred in the square zone; cut contours are clipped to the wedge
 * triangle so they terminate cleanly at the fold edges (exactly where you stop cutting).
 */
function WedgeTemplate({ fold, cuts, sideMm }: WedgeTemplateProps) {
  const W = sideMm;
  // unit (origin-centred, y-up) → mm (zone, y-down), wedge bbox centre (0.25, 0.25) → zone centre.
  const X = (u: Point) => W / 2 + (u.x - 0.25) * W;
  const Y = (u: Point) => W / 2 - (u.y - 0.25) * W;
  const path = (pts: readonly Point[], close: boolean) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p).toFixed(2)},${Y(p).toFixed(2)}`).join(' ') +
    (close ? ' Z' : '');

  const [apex, c1, c2] = wedgeVertices(fold);
  const wedgePath = path([apex!, c1!, c2!], true);
  const hasCuts = cuts.some((c) => c.length >= 3);

  // Light dotted cut-guide stroke; round caps render the dashes as soft dots.
  const cutStroke: Record<string, string | number> = {
    fill: 'none',
    stroke: '#9a9a9a',
    strokeWidth: 0.6,
    strokeDasharray: '0.01 1.7',
    strokeLinecap: 'round',
  };

  return (
    <svg
      width={`${W}mm`}
      height={`${W}mm`}
      viewBox={`0 0 ${W} ${W}`}
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <defs>
        <clipPath id="wedge-clip">
          <path d={wedgePath} />
        </clipPath>
      </defs>

      {/* Cut borders — clipped to the wedge so they read as the lines you cut along. */}
      {hasCuts && (
        <g clipPath="url(#wedge-clip)">
          {cuts.map((c, i) =>
            c.length >= 3 ? <path key={i} d={path(c, true)} {...cutStroke} /> : null,
          )}
        </g>
      )}

      {/* Folded edges (apex → each corner): dashed = crease/fold notation. */}
      <path d={path([apex!, c1!], false)} fill="none" stroke="#999" strokeWidth={0.5} strokeDasharray="2 1.5" />
      <path d={path([apex!, c2!], false)} fill="none" stroke="#999" strokeWidth={0.5} strokeDasharray="2 1.5" />
      {/* Open edge (outer paper boundary): solid. */}
      <path d={path([c1!, c2!], false)} fill="none" stroke="#666" strokeWidth={0.6} />

      {!hasCuts && (
        <text
          x={W / 2}
          y={W / 2}
          textAnchor="middle"
          style={{ fontSize: W * 0.022, fill: '#ccc', fontFamily: FONT, letterSpacing: '0.1em' }}
        >
          NO CUTS YET
        </text>
      )}
    </svg>
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
  /** Composed cut contours (`DesignState.cuts`, unit-square coords) for the to-scale cut template. */
  readonly cuts: readonly (readonly Point[])[];
  /** Colour preview of the unfolded result — used as a small reference thumbnail in the strip. */
  readonly previewImageUrl: string | null;
}

export function PrintLayout({
  fold,
  printSpec,
  cuts,
  previewImageUrl,
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
      {/* ── Zone 1: To-scale folded-wedge cut template ── */}
      <div
        style={{
          width: `${squareMm}mm`,
          height: `${squareMm}mm`,
          flexShrink: 0,
          position: 'relative',
          background: 'white',
          overflow: 'hidden',
        }}
      >
        <WedgeTemplate fold={fold} cuts={cuts} sideMm={squareMm} />
        {/* Heading + scissors hint, top-left. */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 8,
            fontFamily: FONT,
            fontSize: 9,
            color: '#999',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            lineHeight: 1.5,
          }}
        >
          Cut template (to scale)
          <div style={{ fontSize: 7.5, color: '#bbb', textTransform: 'none', letterSpacing: '0.04em' }}>
            ✂ cut the folded stack along the dotted lines
          </div>
        </div>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4mm' }}>
          <FoldSteps fold={fold} thumbPx={thumbPx} />
          {/* Small expected-result reference — the unfolded design after cutting. */}
          {previewImageUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1mm', flexShrink: 0 }}>
              <img
                src={previewImageUrl}
                alt="Unfolded result"
                style={{
                  width: `${stripMm * 0.5}mm`,
                  height: `${stripMm * 0.5}mm`,
                  objectFit: 'contain',
                  border: '0.5px solid #e5e0da',
                  background: '#f9f6f2',
                }}
              />
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 6.5,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#bbb',
                }}
              >
                Result
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
