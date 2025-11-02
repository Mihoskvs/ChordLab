import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export type NormalizedMidiEvent =
  | { type: 'noteon'; channel: number; note: number; velocity: number; timestamp: number }
  | { type: 'noteoff'; channel: number; note: number; velocity: number; timestamp: number }
  | { type: 'cc'; channel: number; controller: number; value: number; timestamp: number };

type MessageCallback = (event: NormalizedMidiEvent, raw: MIDIMessageEvent) => void;

type MidiInput = MIDIInput;
type MidiOutput = MIDIOutput;
type MidiAccess = MIDIAccess;

type PendingAccess = Promise<void> | null;

const hasNavigatorMidi = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

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

function normalizeMessage(event: MIDIMessageEvent): NormalizedMidiEvent | null {
  const { data, timeStamp } = event;
  if (!data || data.length === 0) {
    return null;
  }

  let status = data[0];
  let dataIndex = 1;

  if (status < 0x80) {
    // Running status without explicit status byte – ignore for now.
    return null;
  }

  if (status >= 0xf0) {
    // System message (SysEx, clock, etc.) – ignore.
    return null;
  }

  const channel = status & 0x0f;
  const messageType = status & 0xf0;

  const readData = (count: number) => {
    const values: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const value = data[dataIndex];
      if (typeof value !== 'number') {
        return null;
      }
      values.push(value & 0x7f);
      dataIndex += 1;
    }
    return values;
  };

  switch (messageType) {
    case 0x80: {
      const values = readData(2);
      if (!values) return null;
      const [note, velocity] = values;
      return { type: 'noteoff', channel, note, velocity, timestamp: timeStamp };
    }
    case 0x90: {
      const values = readData(2);
      if (!values) return null;
      const [note, velocity] = values;
      if (velocity === 0) {
        return { type: 'noteoff', channel, note, velocity: 0, timestamp: timeStamp };
      }
      return { type: 'noteon', channel, note, velocity, timestamp: timeStamp };
    }
    case 0xb0: {
      const values = readData(2);
      if (!values) return null;
      const [controller, value] = values;
      return { type: 'cc', channel, controller, value, timestamp: timeStamp };
    }
    default:
      return null;
  }
}

function sendRaw(output: MidiOutput, bytes: number[], timestamp?: number) {
  const payload = new Uint8Array(bytes.map((value) => Math.max(0, Math.min(127, value))));
  output.send(payload, timestamp);
}

export interface WebMIDIHandle {
  status: MidiStatus;
  inputs: MidiInput[];
  outputs: MidiOutput[];
  requestAccess: () => Promise<void>;
  onMessage: (callback: MessageCallback) => () => void;
  sendPadColor: (payload: PadColorPayload, targetId?: string) => void;
  sendOled: (payload: OledPayload, targetId?: string) => void;
  sendCC: (opts: { controller: number; value: number; channel?: number; targetId?: string; timestamp?: number }) => void;
  sendNoteOn: (opts: { note: number; velocity?: number; channel?: number; targetId?: string; timestamp?: number }) => void;
  sendNoteOff: (opts: { note: number; velocity?: number; channel?: number; targetId?: string; timestamp?: number }) => void;
}

export function useWebMIDI(): WebMIDIHandle {
  const [status, setStatus] = useState<MidiStatus>('idle');
  const [inputs, setInputs] = useState<MidiInput[]>([]);
  const [outputs, setOutputs] = useState<MidiOutput[]>([]);

  const callbacksRef = useRef(new Set<MessageCallback>());
  const accessRef = useRef<MidiAccess | null>(null);
  const detachRef = useRef(new Map<string, () => void>());
  const pendingRef = useRef<PendingAccess>(null);

  const handleMessage = useCallback(
    (event: MIDIMessageEvent) => {
      const normalized = normalizeMessage(event);
      if (!normalized) return;
      // Mirror to console for easy inspection during development.
      // eslint-disable-next-line no-console
      console.log('[MIDI]', normalized);
      callbacksRef.current.forEach((cb) => {
        try {
          cb(normalized, event);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('MIDI callback error', error);
        }
      });
    },
    [],
  );

  const detachAllInputs = useCallback(() => {
    detachRef.current.forEach((detach) => detach());
    detachRef.current.clear();
  }, []);

  const syncPorts = useCallback(
    (access: MidiAccess) => {
      const nextInputs = Array.from(access.inputs.values());
      const nextOutputs = Array.from(access.outputs.values());
      setInputs(nextInputs);
      setOutputs(nextOutputs);

      const seen = new Set<string>();
      nextInputs.forEach((input) => {
        seen.add(input.id);
        if (!detachRef.current.has(input.id)) {
          const handler = (event: MIDIMessageEvent) => handleMessage(event);
          if (typeof input.addEventListener === 'function') {
            input.addEventListener('midimessage', handler);
          } else {
            (input as MIDIInput).onmidimessage = handler;
          }
          detachRef.current.set(input.id, () => {
            if (typeof input.removeEventListener === 'function') {
              input.removeEventListener('midimessage', handler);
            } else if ((input as MIDIInput).onmidimessage === handler) {
              (input as MIDIInput).onmidimessage = null;
            }
          });
        }
      });

      Array.from(detachRef.current.keys()).forEach((id) => {
        if (!seen.has(id)) {
          const detach = detachRef.current.get(id);
          if (detach) detach();
          detachRef.current.delete(id);
        }
      });
    },
    [handleMessage],
  );

  const requestAccess = useCallback(async () => {
    if (!hasNavigatorMidi) {
      setStatus('unsupported');
      return;
    }
    if (status === 'ready') return;
    if (pendingRef.current) {
      await pendingRef.current;
      return;
    }
    setStatus('requesting');

    const requestPromise = navigator
      .requestMIDIAccess({ sysex: true })
      .then((access) => {
        accessRef.current = access;
        syncPorts(access);
        access.onstatechange = () => syncPorts(access);
        setStatus('ready');
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('requestMIDIAccess failed', error);
        setStatus(error && error.name === 'SecurityError' ? 'denied' : 'denied');
      })
      .finally(() => {
        pendingRef.current = null;
      });

    pendingRef.current = requestPromise;
    await requestPromise;
  }, [status, syncPorts]);

  useEffect(() => () => {
    detachAllInputs();
  }, [detachAllInputs]);

  const onMessage = useCallback((callback: MessageCallback) => {
    callbacksRef.current.add(callback);
    return () => {
      callbacksRef.current.delete(callback);
    };
  }, []);

  const withTargets = useCallback(
    (targetId?: string) => {
      if (!targetId) {
        return outputs;
      }
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

  const sendCC = useCallback(
    ({ controller, value, channel = 0, targetId, timestamp }: { controller: number; value: number; channel?: number; targetId?: string; timestamp?: number }) => {
      const cc = Math.max(0, Math.min(127, controller | 0));
      const data = [0xb0 | (channel & 0x0f), cc, Math.max(0, Math.min(127, Math.round(value)))];
      withTargets(targetId).forEach((output) => sendRaw(output, data, timestamp));
    },
    [withTargets],
  );

  const sendNoteOn = useCallback(
    ({ note, velocity = 96, channel = 0, targetId, timestamp }: { note: number; velocity?: number; channel?: number; targetId?: string; timestamp?: number }) => {
      const data = [0x90 | (channel & 0x0f), Math.max(0, Math.min(127, Math.round(note))), Math.max(0, Math.min(127, Math.round(velocity)))];
      withTargets(targetId).forEach((output) => sendRaw(output, data, timestamp));
    },
    [withTargets],
  );

  const sendNoteOff = useCallback(
    ({ note, velocity = 0, channel = 0, targetId, timestamp }: { note: number; velocity?: number; channel?: number; targetId?: string; timestamp?: number }) => {
      const data = [0x80 | (channel & 0x0f), Math.max(0, Math.min(127, Math.round(note))), Math.max(0, Math.min(127, Math.round(velocity)))];
      withTargets(targetId).forEach((output) => sendRaw(output, data, timestamp));
    },
    [withTargets],
  );

  return useMemo(
    () => ({
      status,
      inputs,
      outputs,
      requestAccess,
      onMessage,
      sendPadColor,
      sendOled,
      sendCC,
      sendNoteOn,
      sendNoteOff,
    }),
    [inputs, onMessage, outputs, requestAccess, sendCC, sendNoteOff, sendNoteOn, sendOled, sendPadColor, status],
  );
}
