# Paper-Cutting Studio — Development Spec

A web app that mirrors the real-life Chinese paper-cutting workflow: **fold → draw (design) → cut → unfold**. The user designs cuts on a 2D folded wedge (Paper.js), then watches the paper unfold in 3D (Three.js) to reveal the full symmetrical pattern, rendered with a realistic paper texture (Paper Shaders).

> **Naming note:** *Paper.js* (vector graphics library) and *Paper Shaders* (`@paper-design/shaders`, from paper.design) are unrelated projects. Refer to them as `paperjs` and `paper-shaders` in code/comments to avoid confusion.

---

## 1. User flow

1. **Fold (intro animation, optional for v1):** 3D paper folds itself: square → half (horizontal fold) → quarter (vertical fold) → eighth (diagonal fold). Ends as a 45° right triangle.
2. **Draw (sketch):** The folded triangle is presented flat in a 2D editor. With the **pencil** the user sketches freehand *ink lines* (open polylines) on the wedge — a draft, like drawing on real folded paper — and the **eraser** rubs that ink out. Nothing is cut yet. (See §4 for the full tool model.)
3. **Cut (scissors):** The **scissors** read the sketch and detect the *enclosed areas* the lines seal off (against other lines and/or the paper edges), highlighting each. Tapping an area cuts it out (the bounding line is consumed); tapping an existing cut reverts it. Each cut is validated (inside wedge, snapped to fold edges) and previewed as removed material.
4. **Unfold:** Switch to the 3D view. The paper unfolds hinge by hinge (diagonal → vertical → horizontal), revealing the 8-fold symmetric pattern with holes.

A live "ghost preview" of the unfolded 2D result may be shown beside the editor during the Draw stage (cheap to compute, big UX win).

---

## 2. Fold model & symmetry maths

### 2.1 Coordinate frame

- Paper is a unit square centred at the origin: x, y ∈ [−0.5, 0.5]. One shared frame across Paper.js, the unfold logic, and Three.js UVs. Convert to pixels/world units only at the edges of the system.
- Fold sequence (matching the reference diagram) defines three fold lines through the origin:
  - F1: horizontal axis (θ = 0°)
  - F2: vertical axis (θ = 90°)
  - F3: diagonal (θ = 45°)
- The editable wedge is the region between θ = 0° and θ = 45° (an eighth of the square). All user cut paths live in this wedge.

### 2.2 Unfolding = repeated reflection

Reflection across a line through the origin at angle θ:

```
R(θ) = [ cos2θ   sin2θ ]
       [ sin2θ  −cos2θ ]
```

Unfold by doubling, in reverse fold order:

1. Start: cut paths in the wedge (1 copy).
2. Reflect across F3 (45°) and union → 2 copies (fills the quarter).
3. Reflect across F2 (90°) and union → 4 copies (fills the half).
4. Reflect across F1 (0°) and union → 8 copies (fills the square).

This produces the dihedral group D₄.

### 2.2b Generalising to other folds

Reflect-and-double only maps cleanly onto power-of-two folds (the symmetrical triangle and its further folds). For everything else, use the **direct construction**, which covers every fold:

- Wedge angle: α = 180° / n, where n = number of mirror-pairs (so the paper has 2n copies for a fully mirror-symmetric fold).
- Generate the copies: for k = 0…n−1, place `rotate(k·2α)(wedge)` and, where the fold preserves a mirror, `rotate(k·2α)(mirror(wedge))`.

Crucially, the four common real-world folds (see the canonical fold reference) are **all sequences of straight creases** — none is a radial "fan". A cone fold is just straight folds whose crease lines happen to converge at the apex. So the same machinery handles all of them; only the fold-line angles and copy count differ.

| Fold (real-world name) | Folds | Wedge | Copies | Notes |
|---|---|---|---|---|
| Symmetrical triangle | half → quarter → diagonal | 45° | 8 | Clean D₄; axis-aligned + 45°/135° creases. **Fully pinned down.** |
| Asymmetrical triangle | half → quarter → off-centre diagonal | varies | 8 | Last crease not through the corner bisector → exact angles must be measured from the source diagram. |
| Ice cream cone | half → diagonal → wrap | ~36°/30° | 10 or 12 | Cone fold; creases converge at apex. Exact wrap angle TBC. |
| Bouquet wrap | half → both corners in (V) → wrap | ~36°/30° | 10 or 12 | Cone fold; symmetric V-wrap. Exact angle TBC. |

`foldConfig` stores: the ordered list of fold lines (angle + which side moves), the resulting copy count, and the wedge boundary angles. The fold-line list drives **both** the 2D copy generation and the 3D hinge rig — single source of truth, no `family` flag needed.

> **Pinned vs pending:** only the symmetrical triangle is geometrically nailed down right now. The other three need their exact crease angles read off the reference diagrams (or confirmed with you) before their `foldConfig` is trustworthy — flagged again in §9.

> **Worked example:** `design18-pipeline.md` documents the full symmetrical-triangle (D₄) pipeline end to end, including **crease rendering** (bump ridges + residual fold angle + crease tint) and the **engine/UI separation contract** for the Figma Make–generated interface. Treat both as normative additions to this spec.

Note: cone folds (ice cream cone, bouquet wrap) produce circular/petal outlines — the user also cuts the **outer contour** of the wedge (the open end of the cone), not just interior holes. The editor must support contour cuts.

### 2.3 Edge-snapping rule

Cut path points within ε (suggest ε = 0.5% of paper size) of a fold line must be snapped exactly onto it **before** unfolding. Otherwise reflections create hairline slivers and self-intersecting unions. Also snap points near the outer edges of the square.

### 2.4 Validity rules (enforce in editor)

- The validity rules apply to the **cut regions** the scissors produce (closed polygons), not to the raw pencil sketch — pencil strokes are open ink lines and intentionally need not be closed (§4).
- Cut regions must be closed and non-self-intersecting (they are, by construction — traced from the detected face).
- Cut regions must stay within the wedge (clip or reject).
- The union of cuts must not disconnect the paper — handled by the compositor's keep-largest rule (§4); a cut that would drop a piece simply drops it, as real paper does.

---

## 3. Architecture

```
src/
  core/
    geometry.ts        // reflection matrices, snapping, wedge clipping (no DOM deps — unit-test this)
    unfold.ts          // doubling algorithm over path data; pure functions
    foldConfig.ts      // fold-line definitions; the only place fold order/angles live
    ink.ts             // pure pencil-sketch model: clean a stroke, erase ink (no DOM — unit-test this)
  editor/              // Paper.js layer
    WedgeEditor.ts     // sketch/scissors/eraser tools, ink rendering (clipped to paper), edge snapping
    EditorModel.ts     // headless state: ink strokes, detected regions, cut batches, undo/redo
    CutCompositor.ts   // Paper.js booleans: union cut batches, keep-largest paper piece
    UnfoldPreview.ts   // hidden/side canvas: renders full 8-wedge pattern
  bridge/
    RegionDetector.ts  // raster: pencil sketch → enclosed cut-out areas (flood/face-label, dilate, trace)
    AlphaMapBaker.ts   // unfolded pattern → 2D canvas → THREE.CanvasTexture (alphaMap)
    PaperTextureBaker.ts // paper-shaders output → snapshot canvas → THREE.CanvasTexture (map + crease bump/tint)
    paperStock.ts      // pure: stock resolution, shader uniform mapping, crease-ridge profile (no DOM — unit-test this)
  scene/               // Three.js layer
    PaperMesh.ts       // panel geometry, UV mapping, materials
    FoldRig.ts         // nested hinge groups + fold/unfold animation
    Studio.ts          // scene, camera, lights, renderer, controls
  app/
    main.ts            // state machine: Fold → Draw → Cut → Unfold
```

**Data contract between layers:** `core/` operates on plain path data (arrays of points / segment descriptors in unit-square space), not Paper.js objects. The editor converts Paper.js `Path` → plain data; the scene consumes baked canvases. This keeps `core/` unit-testable and the two rendering libraries decoupled.

Dependencies: `paper`, `three`, `@paper-design/shaders-react` (or `@paper-design/shaders` if the app isn't React — decide at M0). Build with Vite + TypeScript.

---

## 4. Editor (Paper.js)

The editor mirrors real folded-paper cutting as a **sketch → cut** two-step, not a lasso. The headless state (ink strokes, detected regions, committed cut batches, undo/redo, debounced preview) lives in `editor/EditorModel.ts`; `editor/WedgeEditor.ts` is the thin Paper.js view that turns pointer events into plain point arrays and renders. Both run UI-free behind the engine API.

### 4.1 Tools

- **Pencil** — sketches freehand *ink lines* (open polylines; `simplify` + `flatten` on mouse-up). These are a draft, never cut directly. Ink is **clipped to the wedge**, so anything drawn off the paper is invisible. A width slider sets the line weight, with a brush-size cursor preview.
- **Eraser** — rubs the drawn path over the sketch, trimming/splitting the ink strokes it touches (never the committed cuts). Width slider + cursor preview.
- **Stamps** — the classic unit patterns (crescent 月牙纹, triangle 三角纹, circle 圆点纹, sawtooth 锯齿纹). A stamp drops a **closed ink loop**, so the scissors detect its interior exactly like a hand-drawn loop.
- **Scissors** — detect and cut the **enclosed areas** the sketch encloses (§4.2). Every uncut area is highlighted (cyan); committed cuts get a dimmed wash hinting they can be reverted. Tapping an area cuts it; tapping a cut **reverts** it (a toggle). "Cut all" cuts every uncut area at once. A "fit" slider tunes how tightly the cut hugs the pencil line.

### 4.2 Scissors region detection (`bridge/RegionDetector.ts`)

A raster bridge concern (`core/` stays pure). For the current sketch:

1. Rasterise the wedge interior plus the ink strokes as thin **walls**; a stroke endpoint near a paper edge is first extended onto it, so a line drawn *to* an edge seals against it (the edge can then close an area).
2. **Label every face** the ink carves (connected interior cells). The single largest face touching the **open edge** is the un-cuttable paper *body*; every other face is a cut candidate — including faces sealed by fold edges *and* faces a line carves off against the open edge. (Simple loops still work: the big outside face is the body, the loop interior the cut.)
3. **Dilate** each candidate back out to the pencil-line centerline (plus the user's fit margin), which hugs the line and **merges** faces split only by a single stroke, so a pencilled shape cuts as one whole. Clipped to the wedge.
4. Trace each merged face to a contour, simplify, and return as plain unit-space polygons.

When a cut is made, the bounding sketch lines it fully encloses are **consumed** (removed from the sketch and stored with the cut); reverting the cut restores them. Committed cut batches are unioned and reduced to the **largest connected paper piece** (`editor/CutCompositor.ts`) — the keep-largest rule of §2.4.

### 4.3 Unfold preview

- **Canvas B (hidden or side preview):** the unfold preview. On every edit (debounced ~100 ms):
  1. Take the committed removed-region contours (the sketch never reaches here — only actual cuts do); they are already snapped to the fold edges (§2.3).
  2. Run `unfold()` → 8-way path set.
  3. Render: **white square on black background, cuts filled black.** This exact convention is what the alphaMap expects (white = opaque paper, black = hole).
- Boolean ops note: prefer rendering cuts as filled shapes over the white square rather than calling `subtract()` on every edit — Paper.js boolean ops are robust but slow with many curves. Reserve true `subtract()` for the keep-largest compose and export/validation.

---

## 5. Bridges (the keystone pieces)

### 5.1 Cut pattern → alphaMap

```
Canvas B (Paper.js, white/black) → THREE.CanvasTexture
  texture.needsUpdate = true after each redraw
  material.alphaMap = texture; material.alphaTest = 0.5; material.side = THREE.DoubleSide
```

Resolution: 1024² minimum, 2048² preferred. `alphaTest` (cutout) rather than alpha blending — avoids transparency sorting issues between the 8 stacked layers when folded.

### 5.2 Paper Shaders → colour map (bake once)

Paper Shaders renders into **its own canvas with its own WebGL context**; it is not a Three.js material. The texture is static, so bake it:

1. Mount `<PaperTexture>` offscreen at texture resolution. Suggested starting props: `colorBack` = paper red (#c8102e for the classic cut-paper look) or off-white, `fiber≈0.4`, `fiberSize≈0.2`, `crumples≈0.15`, `drops≈0.15`, `roughness≈0.3`, `folds=0` (its "folds" are decorative noise, unrelated to our geometric folds — keep off to avoid visual confusion).
2. Immediately after first render, `drawImage` its canvas into a plain 2D canvas (WebGL buffers aren't reliably readable later without `preserveDrawingBuffer`).
3. Wrap the snapshot in `THREE.CanvasTexture` → `material.map`. Set `colorSpace = THREE.SRGBColorSpace`.
4. Optional realism: derive a luminance-based bump map from the same snapshot → `material.bumpMap`, small `bumpScale`, so crumples respond to scene lighting (the baked colour map alone won't).

Expose the shader props in a "paper stock" configurator; re-bake on change (it's a one-off cost, not per-frame). **Delivered as `app/PaperStockConfigurator.tsx`** — a modal with a *live* `ShaderMount` preview (cheap per-slider, no bake/snapshot), the full tunable control set (paper + fibre colours, fibre, fibre size, crumples, crumple size, speckle/drops, roughness, contrast, seed), preset swatches, and JSON export/import so a refined stock round-trips. "Apply" pushes the stock through `setPaperStock(props)`, which runs the one-off bake. The pure uniform mapping (`bridge/paperStock.ts`) forces `folds`/`foldCount` off (gotcha §10.8) and is unit-tested headless.

Use the core `@paper-design/shaders` `ShaderMount` directly (vanilla, no React component) so the engine stays UI-free; same bake procedure. The mount renders async (its own resize observer + RAF), so the snapshot waits for a non-transparent frame before `drawImage` (the black-frame guard).

**The baked colour map is reused in the 2D view, not just 3D:** the engine exposes it (`PaperTextureBaker.getMapCanvas()`) so the Paper.js editor wedge (a clipped raster) and the side unfold preview paint their "paper" with the same texture — the 2D editor now reflects the chosen stock. Only the hidden alphaMap bake stays solid white/black.

### 5.3 Material

```
MeshStandardMaterial {
  map: paperTextureBake,      // §5.2
  alphaMap: cutPatternBake,   // §5.1
  alphaTest: 0.5,
  bumpMap: paperBumpBake (optional),
  roughness: 0.95, metalness: 0,
  side: THREE.DoubleSide
}
```

Stretch: swap to `MeshPhysicalMaterial` with `transmission`/`thickness` for the backlit "cutting on a sunlit window" effect.

---

## 6. 3D scene & fold rig (Three.js)

### 6.1 Geometry

Model the paper as **one panel per symmetry copy** (8 for the symmetrical triangle, 10–12 for cone folds), each a triangle built from a `THREE.Shape`, with UVs mapping the panel to its correct region of the unit square (so the single full-square alphaMap and colour map paint all panels correctly with zero per-panel texture work).

### 6.2 Hinge hierarchy

**One rig strategy for every fold.** Real paper-cutting only ever uses straight creases, so every fold — including the cone folds (ice cream cone, bouquet wrap) — unfolds as a sequence of nested hinges. There is no separate "fan" model: a cone fold is just a nested-hinge rig whose hinge axes all pass through (or near) the apex, instead of being axis-aligned. The rig generalises to arbitrary fold-line axes; only the axis angles and panel count change per `foldConfig`.

Nested groups, each with its origin on a fold line (door-hinge pattern). Example for the symmetrical-triangle fold (8 panels, 3 hinges):

```
scene
└─ hingeF1 (axis: fold line 1)     // first fold — outermost
   ├─ [static half: N/2 panels]
   └─ hingeF2 (axis: fold line 2)  // second fold
      ├─ [static quarter: N/4 panels]
      └─ hingeF3 (axis: fold line 3) // last fold — innermost
         ├─ [static: remaining panels]
         └─ [moving panel(s)]
```

- Hinge axes are the fold lines (whatever their angle — axis-aligned, diagonal, or apex-converging); rotate each hinge group 0 → π to fold, π → 0 to unfold.
- **Unfold order:** innermost-last-fold first, reverse of folding. Drive all hinges from a single `progress ∈ [0,1]` scrubber: partition progress into eased segments with slight overlap (~10%) so motion flows.
- **Z-fighting:** coplanar layers will flicker. Mitigate with (a) a tiny per-layer offset (0.0005 units) that lerps to 0 as unfold completes, and/or (b) `polygonOffset` per panel, and/or (c) slight curvature on moving panels mid-fold (stretch).
- Easing: `easeInOutCubic` per segment; total unfold scales with hinge count (~2.5 s for the 8-panel case).

The number of nested hinges = number of folds; the panel count = number of symmetry copies. Both come from `foldConfig`. Cone folds simply have more hinges sharing the apex.

### 6.3 Scene dressing

Soft key light + ambient, subtle ground shadow (`ShadowMaterial` plane), `OrbitControls` enabled in the Unfold stage. Background: warm neutral.

---

## 7. State machine

```
FOLD_INTRO → DRAW ⇄ CUT_PREVIEW → UNFOLDING → RESULT
                                      ↑________↓ (re-edit: refold instantly, return to DRAW)
```

- DRAW and CUT_PREVIEW share the editor; CUT_PREVIEW just toggles the rendering of paths as removed material plus the side unfold preview.
- RESULT offers: orbit, "fold again", "back to editing", export PNG/SVG of the 2D pattern, print/PDF export of the instruction sheet (M7).

---

## 8. Built-in templates

Four starter templates, drawn from the reference book designs (Images 1–4). Each is authored as an SVG of cut paths **within the unit wedge** plus a `foldConfig`, stored under `src/templates/`. Author by tracing the folded-wedge diagram (top of each reference image), then verify by running the unfold engine and visually diffing against the unfolded photo.

| ID | Fold | Design (reference) | What it exercises |
|---|---|---|---|
| `lotus-cross` | Symmetrical triangle — D₄, 8 copies, 45° wedge **(pinned down)** | Four-lotus cross — lotus/tulip petals + central rosette (Image 2 = book Design 18) | **Build first.** The fully confirmed fold; doubles as the `design18-pipeline.md` worked example. Edge-touching half-petals merging across seams; floating teardrop holes |
| `plum-blossom` | Cone fold (bouquet wrap) — 5-fold, ~10 copies, 36° wedge | Five-petal plum blossom — scalloped petal outline, radiating sawtooth centre, teardrop (Image 1) | Outer-contour cutting (the petal edge *is* the cut, not an interior hole); simplest motif; fine detail inside a curved contour |
| `eight-petal` | Asymmetrical triangle — 8 copies, asymmetric wedge (off-centre diagonal; exact geometry TBC) | Eight-petal rounded flower — lobed/scalloped rim, layered/swirled petals (Image 3) | Asymmetric wedge → each copy reads as its own petal with no mirror line through its centre (the swirled/layered look, vs `lotus-cross`'s bilaterally-symmetric flowers); non-bisecting final crease; curved outer contour |
| `saw-medallion` | Cone fold — multi-fold (~8), wedge TBC | Concentric medallion: crescent ring + petal core + fine sawtooth rim (Image 4) | Sawtooth stamp (锯齿纹) along a curved edge; concentric rings of repeated detail |

> **Confidence:** the petal/symmetry **counts** above are read directly from the unfolded results, so they're reliable. Only `lotus-cross` (symmetrical triangle) has its fold geometry fully pinned — author it first. The exact wedge shape for `eight-petal` (asymmetrical triangle), and the precise wrap angle for the two cone folds (`plum-blossom`, `saw-medallion`), still need measuring from the folded-wedge diagrams before finalising each `foldConfig`. Note `eight-petal` is a straight-crease hinged fold (same 3-hinge rig as `lotus-cross`), not a cone fold.

Template acceptance criteria (each):
1. Unfolded result is a **single connected piece** (flood-fill check).
2. Every edge-touching cut merges seamlessly across fold lines — no slivers at any seam.
3. At least one floating (non-edge-touching) cut renders as an isolated hole.
4. Loads into the editor as editable paths (templates are starting points, not static images).

## 9. Milestones

Each milestone lists its **deliverable** (what exists at the end), **tech** (libraries/tools), and **test** (how it's verified). Build order is sequential; M2.5 can run in parallel with M3.

### M0 — Scaffold
- **Deliverable:** Vite + TS + React skeleton; `CanvasHost` (hand-written ~30-line React wrapper) mounting an empty `EditorEngine` that creates and positions its three canvases (Paper.js editor, hidden bake, Three.js view); `core/geometry.ts` with `R(θ)`, point-snapping, and the copy generator as pure functions; `src/engine/api.ts` contract stub. Locks the M0 decision: **React shell + vanilla-TS engine** (per `design18-pipeline.md` §3.3).
- **Tech:** Vite, TypeScript, React 18, Vitest, ESLint/Prettier. `paper` and `three` installed; `@paper-design/shaders` (core, not the React component) reserved for M5.
- **Test:** Vitest unit tests for geometry — `R(45°)` maps (1,0)→(0,1); snapping pulls a near-edge point onto its axis within ε; the copy generator emits 8 transforms for the symmetrical triangle with correct angles. Manual: both canvases render, zero console errors.

### M1 — Unfold engine (2D)
- **Deliverable:** `core/unfold.ts` — wedge path data + `foldConfig` → unfolded path set + crease-segment list (with mountain/valley parity). Rendered to the hidden bake canvas as white-paper / black-cuts. `lotus-cross` (symmetrical triangle, 8 copies) first; other folds gated on confirmed angles.
- **Tech:** pure-TS transforms in `core/` (no Paper.js import there); Paper.js only at the render boundary for boolean `unite`/`subtract`. Vitest for the pure parts.
- **Test:** golden-snapshot test — known wedge cut → assert the unfolded result matches a stored reference (point-set or rasterised PNG diff). Key acceptance: a cut touching a fold edge yields one merged hole across the seam — assert the union's contour count is as expected with no zero-area slivers. Visual diff against the Design 18 photo.

### M2 — Editor (Paper.js)
- **Deliverable:** interactive wedge editor on the **sketch → cut** model (§4): **pencil** (freehand ink lines, clipped to the paper, width slider + cursor preview), **eraser** (rubs ink out, width slider + preview), **stamp** tools (crescent / circle / sawtooth / triangle — dropped as closed ink loops), and **scissors** that detect the enclosed areas, highlight them, cut on tap and revert on tap-again, with a cut-fit slider and "Cut all". Region detection in `bridge/RegionDetector.ts`; headless state (ink strokes, regions, cut batches, undo/redo, debounced preview) in `editor/EditorModel.ts`; keep-largest compose in `editor/CutCompositor.ts`. Emits `pathschange` / `outlineschange` / `validation` via the engine API.
- **Tech:** Paper.js (tools, hit-testing, `simplify`/`flatten`, clipping groups, boolean ops); an offscreen 2D canvas for the raster region detection; the engine event bus. No React in this layer.
- **Test:** engine-level tests driving the **headless** API (the engine must run UI-free, per §3.2), with a stub region detector — a region crossing the wedge boundary is clipped/rejected; an edge-touching point snaps within ε; cutting commits a batch and dismisses the bounding line; tapping a cut reverts it and restores the line; the preview updates after the debounce. Pure helpers (`core/ink.ts` erase, `RegionDetector` grid ops: label/dilate/trace/simplify/edge-extend) unit-tested directly. Detection-on-canvas verified in-browser. Manual exploratory drawing.

### M2.5 — Templates *(parallel with M3)*
- **Deliverable:** `src/templates/*.svg` + `foldConfig` for the four templates, plus a loader that imports a template as **editable** paths. `lotus-cross` first; the asymmetrical-triangle and two cone folds added once their wedge geometry / wrap angles are measured.
- **Tech:** trace folded-wedge diagrams in Figma/Illustrator → SVG export; Paper.js `importSVG` for the loader.
- **Test:** each template against its §8 acceptance criteria — single connected piece (flood-fill on the raster), seams merge with no slivers, ≥1 floating hole, loads as editable paths. Per-template visual diff vs the reference photo.

### M3 — Bridge (Paper.js → Three.js)
- **Deliverable:** `bridge/AlphaMapBaker.ts` — bake canvas → `THREE.CanvasTexture` as `alphaMap` on a flat full-square mesh, live-updating on edit. The 3D view shows the unfolded pattern as a textured plane (no folding yet).
- **Tech:** Three.js (`WebGLRenderer`, `PlaneGeometry`, `MeshStandardMaterial`, `CanvasTexture`), `alphaTest`.
- **Test:** edit a cut → the plane's holes update within a frame or two (assert `texture.needsUpdate` was set + visual). Cutout edges crisp, no semi-transparent fringe. Edits hold ≥30 fps.

### M4 — Fold rig (Three.js)
- **Deliverable:** `scene/FoldRig.ts` — builds N panels from `foldConfig`, nests them in hinge groups (axis-aligned **or** apex-converging), and drives fold/unfold from a single `progress ∈ [0,1]` scrubber with eased, ~10%-overlapping segments; z-fighting mitigated. `scene/PaperMesh.ts` for per-panel geometry + shared UVs.
- **Tech:** Three.js (`Group` hierarchy, quaternion/Euler rotations, `polygonOffset`), an easing util, scrubber wired to `setUnfoldProgress` / `playUnfold`.
- **Test:** at `progress=0` the silhouette is a single wedge; at `progress=1` the paper is flat and its pattern matches the 2D bake; intermediate frames monotonic with no panel inversion. Assert via headless render + pixel checks at key frames; confirm no flicker at `progress=1` (diff a few stable frames).

### M5 — Paper Shaders bake *(delivered)*
- **Deliverable:** `bridge/PaperTextureBaker.ts` — render the paper-shaders texture offscreen **once** (core `ShaderMount`, its own WebGL context), snapshot to a 2D canvas, supply as `map` + a luminance-derived `bumpMap`; crease tint + mountain/valley ridges composited in from the fold's crease star (per `design18-pipeline.md` Stage 4). Pure uniform/stock helpers + ridge profile in `bridge/paperStock.ts` (unit-tested). Plus two extensions beyond the original plan: (a) the **paper-stock configurator** `app/PaperStockConfigurator.tsx` (live preview, full control set, JSON export/import — see §5.2); (b) the baked colour map is **also painted into the 2D view** (editor wedge raster + side preview), so the 2D editor reflects the stock.
- **Tech:** `@paper-design/shaders` core (`ShaderMount`, `paperTextureFragmentShader`, `getShaderNoiseTexture`), Three.js `CanvasTexture` (`map` SRGB / `bumpMap` linear), a raised-cosine ridge profile for the bump (Sobel/normal-map upgrade deferred — bump suffices at this scale). The configurator is a presentational React component talking to the engine only via `setPaperStock`.
- **Test:** `paperStock.test.ts` covers the pure parts (stock resolution + clamping, uniform mapping with `folds` forced off, ridge profile). The bake is WebGL/canvas (untestable headless) — verified in-browser: the snapshot waits for a **non-transparent** frame before reading (black-frame guard), changing a stock prop re-bakes and the 2D + 3D paper updates, creases read under raking light.

### M6 — Polish
- **Deliverable:** fold-intro animation (square → wedge before Draw), lighting + ground shadow, residual-crease relax, PNG/SVG export of the 2D pattern, full state-machine wiring (`FOLD_INTRO → DRAW ⇄ CUT_PREVIEW → UNFOLDING → RESULT`), Figma Make chrome wired through `wireUi.tsx`.
- **Tech:** Three.js lights / `ShadowMaterial` / `OrbitControls`; a small FSM (XState or hand-rolled); export via canvas `toBlob` (PNG) and Paper.js `exportSVG`.
- **Test:** Playwright end-to-end happy path — load template → edit → unfold → export, asserting each transition and a valid exported file. Regenerate the chrome in Figma Make and confirm only `wireUi.tsx` needs touching (the separation contract holds).

### M7 — Print export
- **Deliverable:** a single-page printable instruction sheet the user can take to the table with real paper and scissors. Three sections on the page:
  1. **To-scale fold template** — the wedge cut pattern rendered at the design's actual paper size (e.g. 12 cm for Design 18), with fold-edge labels ("folded edge — cuts will mirror" / "open edge") and a printed scale bar. The user folds real paper to match the wedge shape, places it over the template, traces the cuts, and cuts through all layers.
  2. **Fold-sequence diagram** — small thumbnail steps generated from `foldConfig` (one box per fold line, annotated with fold order and direction: valley/mountain), so the user knows how to fold before cutting.
  3. **Expected result preview** — the 2D baked canvas (full unfolded pattern) at a reduced size, as a reference to check the finished piece against.
  Wired to a "Print instructions" button in the RESULT stage, alongside the existing PNG/SVG export. `exportPattern` in `api.ts` extended: `format: 'svg' | 'png' | 'pdf'`.
- **Tech:** browser-native `window.print()` with a `@media print` stylesheet applied to a dedicated `PrintLayout` component (no extra runtime dependencies). The wedge template is the Paper.js `exportSVG` output from M6, scaled to physical dimensions using the paper size stored in `foldConfig`. Fold-sequence thumbnails are small inline SVGs drawn from `foldConfig.foldLines`. The result preview is `canvas.toDataURL()` from the bake canvas. `PrintLayout` is a React component under `src/app/`; it is hidden on-screen and only visible in print media. If browser print proves insufficiently controllable for scale-accuracy, `jsPDF` is the fallback (decision at implementation time, no API change).
- **Test:** Playwright — click "Print instructions", intercept the print dialog (or assert `window.print` was called), and capture the rendered `PrintLayout` as an image; diff it against a stored reference. Assert the SVG template contains a scale-bar rect of the correct declared width. Manual acceptance: fold a 12 cm square piece of red paper following the printout, cut along the template, unfold — the resulting pattern must visually match the digital preview.

---

## 10. Known gotchas (read before coding)

1. One canvas = one context type: Paper.js (2D) and Three.js (WebGL) can never share a canvas.
2. Snapshot the paper-shaders canvas immediately after render (`drawImage` to a 2D canvas); don't hold a reference to its WebGL canvas and read it later.
3. Use `alphaTest`, not transparent blending, for the holes — stacked folded layers + alpha blending = sorting artefacts.
4. Snap-to-fold-edge before unfolding, always (§2.3).
5. `CanvasTexture.needsUpdate = true` after every Paper.js redraw, or the 3D view silently goes stale.
6. Keep `core/` free of Paper.js/Three.js imports — pure data in, pure data out.
7. UV space = unit-square space = editor space. One frame to rule them all; document any conversion at the boundary it occurs.
8. Paper Shaders' `folds`/`foldCount` props are decorative noise, not geometric folds — default them off.
9. Every real fold is straight creases → every fold unfolds via nested hinges. There is no radial "fan" unfold; cone folds are hinges whose axes meet at the apex.
10. Only the symmetrical-triangle fold has confirmed crease angles. The asymmetrical triangle and the two cone folds need their exact angles measured from the source diagrams before their `foldConfig` is reliable — don't ship them on guessed angles.
