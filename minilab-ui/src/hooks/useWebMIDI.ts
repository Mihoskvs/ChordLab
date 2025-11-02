import { useCallback, useEffect, useMemo, useState } from 'react';

type MidiOutput = MIDIOutput;

const PAD_SYSEX_HEADER = [0x00, 0x20, 0x6b, 0x7f, 0x42, 0x02, 0x02, 0x16];

export type MidiStatus = 'idle' | 'requesting' | 'unsupported' | 'denied' | 'ready';

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

const padSysex = ({ pad, r, g, b }: PadColorPayload) => new Uint8Array([0xf0, ...PAD_SYSEX_HEADER, pad, r, g, b, 0xf7]);

const encodeLine = (text: string) => {
  const truncated = text.slice(0, 16);
  const ascii = Array.from(truncated).map((character) => character.charCodeAt(0) & 0x7f);
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
    0xf7,
  ]);

const hasNavigatorMidi = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

export function useWebMIDI() {
  const [status, setStatus] = useState<MidiStatus>('idle');
  const [outputs, setOutputs] = useState<MidiOutput[]>([]);

  useEffect(() => {
    if (!hasNavigatorMidi) {
      setStatus('unsupported');
      return;
    }

    setStatus('requesting');

    navigator
      .requestMIDIAccess({ sysex: true })
      .then((access) => {
        const updateOutputs = () => {
          setOutputs(Array.from(access.outputs.values()));
        };

        updateOutputs();
        access.onstatechange = updateOutputs;
        setStatus('ready');
      })
      .catch(() => setStatus('denied'));
  }, []);

  const withTargets = useCallback(
    (targetId?: string) => {
      if (!targetId) return outputs;
      return outputs.filter((output) => output.id === targetId);
    },
    [outputs],
  );

  const sendPadColor = useCallback(
    (payload: PadColorPayload, targetId?: string) => {
      withTargets(targetId).forEach((output) => output.send(padSysex(payload)));
    },
    [withTargets],
  );

  const sendOled = useCallback(
    (payload: OledPayload, targetId?: string) => {
      withTargets(targetId).forEach((output) => output.send(oledSysex(payload)));
    },
    [withTargets],
  );

  return useMemo(
    () => ({ status, outputs, sendPadColor, sendOled }),
    [outputs, sendOled, sendPadColor, status],
  );
}

