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
  /* ── Neutral palette ── */
  --neutral\/warm-white:          #f5f2ef;
  --neutral\/linen:               #eae2dc;
  --neutral\/parchment:           #d4c8c0;
  --neutral\/warm-silver:         #b8aba2;
  --neutral\/stone:               #9a9088;
  --neutral\/driftwood:           #7a706a;
  --neutral\/charcoal-clay:       #524a44;
  --neutral\/ink:                 #2e2926;

  /* ── Paper (accent) palette ── */
  --paper\/coral-red:             #c85c4a;
  --paper\/dusty-rose:            #c07676;
  --paper\/blush-pink:            #d4a5a0;
  --paper\/warm-lavender:         #b8a8c8;
  --paper\/soft-purple:           #9a8ab0;
  --paper\/muted-violet:          #8875ad;
  --paper\/steel-blue:            #8090a4;
  --paper\/powder-blue:           #a4b8c4;
  --paper\/pale-sky:              #b8c8d4;
  --paper\/sage-green:            #8aa880;
  --paper\/olive-green:           #849878;
  --paper\/moss-green:            #789a68;
  --paper\/warm-taupe:            #b8a490;
  --paper\/golden-sand:           #c2a068;
  --paper\/dusty-gold:            #a89050;
  --paper\/warm-ivory:            #d0c0a0;

  /* ── Semantic: surface & background ── */
  --color\/background:            #f5f2ef;
  --color\/card:                  #eae2dc;
  --color\/popover:               #f5f2ef;
  --color\/secondary:             #eae2dc;
  --color\/muted:                 #d4c8c0;
  --color\/input:                 #eae2dc;

  /* ── Semantic: text & foreground ── */
  --color\/foreground:            #2e2926;
  --color\/card-foreground:       #2e2926;
  --color\/popover-foreground:    #2e2926;
  --color\/primary-foreground:    #f5f2ef;
  --color\/secondary-foreground:  #524a44;
  --color\/muted-foreground:      #9a9088;

  /* ── Semantic: primary action & form ── */
  --color\/primary:               #2e2926;
  --color\/ring:                  #2e2926;
  --color\/border:                #9a9088;

  /* ── Semantic: accent ── */
  --color\/accent:                #c85c4a;
  --color\/accent-violet:         #8875ad;
  --color\/accent-blue:           #8090a4;
  --color\/accent-green:          #8aa880;
  --color\/accent-sand:           #c2a068;

  /* ── Semantic: destructive ── */
  --color\/destructive:           #c85c4a;
  --color\/destructive-foreground:#f5f2ef;

  /* ── Shadow ── */
  --color\/shadow\/10:            rgba(46,41,38,0.20);

  /* ── Spacing ── */
  --sds-size-space-1200:          48px;
}
```

**Letter-spacing rule**: Figma stores letter-spacing in ls units; divide by 1000 for CSS `em`
(ls 40 → `0.04em`, ls 20 → `0.02em`, ls 1 → `0.001em`, ls 0 → `0`).
Most UI text (buttons, labels, headings) uses ls 40 = `0.04em`; body copy and footnotes use ls 0.

### Typography Scale

| Token | Size | Letter-spacing | Usage |
|-------|------|---------------|-------|
| `Typography/Headings/Display` | 72px | 0.04em | Hero headlines |
| `Typography/Headings/H1` | 48px | 0.024em | Page heading |
| `Typography/Headings/H2` | 36px | 0.02em | Section heading |
| `Typography/Headings/H3` | 24px | 0.04em | Sub-section heading |
| `Typography/Headings/H4` | 20px | 0.04em | Card title |
| `Typography/Body/Body Large` | 16px | 0.04em | Lead paragraphs, TopBar title |
| `Typography/Body/Body` | 14px | 0 | Default body text |
| `Typography/Button` | 14px | 0.04em | Button labels |
| `Typography/Caption` | 10px | 0.001em | Metadata, timestamps |
| `Typography/Button Small` | 10px | 0.04em | Compact button labels |
| `Typography/Body/Body Small` | 12px | 0 | Secondary body |
| `Typography/Label` | 11px | 0.04em | Form labels, status chips |
| `Typography/Eyebrow` | 9px | 0.04em | Section kickers |
| `Typography/Footnote` | 8px | 0 | Fine print |

All styles: Shippori Antique B1, Regular (400), `line-height: 1` (except `Typography/Body/Body` which uses `line-height: 1.5`), `text-transform: uppercase` where indicated by context.

### Elevation

```css
/* Elevation/1 — Subtle (cards, panel resting state) */
box-shadow:
  0px 1px 3px rgba(46,41,38,0.06),
  0px 2px 1.5px rgba(46,41,38,0.19);

/* Elevation/2 — Raised (dropdowns, tooltips) */
box-shadow:
  0px 4px 13px rgba(46,41,38,0.10),
  0px 4px 4.2px rgba(46,41,38,0.10);

/* Elevation/3 — Floating (modals, popovers) */
box-shadow:
  0px 12px 48px 12px rgba(46,41,38,0.10),
  0px 8px 10px rgba(46,41,38,0.28);
```

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
  'coral-red':     '#c85c4a',
  'dusty-rose':    '#c07676',
  'blush-pink':    '#d4a5a0',
  'warm-lavender': '#b8a8c8',
  'soft-purple':   '#9a8ab0',
  'muted-violet':  '#8875ad',
  'steel-blue':    '#8090a4',
  'powder-blue':   '#a4b8c4',
  'pale-sky':      '#b8c8d4',
  'sage-green':    '#8aa880',
  'olive-green':   '#849878',
  'moss-green':    '#789a68',
  'warm-taupe':    '#b8a490',
  'golden-sand':   '#c2a068',
  'dusty-gold':    '#a89050',
  'warm-ivory':    '#d0c0a0',
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
- Title: Shippori Antique B1, 16px (`Typography/Body Large`), `letter-spacing: 0.04em`, uppercase
- Buttons: Shippori Antique B1, 14px (`Typography/Button`), `letter-spacing: 0.04em`, uppercase

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
        fontSize: 14, letterSpacing: '0.04em',
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
