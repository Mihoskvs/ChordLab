import { useCallback, useEffect, useMemo, useState } from 'react';
import { padIds, padPalette, presetPadColors } from './color-presets';
import type { PadColorUpdate } from './types';

const PAD_LABELS = [
  'maj',
  'min',
  'maj7',
  'min7',
  'sus2',
  'sus4',
  'dim',
  'aug',
];

function supportsWebMIDI(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

export default function App() {
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<string>('');
  const [oledLines, setOledLines] = useState<[string, string]>(['ChordLab', 'MiniLab 3']);
  const [pendingUpdates, setPendingUpdates] = useState<PadColorUpdate[]>(presetPadColors);

  useEffect(() => {
    if (!supportsWebMIDI()) {
      return;
    }
    navigator.requestMIDIAccess({ sysex: true }).then(setMidiAccess).catch((error) => {
      console.error('Failed to get MIDI access', error);
    });
  }, []);

  const outputs = useMemo(() => {
    if (!midiAccess) return [];
    return Array.from(midiAccess.outputs.values());
  }, [midiAccess]);

  const sendSysex = useCallback(
    (data: Uint8Array | number[]) => {
      if (!midiAccess) return;
      const output = midiAccess.outputs.get(selectedOutput);
      if (!output) return;
      const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
      output.send(payload);
    },
    [midiAccess, selectedOutput],
  );

  const handlePadClick = useCallback(
    (padId: string) => {
      setPendingUpdates((current) =>
        current.map((entry) =>
          entry.pad === padId
            ? { ...entry, color: entry.color === 'accent' ? 'muted' : 'accent' }
            : entry,
        ),
      );
    },
    [],
  );

  const sendPadUpdates = useCallback(() => {
    const payload: number[] = [0xf0, 0x00, 0x20, 0x6b, 0x7f, 0x42, 0x02, 0x02, 0x16];
    pendingUpdates.forEach((entry) => {
      const padIndex = padIds.indexOf(entry.pad);
      if (padIndex === -1) return;
      const color = padPalette[entry.color];
      payload.push(0x15 + padIndex, color.r, color.g, color.b);
    });
    payload.push(0xf7);
    sendSysex(payload);
  }, [pendingUpdates, sendSysex]);

  const sendOledLines = useCallback(() => {
    const [line1, line2] = oledLines;
    const encodeLine = (line: string) => {
      const chars = line.slice(0, 16).split('');
      const encoded = chars.map((char) => char.charCodeAt(0) & 0x7f);
      while (encoded.length < 16) encoded.push(0x00);
      return encoded;
    };
    const payload = [
      0xf0,
      0x00,
      0x20,
      0x6b,
      0x7f,
      0x42,
      0x04,
      0x02,
      0x60,
      0x01,
      ...encodeLine(line1),
      ...encodeLine(line2),
      0xf7,
    ];
    sendSysex(payload);
  }, [oledLines, sendSysex]);

  return (
    <div className="app-shell">
      <header>
        <h1>MiniLab 3 Live Control</h1>
        <p>Send pad colors and OLED text via WebMIDI (Chrome / Edge only).</p>
      </header>

      {!supportsWebMIDI() ? (
        <p className="warning">Your browser does not support WebMIDI.</p>
      ) : (
        <section>
          <label>
            Output port
            <select value={selectedOutput} onChange={(event) => setSelectedOutput(event.target.value)}>
              <option value="">Select a port…</option>
              {outputs.map((output) => (
                <option key={output.id} value={output.id}>
                  {output.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="pad-grid">
        {padIds.map((padId, index) => {
          const entry = pendingUpdates.find((item) => item.pad === padId)!;
          return (
            <button
              key={padId}
              type="button"
              onClick={() => handlePadClick(padId)}
              className={`pad pad-${entry.color}`}
            >
              <span className="pad-label">{PAD_LABELS[index]}</span>
              <span className="pad-id">{padId.replace('PAD_', '')}</span>
            </button>
          );
        })}
      </section>

      <section className="actions">
        <button type="button" onClick={sendPadUpdates} disabled={!selectedOutput}>
          Send pad colors
        </button>
        <div className="oled">
          <label>
            OLED line 1
            <input
              value={oledLines[0]}
              maxLength={16}
              onChange={(event) => setOledLines([event.target.value, oledLines[1]])}
            />
          </label>
          <label>
            OLED line 2
            <input
              value={oledLines[1]}
              maxLength={16}
              onChange={(event) => setOledLines([oledLines[0], event.target.value])}
            />
          </label>
          <button type="button" onClick={sendOledLines} disabled={!selectedOutput}>
            Send OLED text
          </button>
        </div>
      </section>
    </div>
  );
}
