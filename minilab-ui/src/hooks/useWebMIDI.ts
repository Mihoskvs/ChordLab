import { useCallback, useEffect, useMemo, useState } from "react";

const SYSEX_ID = [0x00, 0x20, 0x6b, 0x7f, 0x42, 0x02, 0x02, 0x16];

export type MidiStatus = "idle" | "unsupported" | "denied" | "ready";

export interface PadColorPayload {
  pad: number;
  r: number;
  g: number;
  b: number;
}

export interface OledPayload {
  line1: string;
  line2: string;
}

const padSysex = ({ pad, r, g, b }: PadColorPayload) =>
  new Uint8Array([0xf0, ...SYSEX_ID, pad, r, g, b, 0xf7]);

const encodeLine = (text: string) => {
  const truncated = text.slice(0, 16);
  const ascii = Array.from(truncated).map((ch) => ch.charCodeAt(0) & 0x7f);
  const padding = new Array(16 - ascii.length).fill(0x20);
  return [...ascii, ...padding];
};

const oledSysex = ({ line1, line2 }: OledPayload) =>
  new Uint8Array([
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
    0xf7
  ]);

export function useWebMIDI() {
  const [status, setStatus] = useState<MidiStatus>("idle");
  const [outputs, setOutputs] = useState<WebMidi.MIDIOutput[]>([]);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setStatus("unsupported");
      return;
    }

    navigator
      .requestMIDIAccess({ sysex: true })
      .then((access) => {
        const updateOutputs = () => {
          setOutputs(Array.from(access.outputs.values()));
        };
        updateOutputs();
        access.onstatechange = updateOutputs;
        setStatus("ready");
      })
      .catch(() => setStatus("denied"));
  }, []);

  const sendPadColor = useCallback(
    (payload: PadColorPayload) => {
      outputs.forEach((output) => output.send(padSysex(payload)));
    },
    [outputs]
  );

  const sendOled = useCallback(
    (payload: OledPayload) => {
      outputs.forEach((output) => output.send(oledSysex(payload)));
    },
    [outputs]
  );

  return useMemo(
    () => ({ status, outputs, sendPadColor, sendOled }),
    [outputs, sendOled, sendPadColor, status]
  );
}
