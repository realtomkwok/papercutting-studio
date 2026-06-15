# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Web app mirroring Chinese paper-cutting: **fold → draw (design) → cut → unfold**. User designs cuts on a 2D folded wedge (Paper.js), then watches the paper unfold in 3D (Three.js) revealing the symmetric pattern with a paper texture (Paper Shaders).

Full spec: `docs/dev-spec.md`. Worked example for the first milestone-set target (Design 18, symmetrical triangle / D₄): `docs/worked-example-lotus-cross.md`. Both are normative — read before non-trivial changes.

## Stack

- **Shell:** React 18 (Figma Make outputs React; `@paper-design/shaders-react` slots in for the paper-stock preview).
- **Engine:** vanilla TypeScript, framework-agnostic. Decision locked at M0.
- Vite + TypeScript, Vitest for unit tests, ESLint/Prettier.
- Runtime deps: `paper`, `three`, `@paper-design/shaders` (core, not the React component — keeps the engine UI-free). Pulled in per-milestone, not all up-front.

## Architecture (the load-bearing decisions)

```
src/
  core/         pure TS — geometry, unfold, foldConfig, ink (sketch/erase). No paper/three imports.
  editor/       Paper.js layer — WedgeEditor (view), EditorModel (headless state), CutCompositor, UnfoldPreview
  bridge/       raster ↔ vector — RegionDetector (sketch → cut areas); Paper.js canvas → THREE.CanvasTexture (alphaMap, colour map, bump)
  scene/        Three.js layer — PaperMesh, FoldRig, Studio
  engine/       api.ts (the contract) + EditorEngine class
  app/          React shell, CanvasHost, wireUi.tsx (the only file that knows both sides)
  templates/    SVG cut paths + foldConfig per design
```

Three rules that the architecture enforces and that future changes must respect:

1. **`core/` is pure.** Plain path data in (arrays of points / segment descriptors in unit-square space), plain data out. No DOM, no Paper.js, no Three.js. The editor converts Paper.js `Path` → plain data at its boundary; the scene consumes baked canvases. This is what makes `core/` unit-testable and keeps the two rendering libraries decoupled.

2. **One coordinate frame everywhere.** Unit square centred at origin, x,y ∈ [−0.5, 0.5]. Paper.js editor space, unfold logic, Three.js UVs — same frame. Convert to pixels/world units **only** at the edges of the system, and document the conversion at the point it happens.

3. **Engine / UI separation contract.** UI shell (Figma Make–generated React) is purely presentational — props in, callbacks out, no canvas imports. `EditorEngine` owns all Paper.js/Three.js state and runs headless. They communicate only through `src/engine/api.ts`: commands UI→engine, events engine→UI, no shared mutable objects. `src/app/wireUi.tsx` is the **only** file that knows both sides; when Figma Make regenerates the chrome, only `wireUi.tsx` should need re-checking. The engine must run UI-free for tests — every milestone acceptance check drives it through the API.

`CanvasHost` is a hand-written ~30-line React wrapper that renders a bare `<div ref>`; on mount it calls `engine.mount(el)`, on unmount `engine.dispose()`. The engine creates and positions its own canvases inside that div. React never reconciles the canvases — it can't, they're not React-managed DOM.

## Fold model

- Each fold is a sequence of **straight creases** — even the cone folds (ice cream cone, bouquet wrap) are nested hinges whose axes happen to converge near the apex. There is no separate "radial fan" model. One rig strategy for every fold.
- `foldConfig` is the single source of truth for both the 2D copy generator and the 3D hinge rig: ordered list of fold lines (`{angle, moves}`), copy count, wedge boundary angles.
- Only `symmetrical-triangle` (D₄, 8 copies, 45° wedge — Design 18 / `lotus-cross`) has its geometry fully pinned. The other three templates (`eight-petal`, `plum-blossom`, `saw-medallion`) need their exact crease angles measured from reference diagrams before their `foldConfig` is trustworthy. **Don't ship those on guessed angles.**

## Editor tool model (sketch → cut — dev-spec §4)

- The pencil draws **open ink lines**, not closed lassos. `EditorModel.strokes` are open polylines; only the **detected cut regions** are validated as closed polygons. Don't reintroduce "the pencil must draw a closed path."
- The scissors do **raster region detection** in `bridge/RegionDetector.ts` (a bridge concern — `core/` stays pure): label the faces the ink carves, keep the largest open-edge-touching face as the un-cuttable body, dilate every other face to the pencil centerline (merging faces split by one line), trace to contours. A stroke endpoint near a paper edge is extended onto it so a line drawn to an edge seals against it.
- Cutting **consumes** the sketch lines a cut fully encloses (stored with the batch); the scissors are a **toggle** — tap an area to cut, tap a cut to revert (restoring those lines). The detector is injected into `EditorModel` (real impl in the engine; stub in tests) so the model stays headless.

## Gotchas (read before coding — full list in dev-spec §10)

- One canvas = one context type. Paper.js (2D) and Three.js (WebGL) can never share a canvas.
- Snapshot the paper-shaders canvas **immediately** after first render (`drawImage` to a 2D canvas). Its WebGL buffer isn't reliably readable later without `preserveDrawingBuffer`.
- Use `alphaTest` (cutout), not transparent blending, for the holes — stacked folded layers + alpha blending = sorting artefacts.
- **Always snap edge-touching cut points onto fold lines before unfolding** (ε = ~0.5% of paper size). Otherwise reflections produce hairline slivers and self-intersecting unions.
- `texture.needsUpdate = true` after every Paper.js redraw, or the 3D view silently goes stale.
- Paper Shaders' `folds`/`foldCount` props are **decorative noise**, not geometric folds — default them off. Our creases come from Stage 4 (bake), geometrically aligned. Don't confuse them with the geometric fold lines.
- *Paper.js* (vector graphics) and *Paper Shaders* (`@paper-design/shaders`, from paper.design) are unrelated libraries. Refer to them as `paperjs` and `paper-shaders` in code/comments to avoid confusion.

## Milestones

Build order is sequential except M2.5 ‖ M3. Each milestone's acceptance criteria are in `dev-spec.md` §9.

- **M0** Scaffold: Vite + TS + React, `CanvasHost`, empty `EditorEngine` with three canvases, `core/geometry.ts` (R(θ), snapping, copy generator), `src/engine/api.ts` stub.
- **M1** Unfold engine (2D): `core/unfold.ts` — wedge data + foldConfig → unfolded path set + crease segments with mountain/valley parity.
- **M2** Paper.js editor on the **sketch → cut** model (dev-spec §4): **pencil** sketches freehand ink lines (clipped to the paper, width slider + cursor preview), **eraser** rubs ink out, **stamps** drop closed ink loops, **scissors** detect the enclosed areas (`bridge/RegionDetector.ts` — raster flood/face-label → dilate-to-centerline → trace), highlight them, cut on tap and revert on tap-again, with a cut-fit slider. Headless state in `editor/EditorModel.ts`; keep-largest compose in `editor/CutCompositor.ts`. The pencil draws *open* lines — only the detected regions are validated as closed polygons.
- **M2.5** Templates (parallel with M3): `lotus-cross` first; others gated on confirmed fold angles.
- **M3** Bridge: `AlphaMapBaker` — bake canvas → `THREE.CanvasTexture` as alphaMap, live-updating.
- **M4** Fold rig: nested hinges from `foldConfig`, single `progress ∈ [0,1]` scrubber, eased ~10%-overlapping segments.
- **M5** Paper Shaders bake *(done)*: `PaperTextureBaker` (offscreen `ShaderMount` → snapshot → `map` + luminance/crease `bumpMap`) + crease bump/tint composite (worked-example Stage 4); pure `bridge/paperStock.ts` (uniform mapping, ridge profile). Extensions: the baked colour map is also painted into the 2D editor wedge + side preview, and `app/PaperStockConfigurator.tsx` is a live configurator (full controls + JSON export/import) that re-bakes via `setPaperStock`.
- **M6** Wired the UI and functionalities through `wireUi.tsx`.
- **M6.5** Polish: fold-intro, lighting, residual-crease relax, PNG/SVG export, full FSM
- **M7** Print export: printable instruction sheet — to-scale fold template (at physical paper size), fold-sequence diagram from `foldConfig`, expected-result preview. Browser `window.print()` + `@media print` stylesheet; `jsPDF` fallback if scale control requires it. `exportPattern` extended to `'svg' | 'png' | 'pdf'`.

## Build, test, run

To be set up at M0. Standard commands once scaffolded:

```
npm install
npm run dev          # Vite dev server
npm run build        # production build
npm test             # Vitest (watch)
npm run test:run     # Vitest single run
npm run lint
npm run format
```

Run a single test file: `npx vitest run src/core/geometry.test.ts`.
