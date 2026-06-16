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
  'coral-red': '#c95c4a',
  'dusty-rose': '#c97a7a',
  'blush-pink': '#d4a0a0',
  'warm-lavender': '#b8a8c8',
  'soft-purple': '#9a8ab0',
  'muted-violet': '#8878a0',
  'steel-blue': '#8898b8',
  'powder-blue': '#a8bed0',
  'pale-sky': '#c0d0dc',
  'sage-green': '#9aaa90',
  'olive-green': '#8a9878',
  'moss-green': '#7a8a68',
  'warm-taupe': '#b8a890',
  'golden-sand': '#c8b080',
  'dusty-gold': '#b89a60',
  'warm-ivory': '#d8c8b0',
};
