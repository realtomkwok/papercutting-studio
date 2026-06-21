/**
 * PreviewPanel — top-right preview frame (editor-chrome-spec.md §PreviewPanel). A placeholder until
 * the engine exposes a picture-in-picture render target; scales down on narrow viewports.
 */

export function PreviewPanel() {
  return (
    <div className="absolute top-3 right-3 w-[min(240px,28vw)] aspect-square bg-card border border-border flex items-center justify-center">
      <span className="font-serif text-button tracking-button uppercase text-border">Preview</span>
    </div>
  );
}
