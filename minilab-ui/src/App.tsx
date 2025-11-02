import { useEffect, useMemo, useState } from "react";
import { Slider } from "@radix-ui/react-slider";
import clsx from "clsx";

const DISPLAY_HEADER = [0xf0, 0x00, 0x20, 0x6b, 0x7f, 0x42, 0x04, 0x02, 0x60, 0x01];
const PAD_HEADER = [0xf0, 0x00, 0x20, 0x6b, 0x7f, 0x42, 0x02, 0x02, 0x16];
const SYSEX_END = 0xf7;
const PAD_IDS = Array.from({ length: 8 }, (_, index) => 36 + index);

function sanitize(text: string): string {
  return text
    .replace(/[^\x20-\x7e]/g, "")
    .padEnd(16, " ")
    .slice(0, 16);
}

function buildDisplaySysex(line1: string, line2: string): Uint8Array {
  const payload = [...DISPLAY_HEADER];
  sanitize(line1)
    .split("")
    .forEach((char) => payload.push(char.charCodeAt(0)));
  sanitize(line2)
    .split("")
    .forEach((char) => payload.push(char.charCodeAt(0)));
  payload.push(SYSEX_END);
  return new Uint8Array(payload);
}

function buildPadSysex(pad: number, color: [number, number, number]): Uint8Array {
  const payload = [...PAD_HEADER, pad, ...color.map((value) => Math.min(127, Math.max(0, Math.round(value))))];
  payload.push(SYSEX_END);
  return new Uint8Array(payload);
}

type MidiSelection = {
  outputId: string | null;
  outputs: WebMidi.MIDIOutputMap | null;
};

type PadState = {
  pad: number;
  color: [number, number, number];
};

const defaultPads: PadState[] = PAD_IDS.map((pad, index) => ({
  pad,
  color: [index * 12 + 20, 80, 40]
}));

function useMidiAccess() {
  const [access, setAccess] = useState<WebMidi.MIDIAccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigator
      .requestMIDIAccess({ sysex: true })
      .then((midi) => {
        setAccess(midi);
        midi.onstatechange = () => setAccess(Object.create(midi));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return { access, error };
}

function MidiSelect({
  selection,
  onChange
}: {
  selection: MidiSelection;
  onChange: (update: Partial<MidiSelection>) => void;
}) {
  const options = Array.from(selection.outputs?.values() ?? []);
  return (
    <label className="panel">
      <span className="label">MIDI Output</span>
      <select
        value={selection.outputId ?? ""}
        onChange={(event) => onChange({ outputId: event.target.value || null })}
      >
        <option value="">Select an output...</option>
        {options.map((output) => (
          <option key={output.id} value={output.id}>
            {output.name ?? output.id}
          </option>
        ))}
      </select>
    </label>
  );
}

function PadControl({ padState, onChange }: { padState: PadState; onChange: (pad: number, color: [number, number, number]) => void }) {
  const { pad, color } = padState;
  return (
    <div className="pad-control">
      <header>
        <span>Pad {pad - 35}</span>
        <span className="badge">MIDI {pad}</span>
      </header>
      {[0, 1, 2].map((channel) => (
        <div key={channel} className="slider-row">
          <span>{["R", "G", "B"][channel]}</span>
          <Slider
            className="slider"
            min={0}
            max={127}
            value={[color[channel]]}
            onValueChange={(value) => {
              const next: [number, number, number] = [...color] as [number, number, number];
              next[channel] = value[0];
              onChange(pad, next);
            }}
          />
          <span className="value">{color[channel]}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const { access, error } = useMidiAccess();
  const [selection, setSelection] = useState<MidiSelection>({ outputId: null, outputs: null });
  const [line1, setLine1] = useState("ChordLab");
  const [line2, setLine2] = useState("MiniLab-3");
  const [pads, setPads] = useState<PadState[]>(defaultPads);
  const output = useMemo(() => selection.outputs?.get(selection.outputId ?? "") ?? null, [selection]);

  useEffect(() => {
    if (access) {
      setSelection((current) => ({ ...current, outputs: access.outputs }));
    }
  }, [access]);

  function sendDisplay() {
    if (!output) return;
    output.send(buildDisplaySysex(line1, line2));
  }

  function updatePad(pad: number, color: [number, number, number]) {
    setPads((current) => current.map((item) => (item.pad === pad ? { ...item, color } : item)));
  }

  function sendPads() {
    if (!output) return;
    pads.forEach((pad) => {
      output.send(buildPadSysex(pad.pad, pad.color));
    });
  }

  return (
    <main className="layout">
      <section className="left">
        <h1>MiniLab 3 Control Surface</h1>
        <p className="description">
          Configure the OLED display and pad colors via WebMIDI. Connect Chrome/Edge, enable the IAC bridge, and select your MiniLab 3 output.
        </p>
        {error ? <p className="error">WebMIDI unavailable: {error}</p> : null}
        <MidiSelect
          selection={selection}
          onChange={(update) => setSelection((current) => ({ ...current, ...update }))}
        />
        <div className="panel">
          <span className="label">OLED Lines</span>
          <input value={line1} maxLength={16} onChange={(event) => setLine1(event.target.value)} />
          <input value={line2} maxLength={16} onChange={(event) => setLine2(event.target.value)} />
          <button type="button" className={clsx("primary", { disabled: !output })} onClick={sendDisplay} disabled={!output}>
            Send to Display
          </button>
        </div>
        <div className="panel">
          <span className="label">Pad Colors</span>
          <div className="pad-grid">
            {pads.map((pad) => (
              <PadControl key={pad.pad} padState={pad} onChange={updatePad} />
            ))}
          </div>
          <button type="button" className={clsx("primary", { disabled: !output })} onClick={sendPads} disabled={!output}>
            Push Pad Colors
          </button>
        </div>
      </section>
      <aside className="right">
        <h2>Workflow Tips</h2>
        <ol>
          <li>Open Chrome with the <strong>--enable-experimental-web-platform-features</strong> flag.</li>
          <li>Connect the Arturia MiniLab 3 and ensure it is visible as a MIDI output.</li>
          <li>Select the output port and customise OLED/pad feedback to match your set.</li>
        </ol>
        <div className="status">
          <span className={clsx("dot", { online: !!output })} />
          <span>{output ? `Connected to ${output.name ?? output.id}` : "No MIDI output selected"}</span>
        </div>
      </aside>
    </main>
  );
}
