import { useCallback, useMemo, useState } from 'react';
import PadColorGrid, { PadDefinition } from './components/PadColorGrid';
import { useWebMIDI } from './hooks/useWebMIDI';

type Rgb = { r: number; g: number; b: number };

const PAD_LAYOUT: PadDefinition[] = [
  { pad: 21, label: 'maj' },
  { pad: 22, label: 'min' },
  { pad: 23, label: 'maj7' },
  { pad: 24, label: 'min7' },
  { pad: 25, label: 'sus2' },
  { pad: 26, label: 'sus4' },
  { pad: 27, label: 'dim' },
  { pad: 28, label: 'aug' },
];

const DEFAULT_PAD_COLORS: Record<number, Rgb> = {
  21: { r: 64, g: 16, b: 16 },
  22: { r: 16, g: 64, b: 32 },
  23: { r: 60, g: 32, b: 64 },
  24: { r: 32, g: 60, b: 64 },
  25: { r: 16, g: 64, b: 64 },
  26: { r: 12, g: 40, b: 72 },
  27: { r: 64, g: 8, b: 64 },
  28: { r: 80, g: 40, b: 12 },
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function duplicatePalette(): Record<number, Rgb> {
  return Object.fromEntries(
    PAD_LAYOUT.map(({ pad }) => {
      const preset = DEFAULT_PAD_COLORS[pad] ?? { r: 48, g: 48, b: 48 };
      return [pad, { ...preset }];
    }),
  );
}

export default function App(): JSX.Element {
  const { status, outputs, sendPadColor, sendOled } = useWebMIDI();
  const [selectedOutputId, setSelectedOutputId] = useState<string>('');
  const [padColors, setPadColors] = useState<Record<number, Rgb>>(duplicatePalette);
  const [activePad, setActivePad] = useState<number>(PAD_LAYOUT[0]?.pad ?? 21);
  const [oled, setOled] = useState({ line1: 'ChordLab', line2: 'MiniLab 3' });

  const activeColor = padColors[activePad];
  const midiReady = status === 'ready' && outputs.length > 0;
  const selectedOutput = outputs.find((output) => output.id === selectedOutputId) ?? null;

  const statusLabel = useMemo(() => {
    if (status === 'unsupported') return 'WebMIDI not supported';
    if (status === 'denied') return 'MIDI access denied';
    if (status === 'ready') {
      if (!outputs.length) return 'No MIDI outputs detected';
      return selectedOutput ? `Connected: ${selectedOutput.name}` : `${outputs.length} output(s) available`;
    }
    return 'Awaiting browser permission…';
  }, [outputs.length, selectedOutput, status]);

  const handleSelectPad = useCallback((pad: number) => {
    setActivePad(pad);
  }, []);

  const updateColor = useCallback(
    (channel: keyof Rgb, value: number) => {
      setPadColors((current) => {
        const currentColor = current[activePad] ?? { r: 48, g: 48, b: 48 };
        return {
          ...current,
          [activePad]: {
            ...currentColor,
            [channel]: clamp(value, 0, 127),
          },
        };
      });
    },
    [activePad],
  );

  const previewPad = useCallback(
    (pad: number) => {
      const color = padColors[pad];
      if (!color) return;
      sendPadColor({ pad, ...color }, selectedOutputId || undefined);
    },
    [padColors, selectedOutputId, sendPadColor],
  );

  const sendActivePad = useCallback(() => {
    const color = padColors[activePad];
    if (!color) return;
    sendPadColor({ pad: activePad, ...color }, selectedOutputId || undefined);
  }, [activePad, padColors, selectedOutputId, sendPadColor]);

  const sendFullPalette = useCallback(() => {
    PAD_LAYOUT.forEach(({ pad }) => {
      const color = padColors[pad];
      if (!color) return;
      sendPadColor({ pad, ...color }, selectedOutputId || undefined);
    });
  }, [padColors, selectedOutputId, sendPadColor]);

  const resetPalette = useCallback(() => {
    setPadColors(duplicatePalette());
  }, []);

  const sendOledText = useCallback(() => {
    sendOled(oled, selectedOutputId || undefined);
  }, [oled, selectedOutputId, sendOled]);

  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>MiniLab 3 Performance Surface</h1>
          <p>
            Tweak pad LEDs, push OLED overlays, and mirror the chord-map described in the hardware brief. Chrome or Edge is
            required for WebMIDI access.
          </p>
        </div>
        <span className="status-chip" data-ready={midiReady}>
          <span aria-hidden>●</span>
          {statusLabel}
        </span>
      </header>

      <section className="connection">
        <label>
          MIDI Output
          <select value={selectedOutputId} onChange={(event) => setSelectedOutputId(event.target.value)} disabled={!outputs.length}>
            <option value="">Send to all available outputs</option>
            {outputs.map((output) => (
              <option key={output.id} value={output.id}>
                {output.name}
              </option>
            ))}
          </select>
        </label>
        {!midiReady && <p className="hint">Grant MIDI access in the browser prompt to enable SysEx messaging.</p>}
      </section>

      <PadColorGrid
        pads={PAD_LAYOUT}
        activePad={activePad}
        padColors={padColors}
        onSelect={handleSelectPad}
        onPreview={previewPad}
      />

      <section className="control-panel">
        <div className="panel">
          <h2>LED Colour</h2>
          <p>Pad LEDs accept 0–127 RGB values. Adjust the sliders and push the update to sync with the hardware.</p>
          <div className="rgb-sliders">
            {(['r', 'g', 'b'] as (keyof Rgb)[]).map((key) => (
              <label key={key}>
                {key.toUpperCase()}
                <input
                  type="range"
                  min={0}
                  max={127}
                  value={activeColor?.[key] ?? 0}
                  onChange={(event) => updateColor(key, Number(event.target.value))}
                />
                <span>{activeColor?.[key] ?? 0}</span>
              </label>
            ))}
          </div>
          <div className="button-row">
            <button type="button" onClick={sendActivePad} disabled={!midiReady}>
              Send Selected Pad
            </button>
            <button type="button" onClick={sendFullPalette} disabled={!midiReady}>
              Broadcast Chord Palette
            </button>
            <button type="button" onClick={resetPalette}>
              Reset Palette
            </button>
          </div>
        </div>

        <div className="panel">
          <h2>OLED Lines</h2>
          <p>Both lines accept up to 16 ASCII characters and are truncated automatically.</p>
          <div className="oled-fields">
            <label>
              Line 1
              <input
                type="text"
                maxLength={16}
                value={oled.line1}
                onChange={(event) => setOled((current) => ({ ...current, line1: event.target.value }))}
              />
            </label>
            <label>
              Line 2
              <input
                type="text"
                maxLength={16}
                value={oled.line2}
                onChange={(event) => setOled((current) => ({ ...current, line2: event.target.value }))}
              />
            </label>
          </div>
          <button type="button" onClick={sendOledText} disabled={!midiReady}>
            Send OLED Text
          </button>
        </div>
      </section>

      <footer>
        <h2>Pad → Chord Map</h2>
        <p>The MiniLab’s pads send notes 36–43 on channel 9. The palette mirrors the chord engine defaults:</p>
        <ul>
          {PAD_LAYOUT.map(({ pad, label }) => (
            <li key={pad}>
              Pad {pad}: <strong>{label.toUpperCase()}</strong>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}
