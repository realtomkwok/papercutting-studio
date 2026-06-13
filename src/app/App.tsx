import { useMemo } from 'react';
import { CanvasHost } from './CanvasHost';
import { PaperCuttingEngine } from '../engine/EditorEngine';

export function App() {
  const engine = useMemo(() => new PaperCuttingEngine(), []);
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: 12, fontFamily: 'system-ui', borderBottom: '1px solid #eee' }}>
        Paper-Cutting Studio — M0 scaffold
      </header>
      <main style={{ flex: 1, position: 'relative' }}>
        <CanvasHost engine={engine} />
      </main>
    </div>
  );
}
