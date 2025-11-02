import { useMemo } from 'react';

type PadColour = { r: number; g: number; b: number };

export interface PadDefinition {
  pad: number;
  label: string;
}

interface PadColorGridProps {
  pads: readonly PadDefinition[];
  activePad: number;
  padColors: Record<number, PadColour>;
  onSelect: (pad: number) => void;
  onPreview: (pad: number) => void;
}

const cssRgb = ({ r, g, b }: PadColour) => {
  const to255 = (value: number) => Math.min(Math.max(Math.round(value * 2), 0), 254);
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
};

export default function PadColorGrid({ pads, activePad, padColors, onSelect, onPreview }: PadColorGridProps): JSX.Element {
  const activeColor = padColors[activePad];
  const highlightFill = useMemo(() => {
    if (!activeColor) return undefined;
    const base = cssRgb(activeColor);
    return `linear-gradient(135deg, ${base}, rgba(99, 102, 241, 0.55))`;
  }, [activeColor]);

  return (
    <section className="pad-section">
      <div className="pad-section__intro">
        <h2>Pad Chord Palette</h2>
        <p>Select the pad that maps to each chord type. Preview taps will immediately send the LED colour via SysEx.</p>
      </div>
      <div className="pad-grid">
        {pads.map(({ pad, label }) => {
          const colour = padColors[pad] ?? { r: 48, g: 48, b: 48 };
          return (
            <button
              key={pad}
              type="button"
              className="pad-button"
              data-active={pad === activePad}
              style={{ background: pad === activePad && highlightFill ? highlightFill : undefined }}
              onClick={() => onSelect(pad)}
              onMouseUp={() => onPreview(pad)}
              onTouchEnd={() => onPreview(pad)}
            >
              <span className="pad-label">Pad {pad}</span>
              <span className="pad-chord">{label.toUpperCase()}</span>
              <span className="pad-colour" style={{ background: cssRgb(colour) }} aria-hidden />
            </button>
          );
        })}
      </div>
    </section>
  );
}

