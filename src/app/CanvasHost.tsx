import { useEffect, useRef } from 'react';
import type { EditorEngine } from '../engine/api';

/**
 * Thin React wrapper around an `EditorEngine` (worked-example §3.1). Renders a single `<div>`;
 * the engine creates and positions its own canvases inside it on mount. React never reconciles
 * canvas children — it can't, they're imperatively owned by paper.js / three.js.
 */
export function CanvasHost({ engine }: { engine: EditorEngine }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    engine.mount(el);
    return () => engine.dispose();
  }, [engine]);

  return (
    <div
      ref={ref}
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 480 }}
    />
  );
}
