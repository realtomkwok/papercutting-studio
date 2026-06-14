import { Studio } from './wireUi';

export function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          padding: '10px 12px',
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 600,
          borderBottom: '1px solid #e6e1d8',
        }}
      >
        Paper-Cutting Studio
      </header>
      <Studio />
    </div>
  );
}
