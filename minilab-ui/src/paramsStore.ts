import { useSyncExternalStore } from 'react';

type ParamKey = 'complexity' | 'spread' | 'octaveDoubling' | 'tension';

export interface ParamsState {
  complexity: number;
  spread: number;
  octaveDoubling: number;
  tension: number;
}

const INITIAL_STATE: ParamsState = {
  complexity: 0,
  spread: 0,
  octaveDoubling: 0.5,
  tension: 0,
};

const listeners = new Set<() => void>();
let state: ParamsState = INITIAL_STATE;

const notify = () => {
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSnapshot = () => state;

export const useParams = () => useSyncExternalStore(subscribe, getSnapshot);

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

export function setParam(key: ParamKey, value: number) {
  const next = clamp01(value);
  if (state[key] === next) return;
  state = { ...state, [key]: next };
  notify();
}

export function setParams(partial: Partial<Record<ParamKey, number>>) {
  let changed = false;
  const nextState: ParamsState = { ...state };
  (Object.keys(partial) as ParamKey[]).forEach((key) => {
    const next = clamp01(partial[key] ?? state[key]);
    if (nextState[key] !== next) {
      nextState[key] = next;
      changed = true;
    }
  });
  if (!changed) return;
  state = nextState;
  notify();
}

export function resetParams() {
  state = INITIAL_STATE;
  notify();
}

export function getParamValue(key: ParamKey) {
  return state[key];
}

export type { ParamKey };
