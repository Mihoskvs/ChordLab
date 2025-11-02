import type { PadColorUpdate } from './types';

type PaletteName = 'accent' | 'muted' | 'highlight' | 'dark';

type PaletteMap = Record<PaletteName, { r: number; g: number; b: number }>;

export const padPalette: PaletteMap = {
  accent: { r: 120, g: 30, b: 5 },
  muted: { r: 12, g: 12, b: 12 },
  highlight: { r: 50, g: 80, b: 120 },
  dark: { r: 8, g: 8, b: 8 },
};

export const padIds = ['PAD_21', 'PAD_22', 'PAD_23', 'PAD_24', 'PAD_25', 'PAD_26', 'PAD_27', 'PAD_28'] as const;

export const presetPadColors: PadColorUpdate[] = padIds.map((padId, index) => ({
  pad: padId,
  color: index === 0 ? 'highlight' : 'muted',
}));
