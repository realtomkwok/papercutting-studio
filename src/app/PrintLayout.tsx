/**
 * PrintLayout — the printable paper-cutting instruction sheet (M7).
 *
 * Page layout:
 *   1. A square zone (paper-width × paper-width) showing the full-paper fold template at scale:
 *      all three fold lines (horizontal, vertical, 45° diagonal) extend across the zone, with
 *      the wedge cut template drawn in the upper-right quadrant (its true position on the folded
 *      paper). Cut areas are shown with pink hatching and dotted borders.
 *   2. A "✂ tear here" perforation separator.
 *   3. A three-column instruction strip: folding steps | design preview | QR code.
 */

import type { CSSProperties } from 'react';
import type { FoldConfig } from '../core/foldConfig';
import { boundaryPointAtAngle, type Point } from '../core/geometry';
import { encodeQr } from '../core/qr';

const FONT = "'Shippori Antique B1', serif";

// ── QR code ───────────────────────────────────────────────────────────────────

/** Render `url` as a crisp, scalable QR code SVG (dark modules as a single path). */
function QrSvg({ url }: { url: string }) {
  let modules: boolean[][];
  try {
    modules = encodeQr(url);
  } catch {
    return null; // URL too long to encode — fall back to the text placeholder.
  }
  const n = modules.length;
  const quiet = 2; // quiet-zone margin (modules) required for reliable scanning
  const dim = n + quiet * 2;

  // One path of all dark modules keeps the SVG tiny and avoids hairline gaps between rects.
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules[y]![x]) d += `M${x + quiet},${y + quiet}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <rect width={dim} height={dim} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

// ── Fold-step thumbnails ──────────────────────────────────────────────────────

/**
 * One fold-step diagram. Drawn in a fixed 100×100 viewBox and stretched to fill its (square)
 * container via width/height 100%, so the strokes stay crisp vectors at any print size.
 */
function FoldStepSvg({ step }: { step: 1 | 2 | 3 | 4 }) {
  const m = 12; // margin inside the 100-unit box
  const full = 100 - m * 2;
  const paperFill = '#f0ece8';
  const foldStyle = {
    stroke: '#bbb',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    fill: 'none',
    strokeDasharray: '4 2 1 2',
  };
  const arrow = { fontSize: 30, fill: '#bbb', fontFamily: 'sans-serif' };
  const svgProps = {
    viewBox: '0 0 100 100',
    preserveAspectRatio: 'xMidYMid meet',
    style: { display: 'block', width: '100%', height: '100%' },
  } as const;

  if (step === 1) {
    // Full square, horizontal fold at mid-height, fold-up arrow
    return (
      <svg {...svgProps}>
        <rect x={m} y={m} width={full} height={full} fill={paperFill} />
        <line x1={m} y1={50} x2={m + full} y2={50} {...foldStyle} />
        <text x={50} y={50 + full * 0.32} textAnchor="middle" style={arrow}>↑</text>
      </svg>
    );
  }

  if (step === 2) {
    // Landscape half-sheet, vertical fold at mid-width, fold-right arrow
    const ph = full / 2;
    const py = (100 - ph) / 2;
    return (
      <svg {...svgProps}>
        <rect x={m} y={py} width={full} height={ph} fill={paperFill} />
        <line x1={50} y1={py} x2={50} y2={py + ph} {...foldStyle} />
        <text x={m + full * 0.24} y={56} textAnchor="middle" style={arrow}>→</text>
      </svg>
    );
  }

  if (step === 3) {
    // Quarter-sheet square, 45° diagonal fold, arrow upper-right
    const s = full / 2;
    const p = (100 - s) / 2;
    return (
      <svg {...svgProps}>
        <rect x={p} y={p} width={s} height={s} fill={paperFill} />
        <line x1={p} y1={p + s} x2={p + s} y2={p} {...foldStyle} />
        <text x={p + s * 0.34} y={p + s * 0.6} textAnchor="middle" style={{ ...arrow, fontSize: 22 }}>↗</text>
      </svg>
    );
  }

  // Step 4: the folded wedge (right-triangle) with dotted cut lines + scissors
  const x0 = 30; const y0 = 18; const sz = 56; // bottom-left right-angle, vertical right edge
  const triPoints = `${x0},${y0 + sz} ${x0 + sz},${y0 + sz} ${x0 + sz},${y0}`;
  return (
    <svg {...svgProps}>
      <polygon points={triPoints} fill={paperFill} />
      {[0.25, 0.45, 0.65].map((t, i) => (
        <line key={i}
          x1={x0 + sz * (0.12 + t * 0.55)} y1={y0 + sz * (0.9 - t * 0.45)}
          x2={x0 + sz * (0.28 + t * 0.55)} y2={y0 + sz * (0.72 - t * 0.45)}
          stroke="#d4a5a0" strokeWidth={1.4} strokeLinecap="round"
        />
      ))}
      <text x={x0 + sz * 0.62} y={y0 + sz * 0.92} textAnchor="middle" style={{ ...arrow, fontSize: 18 }}>✂</text>
    </svg>
  );
}

/** Numbered, captionless fold-step thumbnails (4 equal squares, bottom-aligned). */
function FoldSteps({ fold }: { fold: FoldConfig }) {
  if (fold.id !== 'symmetrical-triangle') return null;

  const badge: CSSProperties = {
    fontFamily: FONT,
    fontSize: '0.65em',
    color: '#2e2926',
    letterSpacing: '0.12em',
    lineHeight: 1,
    border: '0.4px solid #2e2926',
    padding: '1.5px 4px',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2.5mm', width: '100%' }}>
      {([1, 2, 3, 4] as const).map((step) => (
        <div
          key={step}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2mm' }}
        >
          <span style={badge}>{step}</span>
          <div style={{ width: '100%', aspectRatio: '1' }}>
            <FoldStepSvg step={step} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── To-scale full-paper fold template ────────────────────────────────────────

/** The wedge outline (unit space): apex at origin, corners at boundary angles. */
function wedgeVertices(fold: FoldConfig): Point[] {
  return [
    { x: 0, y: 0 },
    boundaryPointAtAngle(fold.wedgeStart, 0.5),
    boundaryPointAtAngle(fold.wedgeEnd, 0.5),
  ];
}

interface WedgeTemplateProps {
  readonly fold: FoldConfig;
  /** Cut contours in unit-square coords — shown with hatching and dotted borders in the wedge. */
  readonly cuts: readonly (readonly Point[])[];
  /** Side of the square zone in mm — also the physical paper width, so the template is to-scale. */
  readonly sideMm: number;
}

/**
 * Full-paper fold template SVG (coordinates in mm).
 *
 * The zone represents the actual sheet of paper. The paper centre is at (W/2, W/2) in the zone.
 * Fold lines extend across the full zone; the cut template occupies the upper-right quadrant —
 * the true position of the wedge on the physical folded paper.
 *
 * Coordinate transform: unit (origin-centred, y-up) → mm (zone, y-down)
 *   x_mm = W/2 + u.x * W
 *   y_mm = W/2 − u.y * W
 * This maps the unit square [−0.5, 0.5]² onto the full zone [0, W]².
 */
function WedgeTemplate({ fold, cuts, sideMm }: WedgeTemplateProps) {
  const W = sideMm;
  const X = (u: Point) => W / 2 + u.x * W;
  const Y = (u: Point) => W / 2 - u.y * W;
  const pathD = (pts: readonly Point[], close: boolean) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p).toFixed(2)},${Y(p).toFixed(2)}`).join(' ') +
    (close ? ' Z' : '');

  const [apex, c1, c2] = wedgeVertices(fold);
  const wedgePath = pathD([apex!, c1!, c2!], true);
  const hasCuts = cuts.some((c) => c.length >= 3);

  // Fold lines (dash-dot) through paper centre (W/2, W/2):
  //   angle 0°  → horizontal: y = W/2
  //   angle 90° → vertical:   x = W/2
  //   angle 45° → diagonal:   from (0,W) to (W,0) in screen (bottom-left to top-right corner)
  const foldLine: Record<string, string | number> = {
    stroke: '#aaa',
    strokeWidth: 0.4,
    strokeDasharray: '3 1.5 0.5 1.5',
    strokeLinecap: 'round',
    fill: 'none',
  };
  const cutBorder: Record<string, string | number> = {
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
        {/* Pink diagonal hatching for cut areas */}
        <pattern id="cut-hatch" width="2.5" height="2.5"
          patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="2.5" stroke="#d4a5a0" strokeWidth="0.7" opacity="0.55" />
        </pattern>
      </defs>

      {/* ── Fold lines across the full zone ── */}
      <line x1={0} y1={W / 2} x2={W} y2={W / 2} {...foldLine} />
      <line x1={W / 2} y1={0} x2={W / 2} y2={W} {...foldLine} />
      <line x1={0} y1={W} x2={W} y2={0} {...foldLine} />

      {/* ── Cut areas (hatching fill, then dotted border) clipped to wedge ── */}
      {hasCuts && (
        <>
          <g clipPath="url(#wedge-clip)">
            {cuts.map((c, i) =>
              c.length >= 3
                ? <path key={`hatch-${i}`} d={pathD(c, true)} fill="url(#cut-hatch)" stroke="none" />
                : null,
            )}
          </g>
          <g clipPath="url(#wedge-clip)">
            {cuts.map((c, i) =>
              c.length >= 3
                ? <path key={`border-${i}`} d={pathD(c, true)} {...cutBorder} />
                : null,
            )}
          </g>
        </>
      )}

      {/* ── Wedge outline ── */}
      {/* Folded edges (dashed crease notation): apex → c1, apex → c2 */}
      <path d={pathD([apex!, c1!], false)} fill="none" stroke="#999" strokeWidth={0.5} strokeDasharray="2 1.5" />
      <path d={pathD([apex!, c2!], false)} fill="none" stroke="#999" strokeWidth={0.5} strokeDasharray="2 1.5" />
      {/* Open edge (solid — the part of the paper you don't fold): c1 → c2 */}
      <path d={pathD([c1!, c2!], false)} fill="none" stroke="#555" strokeWidth={0.7} />

      {!hasCuts && (
        <text x={W * 0.75} y={W * 0.22} textAnchor="middle"
          style={{ fontSize: W * 0.02, fill: '#ccc', fontFamily: FONT, letterSpacing: '0.1em' }}>
          NO CUTS YET
        </text>
      )}
    </svg>
  );
}

// ── PrintLayout ───────────────────────────────────────────────────────────────

export interface PrintSpec {
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

export const PRINT_SPECS: Record<string, PrintSpec> = {
  A4: { label: 'A4', widthMm: 210, heightMm: 297 },
  Letter: { label: 'Letter', widthMm: 216, heightMm: 279 },
};

export interface PrintLayoutProps {
  readonly fold: FoldConfig;
  readonly printSpec: PrintSpec;
  /** Composed cut contours (`DesignState.cuts`, unit-square coords) for the to-scale cut template. */
  readonly cuts: readonly (readonly Point[])[];
  /** Colour preview of the unfolded result — used as the design preview in the strip. */
  readonly previewImageUrl: string | null;
  /** Shareable preview URL — encoded as a QR code in the "See it online" column. */
  readonly shareUrl: string | null;
}

/** Column eyebrow heading shared by all three strip columns. */
const columnHeading: CSSProperties = {
  fontFamily: FONT,
  fontSize: 8,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#2e2926',
  textAlign: 'center',
  lineHeight: 1.3,
};

export function PrintLayout({ fold, printSpec, cuts, previewImageUrl, shareUrl }: PrintLayoutProps) {
  const { widthMm, heightMm } = printSpec;
  const squareMm = widthMm;

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
      {/* ── Zone 1: To-scale full-paper fold template ── */}
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
        {/* Heading + cut hint, top-left */}
        <div
          style={{
            position: 'absolute',
            top: 5,
            left: 7,
            fontFamily: FONT,
            fontSize: 8,
            color: '#999',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            lineHeight: 1.5,
          }}
        >
          Cut template (to scale)
          <div style={{ fontSize: 6.5, color: '#bbb', textTransform: 'none', letterSpacing: '0.04em' }}>
            ✂ cut the folded stack along the dotted lines
          </div>
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
        <div style={{ flex: 1, borderTop: '1px dashed #ccc' }} />
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
          ✂ tear here ✂
        </span>
        <div style={{ flex: 1, borderTop: '1px dashed #ccc' }} />
      </div>

      {/* ── Zone 2: instruction strip (3fr · 1fr · 1fr), columns bottom-aligned ── */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '3fr 1fr 1fr',
          columnGap: '5mm',
          padding: '0 5mm 5mm',
          boxSizing: 'border-box',
          overflow: 'hidden',
          alignItems: 'end',
        }}
      >
        {/* Left column: folding instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3mm', paddingRight: '4mm' }}>
          <div style={columnHeading}>Instructions</div>
          <FoldSteps fold={fold} />
        </div>

        {/* Centre column: final design */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5mm' }}>
          <div style={columnHeading}>Final design</div>
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt="Unfolded result"
              style={{
                width: '100%',
                aspectRatio: '1',
                objectFit: 'contain',
                border: '0.5px solid #9a9088',
                background: '#f9f6f2',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '1',
                border: '0.5px solid #9a9088',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 7,
                  color: '#666',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                }}
              >
                Design here
              </span>
            </div>
          )}
        </div>

        {/* Right column: QR / see it online */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5mm' }}>
          <div style={columnHeading}>See it online</div>
          <div
            style={{
              width: '100%',
              aspectRatio: '1',
              border: shareUrl ? 'none' : '0.5px solid #9a9088',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: shareUrl ? 0 : '2mm',
              boxSizing: 'border-box',
            }}
          >
            {shareUrl ? (
              <QrSvg url={shareUrl} />
            ) : (
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 6.5,
                  color: '#666',
                  textAlign: 'center',
                  lineHeight: 1.4,
                }}
              >
                QR code to preview URL
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
