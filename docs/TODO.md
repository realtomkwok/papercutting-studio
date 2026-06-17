# TODO — refinement backlog

Items deferred from milestone work, to revisit before the milestone is considered polished.

## M2 — editor (pending design / pencil / eraser / scissors)

- [ ] **Stencil fidelity (freehand capture).** The pending-design outline sometimes doesn't close the
  path, and is sometimes over-simplified so the committed shape no longer resembles what was
  stencilled. Revisit `WedgeEditor.onUp` (`simplify(2.5)` + `flatten(3)`) and the close-the-lasso
  logic so the captured polygon faithfully follows the drawn stroke and always closes.

- [ ] **Scissors cuts the clicked region, not the whole pending design.** Currently `EditorModel.cut(at)`
  commits the *entire* pending design when the click lands anywhere inside it. It should instead cut
  only the closed sub-region (connected component of the composed pending design) under the cursor,
  leaving the rest of the pending design uncommitted. Needs splitting the pending ops by which
  component they contribute to — see `EditorModel.cut` / `CutCompositor.design`.

- [ ] **Eraser only carves an existing pending design — it must not create pending area.** The eraser
  subtracts from the pending design, so an eraser stroke over empty paper (or over already-committed
  cuts) should be a **no-op**, never adding a pending `subtract` op that lingers. Guard
  `EditorModel.erase` so a subtract is dropped when it removes nothing from the current pending region.

## M5 — paper-shaders bake

- [ ] **Editor wedge texture is cover-fit, not seam-aligned.** `WedgeEditor.drawStatic` paints the
  baked colour map as a clipped raster scaled to *cover* the wedge bounding box, so the crease tint
  baked into the texture doesn't line up with the wedge's actual fold edges. Cosmetically fine (it
  reads as textured paper), but to align it the raster should map the **full unit square** through the
  same `unitToView` transform (accounting for the y-flip) and be clipped to the wedge.

- [ ] **`setPaperStock` merges partial props over defaults, not over the current stock.**
  `resolvePaperStock` fills missing fields from `DEFAULT_PAPER_STOCK`, so a partial update would reset
  the untouched knobs. Harmless today (the configurator always sends the full set), but if any other
  caller sends a partial stock it should merge over the engine's current stock instead.

- [ ] **Normal map from the bump canvas (deferred per spec).** v1 uses a `bumpMap` only. For sharper
  crease relief under raking light, derive a normal map (Sobel on the combined bump canvas) — see
  worked-example Stage 4.

mc## M6.5 — Polish

- [ ] **Rotate tool for 3D view — replace left/right buttons with free 360° drag.** The current UI
  has discrete left/right rotation controls. Replace with a single rotate-tool mode where the user
  can drag freely to orbit the camera in 360°. Default starting angle should be 180° (matching the
  current visual default) rather than 0°. Likely implemented by switching `OrbitControls` to
  pointer-drag mode and removing the step-button controls; the starting azimuth should be initialised
  to π in `FoldRig` or `Studio`.

- [ ] **Remove the visible border from the 2D paper wedge to match paper texture.** The wedge editor
  currently renders a hard geometric border around the paper area. For a more realistic paper look,
  strip the stroke/border so the wedge edge fades into or aligns with the baked paper texture.
  Adjust `WedgeEditor.drawStatic` (and any `strokePath` calls in the wedge boundary draw) to omit
  the outline, or blend it so it is not visible against the colour-map background.

## Preview & Share screen (wired in M6 — `src/app/Preview*`, `SharePopup`, `wireUi.tsx`)

The Preview & Share screen (Figma 50:401) is wired: the editor's Share button switches the engine to
the 3D unfold view (`setMode('unfold3d')` + `playUnfold`), with the instructions card, the
Print/Save/Share bottom bar, and a share popup. The three actions are currently minimal stubs:

- [ ] **Print → print-preview dialog (M7).** `handlePrint` currently calls `window.print()` on the live
  page. Replace with a print-preview dialog that shows how the design lays out on physical paper — the
  to-scale fold template with guides + fold-sequence diagram (dev-spec §M7) — with a button that
  invokes the system print function on that print-only layout (`@media print` stylesheet or `jsPDF`).

- [ ] **Save → full design JSON (reusable).** `handleSave` currently downloads only the paper-stock
  props (`paperStock`) as JSON. Extend it to serialise the *whole* design — the committed cuts /
  pending strokes, the fold/template id, and tool params — into a JSON the app can re-import to restore
  the design. Needs an engine API to read out the design (the model's strokes/cuts aren't exposed
  through `engine/api.ts` yet) and a matching load/import path.

- [ ] **Share URL → restore the full design from the link.** `shareUrlFor` / `stockFromUrl` in
  `wireUi.tsx` only round-trip the paper stock through `?stock=<base64 JSON>`. Make the share scheme
  encode the full design (cuts + fold + stock, ideally a compact/short code rather than raw base64)
  and have the app open straight onto the Preview & Share screen with that design fully reconstructed
  when loaded via URL. Pairs with the Save-export work above (shared serialisation format).
