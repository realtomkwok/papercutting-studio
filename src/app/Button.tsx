/**
 * Button + Tooltip — the shared control components from Figma (Button 34:40, Tooltip from 42:146).
 *
 * Button variants:
 *   • type:  'icon' (square, just a glyph) | 'icon-text' (glyph + label) | 'option' (square swatch)
 *   • size:  'm' (40px / h40) | 's' (24px)
 *   • state: Default → light bg + border + dark content
 *            Hover   → dark `--color/primary` fill + inverted (light) content, no visible border
 *            Disabled→ muted bg + muted content, no interaction
 * Hover is tracked internally (pointer enter/leave) so the glyph/label colour can invert — inline
 * styles can't express `:hover`.
 *
 * Token note: escaped-slash token names need a DOUBLE backslash in JS strings (`'var(--color\\/x)'`).
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';

const C = {
  background: 'var(--color\\/background)',
  border: 'var(--color\\/border)',
  foreground: 'var(--color\\/foreground)',
  primary: 'var(--color\\/primary)',
  primaryForeground: 'var(--color\\/primary-foreground)',
  muted: 'var(--color\\/muted)',
  mutedForeground: 'var(--color\\/muted-foreground)',
  popover: 'var(--color\\/popover)',
  popoverForeground: 'var(--color\\/popover-foreground)',
} as const;

const FONT = "'Shippori Antique B1', serif";

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

function colours(state: 'default' | 'hover' | 'disabled') {
  if (state === 'hover') return { bg: C.primary, border: C.primary, content: C.primaryForeground };
  if (state === 'disabled') return { bg: C.muted, border: C.border, content: C.mutedForeground };
  return { bg: C.background, border: C.border, content: C.foreground };
}

export function Button(props: ButtonProps) {
  const { type = 'icon', size = 'm', icon, iconRight = false, label, swatch, disabled = false, title, ariaLabel, ariaPressed, onClick, style } =
    props;
  const [hover, setHover] = useState(false);
  const state = disabled ? 'disabled' : hover ? 'hover' : 'default';
  const c = colours(state);

  const isM = size === 'm';
  const base: CSSProperties = {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.content,
    cursor: disabled ? 'default' : 'pointer',
    pointerEvents: disabled ? 'none' : 'auto',
    fontFamily: FONT,
  };

  let box: CSSProperties;
  if (type === 'icon') {
    box = { ...base, width: isM ? 40 : 24, height: isM ? 40 : 24, padding: isM ? 10 : 2 };
  } else if (type === 'option') {
    box = { ...base, width: isM ? 40 : 24, height: isM ? 40 : 24, padding: 2 };
  } else {
    // icon-text
    box = {
      ...base,
      height: isM ? 40 : 24,
      gap: isM ? 10 : 4,
      padding: isM ? 10 : '10px 10px 10px 4px',
      whiteSpace: 'nowrap',
    };
  }

  const iconStyle: CSSProperties = { fontSize: 20, lineHeight: 1, color: c.content };
  const labelStyle: CSSProperties = {
    fontSize: 14,
    letterSpacing: '5.6px',
    textTransform: 'uppercase',
    lineHeight: 1,
    color: c.content,
  };

  return (
    <button
      type="button"
      style={{ ...box, ...style }}
      title={title}
      aria-label={ariaLabel ?? label}
      aria-pressed={ariaPressed}
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {type === 'option' ? (
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            background: swatch ?? 'transparent',
            border: `1px solid ${C.border}`,
          }}
        />
      ) : (
        <>
          {icon && !iconRight && (
            <span className="material-symbols-outlined" style={iconStyle}>
              {icon}
            </span>
          )}
          {type === 'icon-text' && label && <span style={labelStyle}>{label}</span>}
          {icon && iconRight && (
            <span className="material-symbols-outlined" style={iconStyle}>
              {icon}
            </span>
          )}
        </>
      )}
    </button>
  );
}

/** Tooltip — the hover name-tag that floats above a tool (Figma 42:146 Hover state). */
export function Tooltip({ label }: { label: string }) {
  return (
    <div
      style={{
        minWidth: 120,
        height: 44,
        padding: 8,
        background: C.popover,
        border: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: FONT,
          fontSize: 10,
          letterSpacing: '4px',
          textTransform: 'uppercase',
          color: C.popoverForeground,
          textAlign: 'center',
        }}
      >
        {label}
      </span>
    </div>
  );
}
