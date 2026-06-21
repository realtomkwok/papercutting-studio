/**
 * SharePopup — the Preview & Share screen's share dialog (Figma 109:775 annotation: "share popup for
 * sharing the link to this preview, with the parameters in the URL"). Purely presentational: it
 * receives a ready-made shareable URL (encoding the design) and offers copy / open. `wireUi.tsx`
 * builds the URL from engine/UI state, and reads those same params back on load.
 */

import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

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

  const ready = url.length > 0;

  const copy = async () => {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(url);
      setMsg('Link copied to clipboard');
    } catch {
      setMsg('Clipboard unavailable — copy from the box above');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="share-popup-title"
      overlayClassName="bg-black/35"
      panelClassName="bg-popover border border-border p-5 w-[460px] max-w-[92vw] flex flex-col gap-3.5 shadow-elevation-high"
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center">
          <h2
            id="share-popup-title"
            className="m-0 font-serif text-button tracking-button uppercase text-foreground"
          >
            Share
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto border-none bg-transparent cursor-pointer font-serif text-[16px] text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="font-serif text-label tracking-[0.5px] text-secondary-foreground leading-normal">
          Anyone with this link opens the preview with your paper and pattern restored from the URL.
        </p>
        <input
          className="w-full box-border px-3 py-2.5 bg-background border border-border text-foreground text-body-small font-mono"
          readOnly
          value={ready ? url : 'Generating link…'}
          onFocus={(e) => ready && e.currentTarget.select()}
        />
        <div className="flex gap-3 justify-end items-center">
          <span className="font-serif text-caption tracking-[1px] uppercase text-secondary-foreground min-h-[12px]">
            {msg}
          </span>
          <div className="flex-1" />
          <Button type="icon-text" icon="link" label="Copy link" onClick={copy} />
        </div>
      </div>
    </Modal>
  );
}
