/**
 * Modal — one headless dialog wrapper shared by every overlay in the app (SharePopup,
 * PaperStockConfigurator, PrintDialog). Purely presentational: props in, callbacks out, no engine
 * coupling. It renders overlay + panel and owns the accessibility behaviour each consumer would
 * otherwise have to re-implement:
 *
 *   • `role="dialog"`, `aria-modal`, `aria-labelledby` (via `labelledBy`)
 *   • Esc-to-close and click-outside-to-close
 *   • focus-trap (Tab/Shift+Tab cycle within the panel)
 *   • scroll-lock (`document.body` overflow hidden while open)
 *   • focus restore to the previously-focused element on close
 *
 * The overlay/panel chrome stays styleable per-consumer via `overlayClassName`/`panelClassName`;
 * `align` switches the overlay between centered (default) and top-aligned/scrollable (`'start'`,
 * used by PrintDialog).
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** id of the heading element inside `children` (wired to `aria-labelledby`). */
  readonly labelledBy?: string;
  /** Vertical placement of the panel within the overlay. */
  readonly align?: 'center' | 'start';
  readonly overlayClassName?: string;
  readonly panelClassName?: string;
  readonly children: ReactNode;
}

/** Selector for tabbable elements used by the focus-trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal(props: ModalProps) {
  const { open, onClose, labelledBy, align = 'center', overlayClassName, panelClassName, children } =
    props;
  const panelRef = useRef<HTMLDivElement>(null);
  // Element focused before the modal opened, so we can restore focus on close.
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;

    // Scroll-lock the page body while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel (first focusable, else the panel itself).
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      // Focus-trap: cycle Tab/Shift+Tab within the panel.
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === firstItem || !panel.contains(active)) {
          e.preventDefault();
          lastItem.focus();
        }
      } else if (active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cx(
        'fixed inset-0 z-50 flex',
        align === 'start' ? 'items-start justify-center' : 'items-center justify-center',
        overlayClassName,
      )}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cx('outline-none', panelClassName)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
