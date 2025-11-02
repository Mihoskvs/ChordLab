import type { ParamKey } from './paramsStore';

export type ParamSemantic = {
  toNormalized: (cc: number) => number;
  toCC: (normalized: number) => number;
  describe: (normalized: number) => string;
  stops?: number[];
};

type DiscreteDefinition = {
  stops: number[];
  hysteresis: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const discreteIndex = (value: number, previous: number, { stops, hysteresis }: DiscreteDefinition) => {
  const clamped = clamp01(value);
  const prevIndex = stops.indexOf(previous);
  const currentIndex = prevIndex >= 0 ? prevIndex : 0;

  const getBounds = (index: number) => {
    const lower = index === 0 ? 0 : (stops[index - 1] + stops[index]) / 2;
    const upper = index === stops.length - 1 ? 1 : (stops[index] + stops[index + 1]) / 2;
    return { lower, upper };
  };

  const { lower, upper } = getBounds(currentIndex);
  if (clamped >= lower - hysteresis && clamped <= upper + hysteresis) {
    return stops[currentIndex];
  }

  for (let index = 0; index < stops.length; index += 1) {
    const bounds = getBounds(index);
    if (clamped >= bounds.lower - hysteresis && clamped <= bounds.upper + hysteresis) {
      return stops[index];
    }
  }

  return stops[currentIndex];
};

const complexityStops = [0, 1 / 3, 2 / 3, 1];
const tensionStops = [0, 1 / 3, 2 / 3, 1];
const octaveStops = [0, 0.25, 0.5, 0.75, 1]; // {-24, -12, 0, +12, +24}

const discreteSemantics: Record<ParamKey, DiscreteDefinition | undefined> = {
  complexity: { stops: complexityStops, hysteresis: 0.06 },
  spread: undefined,
  octaveDoubling: { stops: octaveStops, hysteresis: 0.05 },
  tension: { stops: tensionStops, hysteresis: 0.06 },
};

const mapTension = ['none', 'b9', '#11', '#5'];
const mapComplexity = ['base', '+7th', '+9th', '+11th'];
const mapOctave = ['-24', '-12', '0', '+12', '+24'];

const spreadSemantics: ParamSemantic = {
  toNormalized: (value) => clamp01(value / 127),
  toCC: (normalized) => Math.round(clamp01(normalized) * 127),
  describe: (normalized) => `${Math.round(clamp01(normalized) * 24)} st`,
};

const discreteToCC = (stops: number[]) => (value: number) => {
  const index = stops.indexOf(value);
  if (index === -1) return Math.round(value * 127);
  if (stops.length === 0) return 0;
  if (stops.length === 1) return stops[0] === 0 ? 0 : 127;
  return Math.round((index / (stops.length - 1)) * 127);
};

const ccToDiscrete = (stops: number[]) => (value: number) => {
  if (stops.length === 0) return 0;
  if (stops.length === 1) return stops[0];
  const normalized = clamp01(value / 127);
  const index = Math.round(normalized * (stops.length - 1));
  return stops[index];
};

const paramSemantics: Record<ParamKey, ParamSemantic> = {
  complexity: {
    toNormalized: (value) => ccToDiscrete(complexityStops)(value),
    toCC: discreteToCC(complexityStops),
    describe: (normalized) => mapComplexity[complexityStops.indexOf(normalized)] ?? 'base',
    stops: complexityStops,
  },
  tension: {
    toNormalized: (value) => ccToDiscrete(tensionStops)(value),
    toCC: discreteToCC(tensionStops),
    describe: (normalized) => mapTension[tensionStops.indexOf(normalized)] ?? 'none',
    stops: tensionStops,
  },
  octaveDoubling: {
    toNormalized: (value) => ccToDiscrete(octaveStops)(value),
    toCC: discreteToCC(octaveStops),
    describe: (normalized) => mapOctave[octaveStops.indexOf(normalized)] ?? '0',
    stops: octaveStops,
  },
  spread: spreadSemantics,
};

export const getParamSemantic = (key: ParamKey) => paramSemantics[key];

export function applyIncomingValue(key: ParamKey, midiValue: number, previous: number) {
  const semantic = getParamSemantic(key);
  if (!semantic) return clamp01(midiValue / 127);

  if (!semantic.stops) {
    return semantic.toNormalized(midiValue);
  }

  const definition = discreteSemantics[key];
  if (!definition) {
    return semantic.toNormalized(midiValue);
  }
  const target = semantic.toNormalized(midiValue);
  return discreteIndex(target, previous, definition);
}

export function formatParamLabel(key: ParamKey, value: number) {
  const semantic = getParamSemantic(key);
  if (!semantic) return `${Math.round(value * 100)}%`;
  return semantic.describe(value);
}

export function paramToCC(key: ParamKey, value: number) {
  const semantic = getParamSemantic(key);
  return semantic ? semantic.toCC(value) : Math.round(clamp01(value) * 127);
}

export function normalizeUserInput(key: ParamKey, value: number, previous: number) {
  const semantic = getParamSemantic(key);
  const clamped = clamp01(value);
  if (semantic && semantic.stops) {
    const definition = discreteSemantics[key];
    if (!definition) return clamped;
    return discreteIndex(clamped, previous, definition);
  }
  return clamped;
}
