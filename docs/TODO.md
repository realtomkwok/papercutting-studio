# TODO — refinement backlog

Items deferred from milestone work, to revisit before the milestone is considered polished.


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

# M6.5 — Polish

- [x] **Remove the visible border from the 2D paper wedge / hide creases.** Removed the dashed
  crease lines (apex → each corner) and the FOLDED EDGE labels from `WedgeEditor.drawStatic`; they
  did not represent actual crease positions and cluttered the paper texture. The solid open-edge line
  is kept. Full border removal (M6.5 original) can revisit `openEdge` too when texture alignment is
  confirmed.

## Preview & Share screen (wired in M6 — `src/app/Preview*`, `SharePopup`, `wireUi.tsx`)

The Preview & Share screen (Figma 50:401) is wired: the editor's Share button switches the engine to
the 3D unfold view (`setMode('unfold3d')` + `playUnfold`), with the instructions card, the
Print/Save/Share bottom bar, and a share popup. The three actions are currently minimal stubs:

- [x] **Print → print-preview dialog (M7).** `PrintDialog` is wired via `handlePrint` in `wireUi.tsx`;
  shows the to-scale fold template + fold-sequence thumbnails + expected-result preview. Invokes the
  system print function on the print-only layout.

- [x] **Save → full design JSON (reusable).** `handleSave` downloads the full `DesignState` (cuts +
  strokes + fold id + stock) plus `toolParams`. The **Import Design** button in `TopBar` now opens a
  file picker that reads the JSON back and calls `engine.loadDesignState` + restores tool params.

- [x] **Share URL → restore the full design from the link.** `shareUrlFor` encodes the full
  `DesignState` as `?design=<base64 JSON>`; `designFromUrl` decodes it on load and calls
  `engine.loadDesignState` to restore cuts + strokes + stock. Legacy `?stock=` still supported.

## Editor polish (wired in session)

- [x] **Import Design button reads a saved JSON file.** `wireUi.tsx` — hidden `<input type="file">`
  triggered by `TopBar.onImport`; reads full `DesignState` + optional `toolParams` and restores them
  via `engine.loadDesignState` + `handleApplyPaperStock`.

- [x] **3D view background is transparent (matches editor dotted-grid).** `EditorEngine`: renderer
  uses `alpha: true` + `setClearColor(0,0)`; `scene.background` removed. The preview screen now
  shows the same parchment dotted grid as the editor behind the unfolded paper.

- [x] **Ink strokes hidden while scissors tool is active.** `WedgeEditor.refresh()` — skip ink
  rendering in scissors mode; the cyan region highlights already communicate "cut here" cleanly.

- [x] **Scissors cuts one region per click (progressive merge).** `EditorModel.cut()` — `.slice(0,1)`
  so clicking inside two overlapping regions cuts only the topmost one. Subsequent clicks cut the
  next; `CutCompositor` merges all committed batches into the growing hole.

- [x] **Crease lines + FOLDED EDGE labels removed from 2D editor.** `WedgeEditor.drawStatic()` —
  removed the dashed apex-to-corner lines and both FOLDED EDGE labels; they misrepresented the actual
  fold geometry. Open-edge solid line kept.

## Editor edge labels, colour sync & texture (wired in session)

- [x] **Edge captions re-added as Figma tooltips (47:194).** `WedgeEditor.drawEdgeLabel` draws a
  popover-coloured chip (border + uppercase letter-spaced caption) for each wedge edge — "FOLDED EDGE"
  on the two apex rays, "OPEN EDGE" on the outer span — offset *outside* the edge along its outward
  normal so the chip floats off the paper and points at it. (Supersedes the earlier M6.5 removal above.)

- [x] **Wedge / cut-edge / lasso colour synced to the selected swatch.** `WedgeEditor.setPaperColor`
  drives `paperFill` (and a slightly darker `lassoStroke`); `EditorEngine.setPaperStock` /
  `loadDesignState` forward `colorBack`. `wireUi.tsx` seeds it from the initially-selected preset on
  mount so the first paint matches the swatch instead of the hardcoded default.

- [x] **Crisp initial paper texture.** `PaperTextureBaker.waitForRender` now waits for the
  paper-shaders canvas to reach target resolution before snapshotting, so a tiny first frame isn't
  upscaled into the 1024² map (which looked blurry on cold load).

- [ ] **Loading splash screen before first render.** Texture bake and colour application are async, so
  on cold load the editor briefly shows a flat/unstyled wedge before the baked texture and selected
  colour land. Add a lightweight splash/loading screen that gates the editor reveal until the first
  paper-shaders bake has completed (e.g. resolve on the first `onBaked`), so the user never sees the
  unstyled intermediate state.

## Design system & UI polish

- [x] **CSS design tokens.** `src/index.css` — full token set added to `:root`: two font families
  (`--font\/serif`, `--font\/mono`), 15-style typography scale (`--typography\/<name>\/size` +
  `\/letter-spacing`), three elevation box-shadows (`--elevation\/1–3`), and an SDS compat alias.
  All UI components (`Button`, `Toolbar`, `TopBar`, `PreviewTopBar`, `InstructionsCard`,
  `PreviewPanel`) now reference these tokens rather than hardcoded values.

- [x] **Editor ↔ Preview fade transition.** `wireUi.tsx` — both screens stay mounted; the top bar
  uses full-coverage `position:absolute` wrappers (no canvas underneath) and the main-area chrome
  uses zero-height wrappers so they don't occupy any hit-testable area. `opacity` + `visibility`
  transition at 250 ms; `visibility:hidden` gates the entire inactive subtree's interactivity.
