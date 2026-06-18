/**
 * UI-side paper presentation types (editor-chrome-spec.md §"New Types").
 *
 * `PaperProperties` is the chrome's view of the paper stock: a named colour + texture preset the
 * toolbar's Paper-Texture card reflects. `wireUi.tsx` maps `colorPreset` → a hex `colorFront` for the
 * engine's `setPaperStock`. This stays purely presentational — the engine never imports it.
 */

export type ColorPreset =
  | 'coral-red'
  | 'dusty-rose'
  | 'blush-pink'
  | 'warm-lavender'
  | 'soft-purple'
  | 'muted-violet'
  | 'steel-blue'
  | 'powder-blue'
  | 'pale-sky'
  | 'sage-green'
  | 'olive-green'
  | 'moss-green'
  | 'warm-taupe'
  | 'golden-sand'
  | 'dusty-gold'
  | 'warm-ivory';

export type TexturePreset = 'rice-paper' | 'washi' | 'cardstock';

export interface PaperProperties {
  colorPreset: ColorPreset;
  texturePreset: TexturePreset;
}

export const COLOR_PRESET_HEX: Record<ColorPreset, string> = {
  'coral-red': '#c85c4a',
  'dusty-rose': '#c07676',
  'blush-pink': '#d4a5a0',
  'warm-lavender': '#b8a8c8',
  'soft-purple': '#9a8ab0',
  'muted-violet': '#8875ad',
  'steel-blue': '#8090a4',
  'powder-blue': '#a4b8c4',
  'pale-sky': '#b8c8d4',
  'sage-green': '#8aa880',
  'olive-green': '#849878',
  'moss-green': '#789a68',
  'warm-taupe': '#b8a490',
  'golden-sand': '#c2a068',
  'dusty-gold': '#a89050',
  'warm-ivory': '#d0c0a0',
};
