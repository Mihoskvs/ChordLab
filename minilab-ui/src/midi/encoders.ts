const STORAGE_KEY = 'chordlab.encoderModes.v1';

type EncoderMode = 'absolute' | 'twos-complement' | 'sign-magnitude' | 'one-step';

type EncoderState = {
  samples: number[];
  mode?: EncoderMode;
  lastValue?: number;
};

type Overrides = Record<string, EncoderMode>;

const MAX_SAMPLES = 6;

const loadOverrides = (): Overrides => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) ?? {};
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse encoder overrides', error);
    return {};
  }
};

const saveOverrides = (overrides: Overrides) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to persist encoder overrides', error);
  }
};

const overridesCache = loadOverrides();

const withinRange = (values: number[], min: number, max: number) => values.every((value) => value >= min && value <= max);

const inferMode = (samples: number[]): EncoderMode => {
  if (samples.length === 0) return 'absolute';
  const unique = Array.from(new Set(samples));

  // Relative (1/127 step) – typically emits 1 for +1 and 127 for -1 (with optional 0 for idle)
  if (unique.every((value) => value === 0 || value === 1 || value === 127)) {
    return 'one-step';
  }

  // Two's complement around 64 (63, 64, 65...)
  if (withinRange(unique, 60, 68)) {
    return 'twos-complement';
  }

  const hasPositive = unique.some((value) => (value & 0x40) === 0 && value !== 0);
  const hasNegative = unique.some((value) => (value & 0x40) === 0x40 && value !== 64);
  if (hasPositive && hasNegative && unique.every((value) => value === 64 || value === 0 || (value & 0x3f) <= 16)) {
    return 'sign-magnitude';
  }

  const range = Math.max(...samples) - Math.min(...samples);
  if (range > 20 || unique.length > 10) {
    return 'absolute';
  }

  // Default fallback – treat as absolute for safety.
  return 'absolute';
};

const deltaForMode = (mode: EncoderMode, value: number, lastValue?: number) => {
  switch (mode) {
    case 'absolute': {
      if (typeof lastValue !== 'number') return { delta: 0, nextValue: value };
      let delta = value - lastValue;
      if (delta > 64) delta -= 128;
      if (delta < -64) delta += 128;
      return { delta, nextValue: value };
    }
    case 'twos-complement': {
      const signed = value >= 64 ? value - 128 : value;
      return { delta: signed, nextValue: value };
    }
    case 'sign-magnitude': {
      if (value === 64) return { delta: 0, nextValue: value };
      const magnitude = value & 0x3f;
      const sign = (value & 0x40) === 0x40 ? -1 : 1;
      return { delta: sign * magnitude, nextValue: value };
    }
    case 'one-step': {
      if (value === 0) return { delta: 0, nextValue: value };
      if (value === 127) return { delta: -1, nextValue: value };
      return { delta: 1, nextValue: value };
    }
    default:
      return { delta: 0, nextValue: value };
  }
};

export interface EncoderDelta {
  controller: number;
  mode: EncoderMode;
  delta: number;
  raw: number;
}

export class EncoderTracker {
  private states = new Map<number, EncoderState>();

  constructor(private readonly overrides: Overrides = overridesCache) {}

  public process(controller: number, value: number): EncoderDelta {
    const state = this.states.get(controller) ?? { samples: [] };
    const override = this.overrides[String(controller)];

    if (!override && state.samples.length < MAX_SAMPLES) {
      state.samples.push(value);
      if (state.samples.length >= MAX_SAMPLES) {
        state.mode = inferMode(state.samples);
      }
    }

    const mode = override ?? state.mode ?? inferMode(state.samples.concat(value));
    const { delta, nextValue } = deltaForMode(mode, value, state.lastValue);
    state.lastValue = nextValue;
    state.mode = mode;
    this.states.set(controller, state);

    return { controller, mode, delta, raw: value };
  }

  public setOverride(controller: number, mode: EncoderMode) {
    this.overrides[String(controller)] = mode;
    saveOverrides(this.overrides);
    const state = this.states.get(controller) ?? { samples: [] };
    state.mode = mode;
    this.states.set(controller, state);
  }

  public clearOverride(controller: number) {
    delete this.overrides[String(controller)];
    saveOverrides(this.overrides);
    const state = this.states.get(controller);
    if (state) {
      state.samples = [];
      state.mode = undefined;
    }
  }

  public getOverride(controller: number): EncoderMode | undefined {
    return this.overrides[String(controller)];
  }
}

export type { EncoderMode };
