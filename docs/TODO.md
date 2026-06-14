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
