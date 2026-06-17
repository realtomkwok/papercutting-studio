# Editor Chrome Implementation Spec

> **Figma source**: [node 50:388 "Editor - New Design (Empty Screen)"](https://www.figma.com/design/WFrsqSKE0foMLl1rxMWgqG/design?node-id=50-388)
>
> This document is the implementation plan for the final editor UI chrome, agreed through a planning session. Implement by following each section in order; verify using the checklist at the end.

---

## Context

The current UI is a functional dev harness — a simple horizontal text-button toolbar and a plain header. This spec replaces it with the final visual chrome: a top bar with title + action buttons, a floating visual tool picker at the bottom, and a top-right preview frame. The engine contract in `wireUi.tsx` stays intact.

The Figma file contains three screen-level frames: the **Editor** (this spec), a **Share** screen (separate TODO), and an early draft. Tool-parameter submenus are **not yet designed** in Figma; the architecture keeps hooks for them but nothing renders yet.

---

## Decisions

| Topic | Decision |
|-------|----------|
| TopBar icons | `material-symbols` package (`add_2`, `publish`, `arrow_forward`) |
| Undo/Redo icons | `material-symbols` (`undo`, `redo`) |
| Tool illustrations | Figma PNG assets downloaded to `src/assets/icons/` (pencil, stamp, scissors, rotate) |
| Eraser | CSS-drawn (4 overlapping divs matching Figma structure; no image) |
| Paper Texture card | CSS-drawn tilted card; colour from `paperProperties.colorPreset` |
| Paper Texture click | **TODO — no submenu designed yet**; clicking is a no-op. PaperStockConfigurator accessible via Shift+P temporarily |
| Tool-parameter submenus | **TODO — not designed yet**; old slider state stays wired in `wireUi.tsx` for future use |
| Rotate gesture | Click + drag (pointer deltaX → rotation delta, ~0.5°/px); smooth via `transition: transform 0.1s` on canvas wrapper |
| New design guard | `window.confirm` if `cuts > 0 \|\| outlines > 0` before clearing |
| Share button | Switches to the **Preview & Share** screen (Figma 50:401): the engine enters the 3D unfold view and plays the reveal. Implemented in M6 — see "Preview & Share screen" below. |

---

## Design Tokens

### CSS Custom Properties

Add to `index.html` `<style>` or `src/index.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Shippori+Antique+B1&display=swap');

:root {
  /* Semantic */
  --color\/background:            #f5f2ef;
  --color\/card:                  #eae4dc;
  --color\/border:                #9a9088;
  --color\/foreground:            #2e2926;
  --color\/secondary-foreground:  #524a44;

  /* Paper colours */
  --paper\/coral-red:             #c85c4a;

  /* Neutral palette */
  --neutral\/warm-white:          #f5f2ef;
  --neutral\/linen:               #eae4dc;
  --neutral\/parchment:           #d4ccc0;
  --neutral\/warm-silver:         #b8afa2;
  --neutral\/stone:               #9a9088;
  --neutral\/driftwood:           #7a706a;
  --neutral\/charcoal-clay:       #524a44;
  --neutral\/ink:                 #2e2926;

  /* SDS typography scale */
  --sds-typography-heading-size-base:        24px;
  --sds-typography-subheading-size-small:    16px;
  --sds-typography-body-size-medium:         16px;
  --sds-typography-body-size-small:          14px;

  /* SDS spacing */
  --sds-size-space-1200: 48px;
}
```

**Letter-spacing rule**: 40% of font-size (24px → 9.6px, 16px → 6.4px, 14px → 5.6px).

**Dotted-grid canvas background** (inline on `<main>` in `wireUi.tsx`):
```css
background-color: var(--color\/background);
background-image: radial-gradient(circle, var(--color\/border) 1px, transparent 1px);
background-size: 24px 24px;
```

---

## Dependencies

```
npm install material-symbols
```

Import at top of `src/index.css`: `@import 'material-symbols/outlined';`

Use in JSX: `<span className="material-symbols-outlined">icon_name</span>`

---

## New Types (`src/app/types.ts`)

Full Washi colour palette from Figma (16 colours):

```ts
export type ColorPreset =
  | 'coral-red' | 'dusty-rose' | 'blush-pink' | 'warm-lavender'
  | 'soft-purple' | 'muted-violet' | 'steel-blue' | 'powder-blue'
  | 'pale-sky' | 'sage-green' | 'olive-green' | 'moss-green'
  | 'warm-taupe' | 'golden-sand' | 'dusty-gold' | 'warm-ivory';

export type TexturePreset = 'rice-paper' | 'washi' | 'cardstock';

export interface PaperProperties {
  colorPreset: ColorPreset;
  texturePreset: TexturePreset;
}

export const COLOR_PRESET_HEX: Record<ColorPreset, string> = {
  'coral-red':     '#c95c4a',
  'dusty-rose':    '#c97a7a',
  'blush-pink':    '#d4a0a0',
  'warm-lavender': '#b8a8c8',
  'soft-purple':   '#9a8ab0',
  'muted-violet':  '#8878a0',
  'steel-blue':    '#8898b8',
  'powder-blue':   '#a8bed0',
  'pale-sky':      '#c0d0dc',
  'sage-green':    '#9aaa90',
  'olive-green':   '#8a9878',
  'moss-green':    '#7a8a68',
  'warm-taupe':    '#b8a890',
  'golden-sand':   '#c8b080',
  'dusty-gold':    '#b89a60',
  'warm-ivory':    '#d8c8b0',
};
```

---

## Icon Assets

Download from Figma MCP asset URLs → save as PNGs to `src/assets/icons/`:

| Filename | Figma asset UUID |
|----------|-----------------|
| `tool-pencil.png` | `1108d183-0fdb-4994-bd18-4ed6a23bbe82` |
| `tool-stamp.png` | `34c23ee6-5a0e-4e22-9adb-5171a1905dfb` |
| `tool-scissors.png` | `c163b605-af8f-4f32-be35-c489b178b4e3` |
| `tool-rotate.png` | `196114d6-f1be-4ffa-b124-2499d7acd2ba` |

**Note**: Figma MCP asset URLs expire after 7 days. Re-fetch via `get_design_context(fileKey: WFrsqSKE0foMLl1rxMWgqG, nodeId: 50:399)` if expired.

Undo/redo and TopBar icons: `material-symbols`. Eraser and paper card: CSS-drawn.

---

## Layout Structure

```
App  (100vw × 100vh, no internal header)
└── Studio  (wireUi.tsx, 100%, 100vh, flex column)
    ├── TopBar           — in-flow, ~42px
    └── <main>           — flex 1, position: relative, overflow: hidden
        ├── CanvasHost   — position: absolute, inset: 0
        ├── Toolbar      — position: absolute, bottom: 8px, left: 50%, translateX(-50%)
        └── PreviewPanel — position: absolute, top: 12px, right: 12px
    PaperStockConfigurator (modal, unchanged)
```

**Responsiveness:**
- TopBar centre: `flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis`
- Toolbar: `left: 50%; transform: translateX(-50%)`; tool slots `flex-shrink: 0` at 120px
- PreviewPanel: `width: min(240px, 28vw); aspect-ratio: 1 / 1`

---

## `src/app/TopBar.tsx` (new)

Presentational. Props: `{ onNew: () => void; onImport: () => void; onShare: () => void }`.

**Typography:**
- Title: Shippori Antique B1, 16px (`--sds-typography-subheading-size-small`), letter-spacing 6.4px, uppercase
- Buttons: Shippori Antique B1, 14px (`--sds-typography-body-size-small`), letter-spacing 5.6px, uppercase

**Structure** (three-column flex, each `flex: 1`):
- **Left**: 40×40 icon button (material `add_2`, 20px), then "Import Design" button (material `publish` + label).
- **Centre**: "剪紙 paper cutting studio", centred.
- **Right** (`justify-content: flex-end`): "Share" button (material `arrow_forward` + label).

**Styling**: `background: var(--color\/card)`, `border-bottom: 1px solid var(--color\/border)`, `padding: 1px 16px`, height ~42px. Buttons: same `background` + `border` + `padding: 10px`, flex gap 10px.

---

## `src/app/Toolbar.tsx` (replace entirely)

Keep export name `Toolbar` to avoid `wireUi.tsx` churn.

**Props:**
```ts
interface ToolbarProps {
  activeTool: EngineTool;
  canUndo: boolean;
  canRedo: boolean;
  paperProperties: PaperProperties;
  onUndo: () => void;
  onRedo: () => void;
  onTool: (tool: EngineTool) => void;
  onRotateDrag: (deltaX: number) => void;
}
```

**Outer layout**: `position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); height: 100px; display: flex; align-items: center; gap: var(--sds-size-space-1200); background: var(--color\/card); border: 1px solid var(--color\/border)`.

### Left — Undo/Redo column

Two stacked 40×40 buttons (flex column), negative overlap of 1px (top button `marginBottom: -1px`).
Each: `background: var(--color\/background); border: 1px solid var(--color\/border)`.
Material symbols `undo` / `redo` at 20px. Disabled: `opacity: 0.4; cursor: default; pointerEvents: none`.

### Centre — Tool row

`display: flex; gap: 9px; align-items: center`. Each slot: `width: 120px; height: 120px; flex-shrink: 0; position: relative; overflow: visible`.

| Slot | Inner visual | Dimensions | Behaviour |
|------|-------------|------------|-----------|
| **Paper Texture** | Centred wrapper → `transform: rotate(-3deg)` → coloured div | card: ~101×143px | Click: no-op (TODO submenu). Drop shadows: `0px 10px 4.2px 2px rgba(46,41,38,0.22), 0px 4px 9.6px 4px rgba(46,41,38,0.1)`. Colour: `COLOR_PRESET_HEX[paperProperties.colorPreset]` |
| **Pencil** | `<img>` bottom-aligned | 36×136px img, slot `align-items: flex-end; padding-top: 4px` | Click: `onTool('freehand')` |
| **Eraser** | 4-div CSS grid (see below) | — | Click: `onTool('erase')` |
| **Stamp** | `<img>` | 87.6×127px | Click: `onTool('circle')` |
| **Scissors** | `<img>` | 88×144px | Click: `onTool('scissors')` |
| **Rotate** | `<img>` | 122×140px | Pointer drag → `onRotateDrag(deltaX)` |

**Active tool highlight**: `box-shadow: inset 0 0 0 2px var(--color\/foreground)` on the 120×120 container.

**Eraser CSS structure** (4 elements in a CSS grid, `display: inline-grid; grid-template-columns: max-content; grid-template-rows: max-content; place-items: start`):
```
Row/col 1: 65×104px parchment rect, mt 64px, ml 0
Row/col 1: 50×104px parchment rect, mt 64px, ml 15px, border-radius left 4px
Row/col 1: 61×64px warm-white rect, mt 0, ml 2px, border-radius top 12px
Row/col 1: 24×104px linen rect, mt 64px, ml 23px, border top+bottom only
```
All have `border: 1px solid var(--neutral\/ink)`.

**Rotate drag** (pointer capture pattern):
```ts
const dragging = useRef(false);
const lastX = useRef(0);

onPointerDown: (e) => { dragging.current = true; lastX.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); }
onPointerMove: (e) => { if (!dragging.current) return; onRotateDrag(e.clientX - lastX.current); lastX.current = e.clientX; }
onPointerUp/Cancel: () => { dragging.current = false; }
```

---

## `src/app/PreviewPanel.tsx` (new)

Placeholder until engine exposes a picture-in-picture render target.

```tsx
export function PreviewPanel() {
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12,
      width: 'min(240px, 28vw)', aspectRatio: '1',
      background: 'var(--color\/card)',
      border: '1px solid var(--color\/border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        fontFamily: "'Shippori Antique B1', serif",
        fontSize: 14, letterSpacing: '5.6px',
        textTransform: 'uppercase', color: 'var(--color\/border)',
      }}>Preview</span>
    </div>
  );
}
```

---

## `src/app/App.tsx` (update)

Remove `<header>`. App becomes:
```tsx
export function App() {
  return <div style={{ width: '100vw', height: '100vh' }}><Studio /></div>;
}
```

---

## `src/app/wireUi.tsx` (update)

1. **New imports**: `TopBar`, `PreviewPanel`, `PaperProperties`, `COLOR_PRESET_HEX` from `./types`.
2. **State change**: replace `paperStock: PaperStockProps` → `paperProperties: PaperProperties` (default `{ colorPreset: 'coral-red', texturePreset: 'rice-paper' }`). When applying, map `colorPreset` to a hex colour for the engine's `colorFront` prop.
3. **Rotation**:
   ```ts
   const handleRotateDrag = (deltaX: number) => {
     setRotation(r => {
       const next = ((r + deltaX * 0.5) % 360 + 360) % 360;
       engine.setViewRotation(next);
       return next;
     });
   };
   ```
4. **New design guard**:
   ```ts
   const handleNew = () => {
     if ((cuts > 0 || outlines > 0) && !window.confirm('Clear the current design?')) return;
     engine.clearPaths();
   };
   ```
5. **Shift+P shortcut** (temporary, for PaperStockConfigurator):
   ```ts
   useEffect(() => {
     const h = (e: KeyboardEvent) => { if (e.shiftKey && e.key === 'P') setPaperConfigOpen(true); };
     window.addEventListener('keydown', h);
     return () => window.removeEventListener('keydown', h);
   }, []);
   ```
6. **Render**:
   ```tsx
   <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
     <TopBar
       onNew={handleNew}
       onImport={() => engine.loadTemplate('lotus-cross')}
       onShare={() => { /* TODO: Share screen */ }}
     />
     <main style={{
       flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0,
       backgroundImage: 'radial-gradient(circle, var(--color\/border) 1px, transparent 1px)',
       backgroundSize: '24px 24px',
       backgroundColor: 'var(--color\/background)',
     }}>
       <CanvasHost engine={engine} />
       <Toolbar
         activeTool={tool}
         canUndo={history.canUndo}
         canRedo={history.canRedo}
         paperProperties={paperProperties}
         onUndo={() => engine.undo()}
         onRedo={() => engine.redo()}
         onTool={chooseTool}
         onRotateDrag={handleRotateDrag}
       />
       <PreviewPanel />
     </main>
     <PaperStockConfigurator
       open={paperConfigOpen}
       initial={/* map paperProperties → PaperStockProps */}
       onApply={(props) => {
         engine.setPaperStock(props);
         // update paperProperties.colorPreset based on props.colorFront if available
       }}
       onClose={() => setPaperConfigOpen(false)}
     />
   </div>
   ```

**Retained (hidden) state**: `stampSize`, `pencilWidth`, `eraserWidth`, `scissorsMargin`, `mode`, `unfoldProgress` — keep wired to engine for future popover sliders.

---

## Preview & Share screen

> **Figma source**: [node 50:401 "Preview & Share"](https://www.figma.com/design/WFrsqSKE0foMLl1rxMWgqG/design?node-id=50-401)

A second screen sharing the **same mounted engine** as the editor. `wireUi.tsx` holds a
`screen: 'editor' | 'preview'` flag; switching screens only toggles the engine mode and swaps the
surrounding chrome — `CanvasHost` (which owns the engine's canvases, including the Three.js view)
stays mounted, so there is no remount/dispose.

| Element | Component | Notes |
|---------|-----------|-------|
| Top bar | `PreviewTopBar` | Left "← Editor" returns to the editor; right "+ New design" clears + returns. Same three-column layout as `TopBar`. |
| 3D view | (engine) | Entering calls `engine.setMode('unfold3d')` + `engine.playUnfold()`; leaving calls `setMode('draw')`. OrbitControls drive the rotate/zoom/pan. |
| Instructions card | `InstructionsCard` | Floating top-left hint card (Figma 109:717): drag-to-rotate / scroll-to-zoom / right-drag-to-pan. |
| Bottom bar | `PreviewBottomBar` | Floating Print / Save / Share (Figma 50:412). |
| Share popup | `SharePopup` | Modal with the shareable link + copy-to-clipboard. |

**Action wiring (M6 — minimal stubs; refinements tracked in `TODO.md`):**

- **Print** → `window.print()` (M7 will replace with a to-scale print-preview dialog).
- **Save** → downloads the current `paperStock` as JSON (to be extended to the full design).
- **Share** → opens `SharePopup` with `?stock=<base64 JSON>`; `wireUi` reads that param back on load
  to restore the paper stock (to be extended to the full design).

---

## Verification Checklist

- [ ] `npm run dev` — no JS errors
- [ ] Shippori Antique B1 font loads in TopBar and buttons
- [ ] "New" with no strokes: clears immediately; with strokes: confirm dialog first
- [ ] "Import Design" loads `lotus-cross` template
- [ ] Each tool slot highlights with inset border when active
- [ ] Dragging Rotate slot rotates paper; direction matches drag direction
- [ ] Paper Texture card shows correct colour; click is silent no-op
- [ ] Shift+P opens PaperStockConfigurator; colour change updates the card
- [ ] Undo/Redo enable/disable matches engine history
- [ ] Preview panel frame appears top-right, scales on narrow viewport
- [ ] Dotted-grid background visible behind the paper canvas
- [ ] Full pencil → scissors → cut workflow works end-to-end
