/**
 * SharePopup — the Preview & Share screen's share dialog (Figma 109:775 annotation: "share popup for
 * sharing the link to this preview, with the parameters in the URL"). Purely presentational: it
 * receives a ready-made shareable URL (encoding the design) and offers copy / open. `wireUi.tsx`
 * builds the URL from engine/UI state, and reads those same params back on load.
 *
 * Token note: escaped-slash token names need a DOUBLE backslash in JS strings (`'var(--color\\/x)'`).
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from './Button';

const FONT = "'Shippori Antique B1', serif";

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};

const panel: CSSProperties = {
  background: 'var(--color\\/popover)',
  border: '1px solid var(--color\\/border)',
  padding: 20,
  width: 460,
  maxWidth: '92vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
};

const heading: CSSProperties = {
  margin: 0,
  fontFamily: FONT,
  fontSize: 14,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color\\/foreground)',
};

const hint: CSSProperties = {
  fontFamily: FONT,
  fontSize: 11,
  letterSpacing: '0.5px',
  color: 'var(--color\\/secondary-foreground)',
  lineHeight: 1.5,
};

const urlBox: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  background: 'var(--color\\/background)',
  border: '1px solid var(--color\\/border)',
  color: 'var(--color\\/foreground)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
};

const status: CSSProperties = {
  fontFamily: FONT,
  fontSize: 10,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: 'var(--color\\/secondary-foreground)',
  minHeight: 12,
};

export interface SharePopupProps {
  readonly open: boolean;
  /** The shareable link (already encodes the design parameters). */
  readonly url: string;
  readonly onClose: () => void;
}

export function SharePopup({ open, url, onClose }: SharePopupProps) {
  const [msg, setMsg] = useState('');

  // Reset the status line each time the popup opens.
  useEffect(() => {
    if (open) setMsg('');
  }, [open]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMsg('Link copied to clipboard');
    } catch {
      setMsg('Clipboard unavailable — copy from the box above');
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={heading}>Share</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: FONT,
              fontSize: 16,
              color: 'var(--color\\/foreground)',
            }}
          >
            ✕
          </button>
        </div>
        <p style={hint}>
          Anyone with this link opens the preview with your paper and pattern restored from the URL.
        </p>
        <input
          style={urlBox}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={status}>{msg}</span>
          <div style={{ flex: 1 }} />
          <Button type="icon-text" icon="link" label="Copy link" onClick={copy} />
        </div>
      </div>
    </div>
  );
}
