import { useCallback, useMemo, useState } from "react";
import PadColorGrid from "./components/PadColorGrid";
import { useWebMIDI } from "./hooks/useWebMIDI";

const padDefaults: Record<number, { r: number; g: number; b: number }> = {
  21: { r: 64, g: 16, b: 16 },
  22: { r: 16, g: 64, b: 32 },
  23: { r: 60, g: 32, b: 64 },
  24: { r: 32, g: 60, b: 64 },
  25: { r: 16, g: 64, b: 64 },
  26: { r: 12, g: 40, b: 72 },
  27: { r: 64, g: 8, b: 64 },
  28: { r: 80, g: 40, b: 12 }
};

export default function App() {
  const { status, outputs, sendPadColor, sendOled } = useWebMIDI();
  const [activePad, setActivePad] = useState(21);
  const [color, setColor] = useState(padDefaults[21]);
  const [oled, setOled] = useState({ line1: "Chord", line2: "Ready" });

  const onSelectPad = useCallback(
    (pad: number) => {
      setActivePad(pad);
      setColor(padDefaults[pad] ?? { r: 48, g: 48, b: 48 });
    },
    []
  );

  const updateColor = useCallback(
    (partial: Partial<typeof color>) => {
      setColor((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const pushPadColor = useCallback(() => {
    sendPadColor({ pad: activePad, ...color });
  }, [activePad, color, sendPadColor]);

  const pushOled = useCallback(() => {
    sendOled(oled);
  }, [oled, sendOled]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "unsupported":
        return "Web MIDI not supported";
      case "denied":
        return "Access denied";
      case "ready":
        return outputs.length > 0 ? `${outputs.length} output(s)` : "No outputs found";
      default:
        return "Requesting access";
    }
  }, [outputs.length, status]);

  return (
    <main>
      <header>
        <h1>MiniLab 3 Live Surface</h1>
        <p>
          Manage pad colours, OLED text and performance cues for the Python engine. Changes send SysEx data directly to connected
          MiniLab hardware via WebMIDI.
        </p>
        <span className="status-chip" data-connected={status === "ready" && outputs.length > 0}>
          <span aria-hidden>●</span>
          {statusLabel}
        </span>
      </header>

      <PadColorGrid activePad={activePad} color={color} onSelect={onSelectPad} onPreview={sendPadColor} />

      <section className="controls">
        <div>
          <h2>Pad Colour</h2>
          <p>Adjust the RGB components (0-127) to match the desired pad appearance on the MiniLab.</p>
          <div className="rgb-sliders">
            {["r", "g", "b"].map((channel) => (
              <label key={channel}>
                {channel.toUpperCase()}
                <input
                  type="range"
                  min={0}
                  max={127}
                  value={color[channel as keyof typeof color]}
                  onChange={(event) => updateColor({ [channel]: Number(event.target.value) })}
                />
              </label>
            ))}
          </div>
          <button className="primary" type="button" onClick={pushPadColor} disabled={status !== "ready"}>
            Send Pad Colour
          </button>
        </div>

        <div>
          <h2>OLED Lines</h2>
          <p>Push realtime overlays to the MiniLab’s dual-line display.</p>
          <div className="oled-inputs">
            <label>
              Line 1
              <input
                type="text"
                maxLength={16}
                value={oled.line1}
                onChange={(event) => setOled((prev) => ({ ...prev, line1: event.target.value }))}
              />
            </label>
            <label>
              Line 2
              <input
                type="text"
                maxLength={16}
                value={oled.line2}
                onChange={(event) => setOled((prev) => ({ ...prev, line2: event.target.value }))}
              />
            </label>
          </div>
          <button className="primary" type="button" onClick={pushOled} disabled={status !== "ready"}>
            Send OLED Text
          </button>
        </div>
      </section>
    </main>
  );
}
