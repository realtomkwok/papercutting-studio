# Worked Example — Design 18 (类型C, symmetrical triangle, D₄)

Companion to `papercut-3d-dev-spec.md`. This documents the full pipeline for the book's Design 18: a 12 cm × 12 cm square folded by the **symmetrical-triangle method** (half → quarter → diagonal, 8 layers) into a 1/8 wedge, cut with a tulip motif, and unfolded into a four-flower cross. It also specifies two additions to the main spec: **crease rendering** and the **engine/UI separation contract** (for a Figma Make–generated interface).

> **Correction note (supersedes an earlier draft):** an earlier version of this doc described Design 18 as a "fold-twice" D₂ fold (4 copies, 90° wedge). That was wrong. The unfolded result has four identical tulips at 90° spacing — i.e. 4-fold *rotational* symmetry plus mirrors = the dihedral group **D₄, 8 copies**. A 90° rotation in the symmetry group can only come from the symmetrical-triangle fold (half → quarter → diagonal), whose creases at 0° and 45° generate it. A genuine fold-twice-on-diagonals (D₂) would yield only two tulips, not four. The fold config, copy count, and rig below are corrected accordingly.

---

## 1. Fold configuration: symmetrical triangle (D₄)

Fold sequence: square → fold in half (horizontal, 2 layers) → fold in half again (vertical, 4 layers) → fold along the diagonal of the resulting quarter-square (8 layers). Result: a 45-45-90 triangle = **1/8 of the paper**, right-angle apex at the paper centre, 45° wedge.

```ts
// foldConfig: design18
{
  id: 'symmetrical-triangle',
  copies: 8,                       // dihedral group D₄ (order 8)
  wedgeAngle: 45,                  // degrees
  // ordered list drives BOTH 2D copy generation and the 3D hinge rig:
  foldLines: [
    { angle: 0,   moves: 'below' },  // 1st fold: half (horizontal axis)
    { angle: 90,  moves: 'left'  },  // 2nd fold: quarter (vertical axis)
    { angle: 45,  moves: 'upper' },  // 3rd fold: diagonal
  ],
  wedge: 'theta in [0°, 45°]'     // apex at origin
}
```

Unfold construction (direct, per main spec §2.2b): 8 copies = the wedge rotated by 0°, 90°, 180°, 270° plus each of those mirrored. The eight wedges tile the square in 45° increments — which is why Design 18's four tulips (each spanning a mirror-pair of wedges) point to the four edge midpoints, with the rosette filling the centre.

**Crease direction parity (needed for §5):** each unfold mirrors the earlier creases through the fold being opened, so crease character alternates across the pattern. Track it per-fold-line, per-segment: `{ line, t0, t1, type: 'mountain' | 'valley' }`, generated automatically by following reflection parity during unfold. The visible result is an 8-spoke crease star (the three-fold axes reflected out to 0/45/90/135°), with alternating mountain/valley segments.

---

## 2. Pipeline, stage by stage

```
[Editor canvas: Paper.js]                 [Hidden bake canvases]              [3D canvas: Three.js]

(1) DRAW on wedge  ──path data──▶  (2) UNFOLD (8 copies)  ──▶  (3) ALPHA MAP bake (white paper / black cuts)
                                                          └──▶  (4) CREASE MAP bake (fold-line ridges)
(5) PAPER TEXTURE bake (paper-shaders, once) ─────────────────────────────┐
                                                                          ▼
                                              (6) MESH: 8 panels, UV = unit square
                                                   map = (5), alphaMap = (3), bump/normal = (4)+(5)
                                              (7) FOLD RIG: 3 nested hinges, unfold animation
                                              (8) RESULT: orbit view, residual creases visible
                                              (8) RESULT: orbit view, residual creases visible
```

### Stage 1 — Draw (Paper.js wedge editor)
- Wedge presented as the book shows it: a 45-45-90 triangle, apex at the paper centre. The two short sides are **fold edges** (one the half/quarter axis, one the diagonal), visually marked "folded — cuts here will mirror"; the outer side (on the square's boundary) is marked "open edge".
- Design 18's motif: one full tulip centred on the wedge bisector + half-motifs touching each fold edge + scroll details. The half-motifs are the interesting test: they must merge across seams into whole shapes on unfold.
- Output: plain path data in unit-square coordinates (no Paper.js objects past this point).

### Stage 2 — Unfold
- Snap edge-touching points onto fold lines (ε rule, main spec §2.3).
- Apply the 8 transforms (4 rotations × 2 mirror states); union overlapping shapes along seams.
- Emit: (a) unfolded cut paths, (b) crease segment list with mountain/valley parity (§1).

### Stage 3 — Alpha map bake
- Render unfolded result to hidden canvas: white square, cuts filled black, 2048².
- `THREE.CanvasTexture`, `needsUpdate` on each edit; consumed as `alphaMap` with `alphaTest: 0.5`.

### Stage 4 — Crease map bake (new)
Creases are what make the unfolded paper read as *having been folded*. Three layers, cheapest first:

1. **Bump ridge (bake):** draw each crease segment into a canvas as a thin soft gradient line (~6–10 px at 2048²): mountain = bright ridge, valley = dark groove, using a 1D profile like `cos` falloff across the line. Composite over the paper-texture luminance bump → single `bumpMap`.
2. **Residual fold angle (geometry):** at unfold completion, hinge rotations ease to ~2° instead of 0°, so each panel sits very slightly off-plane — the silhouette shows a faint pyramid, exactly like real unfolded paper. Make it decay over a few seconds ("paper relaxing") for a lovely finishing touch.
3. **Crease tint (colour):** multiply a faint darkening (3–5%) along crease lines into the colour map — fibres compress and darken at real folds.

Skip normal-map generation in v1; bump is sufficient at this scale. If upgrading later, derive a normal map from the combined bump canvas (Sobel filter).

### Stage 5 — Paper texture bake (paper-shaders)
Per main spec §5.2: render the paper texture once offscreen (red stock for this design: `colorBack ≈ #c8102e`, fibre on, **its `folds` prop = 0** — our creases come from Stage 4, geometrically aligned, not random noise), snapshot to a 2D canvas, use as `map`.

*Delivered (M5):* via the core `@paper-design/shaders` `ShaderMount` directly (not the React `<PaperTexture>`), so the engine stays UI-free. The snapshot waits for a non-transparent frame before reading (black-frame guard). The same baked colour map is also reused in the 2D view — the editor wedge (clipped raster) and the side preview — so the 2D editor shows the chosen stock, not just the 3D mesh. Stock is tuned in `app/PaperStockConfigurator.tsx` (live preview + full controls + JSON export/import) and applied through `setPaperStock`.

### Stage 6 — Mesh
- Eight triangular panels (one per wedge copy), built from `THREE.Shape`, UVs mapping each panel to its 45° slice of the unit square. The single full-square `map`/`alphaMap`/`bumpMap` then texture all panels with no per-panel work.
- Material: `MeshStandardMaterial`, `side: DoubleSide`, `alphaTest: 0.5`, `roughness ≈ 0.95`.

### Stage 7 — Fold rig (3 nested hinges)
```
scene
└─ hingeF1 (axis: horizontal, the 1st/half fold)        // outermost
   ├─ static half: [4 panels]                            // stays put
   └─ hingeF2 (axis: vertical, the 2nd/quarter fold)     // child
      ├─ static quarter: [2 panels]                       // moves with hinge 1 only
      └─ hingeF3 (axis: 45° diagonal, the 3rd fold)       // innermost
         ├─ static wedge: [1 panel]                        // moves with hinges 1+2
         └─ moving wedge: [1 panel]                         // moves with all three
```
*(Panel-to-hinge assignment must match the chosen physical fold order; verify against the book diagram in M4. The structure — three nested hinges, eight panels — is the invariant. This is identical to the main spec's §6.2 rig, since Design 18 *is* the canonical symmetrical-triangle fold.)*

- Unfold: hinge F3 (π → residual), then F2, then F1, eased segments with ~10% overlap, ~2.5 s total.
- Z-fighting: per-layer offset lerping to the residual-angle separation.

### Stage 8 — Result
Orbit controls, soft key light raking across the surface (low-angle light is what sells the bump creases — add a default light angle that grazes the crease star), export 2D SVG/PNG.

**Acceptance for this example:** four tulips pointing at the edge midpoints; half-motifs merged seamlessly across every seam; visible 8-spoke crease star with correct mountain/valley alternation under raking light; single connected piece.

---

## 3. Engine / UI separation (Figma Make interface)

The interactive canvases and the editor chrome are **separate components with a typed contract**. The UI shell (panels, toolbars, sliders, template gallery) is generated by Figma Make as React components and must never touch canvas internals; the engine is framework-agnostic and owns all Paper.js/Three.js state.

### 3.1 Structure

```
<App>                          // React (Figma Make output lives here)
  <EditorChrome ... />         // Figma Make–generated: toolbar, panels, sliders
  <CanvasHost>                 // thin React wrapper, ~30 lines, hand-written
      └─ EditorEngine          // framework-agnostic TS class; owns ALL canvases
  </CanvasHost>
```

- `CanvasHost` renders a bare `<div ref>`; on mount calls `engine.mount(el)`, on unmount `engine.dispose()`. The engine creates/positions its own canvases (Paper.js editor, hidden bake canvases, Three.js view) inside that div. React never reconciles the canvases.
- Figma Make components are **purely presentational**: props in, callbacks out. They are replaceable wholesale when regenerated — which is the point. No engine imports inside generated files; all wiring happens in one adapter file.

### 3.2 The contract (single source of truth: `src/engine/api.ts`)

```ts
interface EditorEngine {
  // lifecycle
  mount(el: HTMLElement): void;
  dispose(): void;

  // commands (UI → engine)
  setMode(mode: 'draw' | 'preview' | 'unfold3d'): void;
  setTool(tool: 'freehand' | 'crescent' | 'circle' | 'sawtooth' | 'erase'): void;
  loadTemplate(id: string): void;
  loadFoldConfig(id: string): void;          // 'symmetrical-triangle' for this example
  setUnfoldProgress(t: number): void;        // 0..1 scrubber
  playUnfold(): void;
  setPaperStock(props: PaperStockProps): void; // paper-shaders params → triggers re-bake
  undo(): void; redo(): void;
  exportPattern(format: 'svg' | 'png' | 'pdf'): Promise<Blob>; // 'pdf' → print instruction sheet (M7)

  // events (engine → UI), single subscription point
  on(event: EngineEvent, cb: (payload: any) => void): Unsubscribe;
  // events: 'modechange' | 'pathschange' | 'validation' | 'unfoldprogress' | 'historychange' | 'ready'
}
```

Rules:
1. UI state that the engine cares about flows **only** through commands; engine state the UI displays flows **only** through events. No shared mutable objects.
2. The adapter (`src/app/wireUi.tsx`) is the only file that knows both sides. When Figma Make regenerates the chrome, only this file is re-checked.
3. The engine must run headless (no UI) for tests: every milestone acceptance check drives it via the API.

### 3.3 Consequence for M0
This settles the React-vs-vanilla question: **React for the shell** (Figma Make outputs React, and `@paper-design/shaders-react` slots in for the paper-stock preview), **vanilla TS for the engine**. The paper-shaders bake can run via the React component mounted offscreen inside `CanvasHost`, or via the core `@paper-design/shaders` package directly inside the engine — prefer the latter to keep the engine UI-free.
