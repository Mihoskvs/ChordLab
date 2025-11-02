import { useMemo } from 'react';
import type { PadDeviceMapping } from '../color-presets';

type PadColour = { r: number; g: number; b: number };

interface PadColorGridProps {
  pads: readonly PadDeviceMapping[];
  activePadIndex: number;
  padColors: Record<number, PadColour>;
  onSelect: (pad: PadDeviceMapping) => void;
  onPreview: (pad: PadDeviceMapping) => void;
  learnTargetIndex?: number | null;
}

const cssRgb = ({ r, g, b }: PadColour) => {
  const to255 = (value: number) => Math.min(Math.max(Math.round(value), 0), 127) * 2;
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
};

export default function PadColorGrid({ pads, activePadIndex, padColors, onSelect, onPreview, learnTargetIndex = null }: PadColorGridProps): JSX.Element {
  const activeColour = padColors[pads[activePadIndex]?.padValue ?? -1];
  const highlightFill = useMemo(() => {
    if (!activeColour) return undefined;
    const base = cssRgb(activeColour);
    return `linear-gradient(135deg, ${base}, rgba(99, 102, 241, 0.55))`;
  }, [activeColour]);

  return (
    <section className="pad-section">
      <div className="pad-section__intro">
        <h2>Pad Chord Palette</h2>
        <p>Select a pad to edit its LED colour. Hardware presses will mirror here automatically.</p>
      </div>
      <div className="pad-grid">
        {pads.map((pad) => {
          const colour = padColors[pad.padValue] ?? { r: 48, g: 48, b: 48 };
          const isActive = pad.uiIndex === activePadIndex;
          const isLearning = learnTargetIndex === pad.uiIndex;
          return (
            <button
              key={pad.padValue}
              type="button"
              className="pad-button"
              data-active={isActive}
              data-learning={isLearning}
              style={{ background: isActive && highlightFill ? highlightFill : undefined }}
              onClick={() => onSelect(pad)}
              onMouseUp={() => onPreview(pad)}
              onTouchEnd={() => onPreview(pad)}
            >
              <span className="pad-label">Pad {pad.padValue}</span>
              <span className="pad-chord">{pad.label.toUpperCase()}</span>
              <span className="pad-colour" style={{ background: cssRgb(colour) }} aria-hidden />
              {isLearning ? <span className="pad-learning">Learning…</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
