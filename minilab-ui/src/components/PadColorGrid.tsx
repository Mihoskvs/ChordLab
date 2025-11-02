import { useMemo } from "react";
import type { PadColorPayload } from "../hooks/useWebMIDI";

const PAD_LABELS = [
  { pad: 21, label: "Maj" },
  { pad: 22, label: "Min" },
  { pad: 23, label: "Maj7" },
  { pad: 24, label: "Min7" },
  { pad: 25, label: "Sus2" },
  { pad: 26, label: "Sus4" },
  { pad: 27, label: "Dim" },
  { pad: 28, label: "Aug" }
];

export interface PadColorGridProps {
  activePad: number;
  color: { r: number; g: number; b: number };
  onSelect: (pad: number) => void;
  onPreview: (payload: PadColorPayload) => void;
}

export function PadColorGrid({ activePad, color, onSelect, onPreview }: PadColorGridProps) {
  const gradient = useMemo(
    () => `linear-gradient(135deg, rgba(${color.r * 2}, ${color.g * 2}, ${color.b * 2}, 0.8), rgba(14, 165, 233, 0.65))`,
    [color]
  );

  return (
    <section>
      <h2>Pad Chord Palette</h2>
      <p>Choose a pad and adjust the LED colour that mirrors the harmonic type on the hardware.</p>
      <div className="grid pad-grid">
        {PAD_LABELS.map(({ pad, label }) => (
          <button
            key={pad}
            className="pad-button"
            data-active={pad === activePad}
            style={{ background: pad === activePad ? gradient : undefined }}
            onClick={() => onSelect(pad)}
            onMouseUp={() => onPreview({ pad, ...color })}
            onTouchEnd={() => onPreview({ pad, ...color })}
            type="button"
          >
            <strong>Pad {pad}</strong>
            <span>{label}</span>
            <div className="color-preview" style={{ background: `rgb(${color.r * 2}, ${color.g * 2}, ${color.b * 2})` }} />
          </button>
        ))}
      </div>
    </section>
  );
}

export default PadColorGrid;
