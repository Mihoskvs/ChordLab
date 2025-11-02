import { useSyncExternalStore } from 'react';
import type { EncoderMode } from './encoders';
import type { ParamKey } from '../paramsStore';

const STORAGE_KEY = 'chordlab.midiMapping.v1';

type ControlKind = 'pad' | 'slider' | 'encoder';

export type LogicalControl =
  | { kind: 'pad'; index: number }
  | { kind: 'slider'; id: ParamKey }
  | { kind: 'encoder'; controller: number };

export type MidiBinding =
  | { type: 'note'; note: number; channel: number }
  | { type: 'cc'; controller: number; channel: number; encoderMode?: EncoderMode; target?: ParamKey };

export type MappingState = Record<string, MidiBinding>;

const DEFAULT_MAPPING: MappingState = {
  'pad:0': { type: 'note', note: 36, channel: 8 },
  'pad:1': { type: 'note', note: 37, channel: 8 },
  'pad:2': { type: 'note', note: 38, channel: 8 },
  'pad:3': { type: 'note', note: 39, channel: 8 },
  'pad:4': { type: 'note', note: 40, channel: 8 },
  'pad:5': { type: 'note', note: 41, channel: 8 },
  'pad:6': { type: 'note', note: 42, channel: 8 },
  'pad:7': { type: 'note', note: 43, channel: 8 },
  'slider:complexity': { type: 'cc', controller: 82, channel: 0, target: 'complexity' },
  'slider:spread': { type: 'cc', controller: 83, channel: 0, target: 'spread' },
  'slider:octaveDoubling': { type: 'cc', controller: 85, channel: 0, target: 'octaveDoubling' },
  'slider:tension': { type: 'cc', controller: 17, channel: 0, target: 'tension' },
};

let state: MappingState = { ...DEFAULT_MAPPING };
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const controlId = (control: LogicalControl) => {
  switch (control.kind) {
    case 'pad':
      return `pad:${control.index}`;
    case 'slider':
      return `slider:${control.id}`;
    case 'encoder':
      return `encoder:${control.controller}`;
    default:
      return '';
  }
};

export const parseControlId = (id: string): LogicalControl | null => {
  if (id.startsWith('pad:')) {
    const index = Number(id.split(':')[1]);
    if (Number.isFinite(index)) return { kind: 'pad', index };
    return null;
  }
  if (id.startsWith('slider:')) {
    const sliderId = id.split(':')[1] as ParamKey;
    if (sliderId && ['complexity', 'spread', 'octaveDoubling', 'tension'].includes(sliderId)) {
      return { kind: 'slider', id: sliderId };
    }
    return null;
  }
  if (id.startsWith('encoder:')) {
    const controller = Number(id.split(':')[1]);
    if (Number.isFinite(controller)) return { kind: 'encoder', controller };
    return null;
  }
  return null;
};

const loadMapping = () => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as MappingState;
    state = { ...DEFAULT_MAPPING, ...parsed };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load MIDI mapping, using defaults', error);
  }
};

const persistMapping = () => {
  if (typeof window === 'undefined') return;
  try {
    const overrides: MappingState = {};
    Object.entries(state).forEach(([key, value]) => {
      if (DEFAULT_MAPPING[key] && JSON.stringify(DEFAULT_MAPPING[key]) === JSON.stringify(value)) {
        return;
      }
      overrides[key] = value;
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to persist MIDI mapping', error);
  }
};

if (typeof window !== 'undefined') {
  loadMapping();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useMapping = () => useSyncExternalStore(subscribe, () => state);

export function getBinding(control: LogicalControl): MidiBinding | undefined {
  return state[controlId(control)];
}

export function setBinding(control: LogicalControl, binding: MidiBinding) {
  const id = controlId(control);
  const previous = state[id];
  const merged: MidiBinding = {
    ...binding,
    ...(previous && previous.type === 'cc' && binding.type === 'cc' && previous.target && !binding.target
      ? { target: previous.target }
      : {}),
  };
  state = { ...state, [id]: merged };
  persistMapping();
  notify();
}

export function resetMapping(control?: LogicalControl) {
  if (!control) {
    state = { ...DEFAULT_MAPPING };
  } else {
    const id = controlId(control);
    state = { ...state, [id]: DEFAULT_MAPPING[id] };
  }
  persistMapping();
  notify();
}

export function captureBindingFromEvent(event: { type: 'noteon' | 'cc' | 'noteoff'; note?: number; controller?: number; channel: number }): MidiBinding | null {
  if (event.type === 'noteon' || event.type === 'noteoff') {
    if (typeof event.note !== 'number') return null;
    return { type: 'note', note: event.note, channel: event.channel };
  }
  if (event.type === 'cc') {
    if (typeof event.controller !== 'number') return null;
    return { type: 'cc', controller: event.controller, channel: event.channel };
  }
  return null;
}

export function setEncoderTarget(controller: number, target?: ParamKey) {
  const id = controlId({ kind: 'encoder', controller });
  const binding = state[id];
  if (!binding || binding.type !== 'cc') return;
  state = { ...state, [id]: { ...binding, target } };
  persistMapping();
  notify();
}

export function mappingEntries() {
  return Object.entries(state);
}

export { DEFAULT_MAPPING };
