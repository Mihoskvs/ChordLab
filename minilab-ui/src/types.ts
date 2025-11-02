export type PadColorName = 'accent' | 'muted' | 'highlight' | 'dark';

export interface PadColorUpdate {
  pad: string;
  color: PadColorName;
}
