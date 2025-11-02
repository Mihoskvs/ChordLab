import type { PadColorName, PadColorUpdate } from './types';

export const padPalette: Record<PadColorName, { r: number; g: number; b: number }> = {
  accent: { r: 120, g: 30, b: 5 },
  muted: { r: 12, g: 12, b: 12 },
  highlight: { r: 50, g: 80, b: 120 },
  dark: { r: 8, g: 8, b: 8 },
};

export const PAD_IDS = ['PAD_21', 'PAD_22', 'PAD_23', 'PAD_24', 'PAD_25', 'PAD_26', 'PAD_27', 'PAD_28'] as const;
export const PAD_LABELS = ['maj', 'min', 'maj7', 'min7', 'sus2', 'sus4', 'dim', 'aug'] as const;
export const PAD_DEVICE_NOTES = [36, 37, 38, 39, 40, 41, 42, 43] as const;
export const PAD_DEVICE_CHANNEL = 8; // zero-based MIDI channel (9 in 1-indexed view)

export interface PadDeviceMapping {
  uiIndex: number;
  padId: typeof PAD_IDS[number];
  padValue: number;
  label: string;
  note: number;
  channel: number;
}

export const PAD_MAPPINGS: PadDeviceMapping[] = PAD_IDS.map((padId, index) => ({
  uiIndex: index,
  padId,
  padValue: 21 + index,
  label: PAD_LABELS[index],
  note: PAD_DEVICE_NOTES[index],
  channel: PAD_DEVICE_CHANNEL,
}));

export const presetPadColors: PadColorUpdate[] = PAD_IDS.map((padId, index) => ({
  pad: padId,
  color: index === 0 ? 'highlight' : 'muted',
}));
