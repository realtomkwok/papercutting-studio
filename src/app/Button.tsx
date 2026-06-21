/**
 * Button + Tooltip — the shared control components from Figma (Button 34:40, Tooltip from 42:146).
 *
 * Button variants:
 *   • type:  'icon' (square, just a glyph) | 'icon-text' (glyph + label) | 'option' (square swatch)
 *   • size:  'm' (40px / h40) | 's' (24px)
 *   • state: Default → light bg + border + dark content
 *            Hover   → dark `primary` fill + inverted (light) content, no visible border
 *            Disabled→ muted bg + muted content, no interaction
 *
 * State is expressed with Tailwind `hover:` / `disabled:` variants (no JS hover tracking) wired to
 * the design tokens via the generated utilities (`bg-background`, `text-primary-foreground`, …).
 */

import type { CSSProperties } from 'react';

/** Join truthy class fragments. */
function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export type ButtonType = 'icon' | 'icon-text' | 'option';
export type ButtonSize = 'm' | 's';

export interface ButtonProps {
  readonly type?: ButtonType;
  readonly size?: ButtonSize;
  /** Material-symbols glyph name (for `icon` / `icon-text`). */
  readonly icon?: string;
  /** Render the glyph after the label (e.g. "SHARE →") instead of before it. */
  readonly iconRight?: boolean;
  readonly label?: string;
  /** Swatch fill for `option` (a colour hex, or any CSS background). */
  readonly swatch?: string;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly ariaLabel?: string;
  readonly ariaPressed?: boolean;
  readonly onClick?: () => void;
  /** Extra style merged onto the button box (e.g. a negative margin to overlap neighbours). */
  readonly style?: CSSProperties;
}

// Colour + interaction state, identical across every variant (content colour cascades to glyph/label).
const STATE =
  'border bg-background text-foreground border-border ' +
  'hover:bg-primary hover:text-primary-foreground hover:border-primary ' +
  'disabled:bg-muted disabled:text-muted-foreground disabled:cursor-default disabled:pointer-events-none';
const COMMON = 'box-border flex items-center justify-center cursor-pointer font-serif';

function boxClasses(type: ButtonType, size: ButtonSize) {
  const isM = size === 'm';
  if (type === 'icon') return isM ? 'w-10 h-10 p-2.5' : 'w-6 h-6 p-0.5';
  if (type === 'option') return isM ? 'w-10 h-10 p-0.5' : 'w-6 h-6 p-0.5';
  // icon-text
  return isM
    ? 'h-10 gap-2.5 p-2.5 whitespace-nowrap'
    : 'h-6 gap-1 pt-2.5 pr-2.5 pb-2.5 pl-1 whitespace-nowrap';
}

export function Button(props: ButtonProps) {
  const {
    type = 'icon',
    size = 'm',
    icon,
    iconRight = false,
    label,
    swatch,
    disabled = false,
    title,
    ariaLabel,
    ariaPressed,
    onClick,
    style,
  } = props;

  const iconGlyph = (
    <span className="material-symbols-outlined text-[20px] leading-none">{icon}</span>
  );

  return (
    <button
      type="button"
      className={cx(COMMON, STATE, boxClasses(type, size))}
      style={style}
      title={title}
      aria-label={ariaLabel ?? label}
      aria-pressed={ariaPressed}
      disabled={disabled}
      onClick={onClick}
    >
      {type === 'option' ? (
        <span
          className="w-5 h-5 rounded border border-border"
          style={{ background: swatch ?? 'transparent' }}
        />
      ) : (
        <>
          {icon && !iconRight && iconGlyph}
          {type === 'icon-text' && label && (
            <span className="text-button tracking-button uppercase leading-none">{label}</span>
          )}
          {icon && iconRight && iconGlyph}
        </>
      )}
    </button>
  );
}

/** Tooltip — the hover name-tag that floats above a tool (Figma 42:146 Hover state). */
export function Tooltip({ label }: { label: string }) {
  return (
    <div className="min-w-[120px] h-11 p-2 bg-popover border border-border flex items-center justify-center">
      <span className="font-serif text-button-small tracking-button-small uppercase text-popover-foreground text-center">
        {label}
      </span>
    </div>
  );
}
