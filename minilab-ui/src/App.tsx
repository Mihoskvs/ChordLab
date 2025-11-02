import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PadColorGrid from './components/PadColorGrid';
import { useWebMIDI, type NormalizedMidiEvent } from './hooks/useWebMIDI';
import { PAD_MAPPINGS, padPalette } from './color-presets';
import { useParams, setParam, getParamValue, type ParamsState } from './paramsStore';
import { applyIncomingValue, formatParamLabel, normalizeUserInput, paramToCC } from './paramMapping';
import { EncoderTracker, type EncoderMode } from './midi/encoders';
import {
  captureBindingFromEvent,
  getBinding,
  mappingEntries,
  parseControlId,
  setBinding,
  resetMapping,
  setEncoderTarget,
  useMapping,
  type LogicalControl,
} from './midi/mapping';
import type { MidiBinding } from './midi/mapping';
import type { PadDeviceMapping } from './color-presets';
import type { MidiBinding as MappingBinding } from './midi/mapping';

type Rgb = { r: number; g: number; b: number };

const SLIDER_KEYS: Array<{ key: keyof ParamsState; label: string; description: string }> = [
  { key: 'complexity', label: 'Complexity', description: 'Adds chord extensions (7th / 9th / 11th)' },
  { key: 'spread', label: 'Spread', description: 'Opens the voicing up to ±24 semitones' },
  { key: 'octaveDoubling', label: 'Octave Doubling', description: 'Adds stacked octaves above/below' },
  { key: 'tension', label: 'Tension', description: 'Adds alterations (b9 / #11 / #5)' },
];

const buildDefaultPadColors = () => {
  const mapping: Record<number, Rgb> = {};
  PAD_MAPPINGS.forEach((pad, index) => {
    const swatch = padPalette[index === 0 ? 'highlight' : 'muted'];
    mapping[pad.padValue] = { ...swatch };
  });
  return mapping;
};

const isSecureOrigin = () => {
  if (typeof window === 'undefined') return true;
  const { protocol, hostname } = window.location;
  if (protocol === 'https:' && hostname === 'localhost') return true;
  if (protocol === 'http:' && hostname === 'localhost') return true;
  return false;
};

const midiEventKey = (binding: MappingBinding) => {
  if (binding.type === 'note') {
    return `note:${binding.channel}:${binding.note}`;
  }
  return `cc:${binding.channel}:${binding.controller}`;
};

export default function App(): JSX.Element {
  const {
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
  } = useWebMIDI();

  const params = useParams();
  const mapping = useMapping();

  const [selectedOutputId, setSelectedOutputId] = useState<string>('');
  const [padColors, setPadColors] = useState<Record<number, Rgb>>(buildDefaultPadColors);
  const [activePadIndex, setActivePadIndex] = useState<number>(0);
  const [oled, setOled] = useState({ line1: 'ChordLab', line2: 'MiniLab 3' });
  const [learnTarget, setLearnTarget] = useState<LogicalControl | null>(null);
  const encoderTrackerRef = useRef(new EncoderTracker());
  const hardwareUpdateRef = useRef<Record<string, { value: number; raf: number | null }>>({});
  const suppressOutgoingRef = useRef(false);

  const secureOrigin = useMemo(isSecureOrigin, []);

  const outputsToUse = selectedOutputId ? outputs.filter((output) => output.id === selectedOutputId) : outputs;
  const midiReady = status === 'ready' && outputs.length > 0;

  const padBindingsByEvent = useMemo(() => {
    const map = new Map<string, number>();
    PAD_MAPPINGS.forEach((pad) => {
      const binding = mapping[`pad:${pad.uiIndex}`];
      if (binding && binding.type === 'note') {
        map.set(midiEventKey(binding), pad.uiIndex);
      }
    });
    return map;
  }, [mapping]);

  const sliderBindings = useMemo(() => {
    return SLIDER_KEYS.reduce((acc, entry) => {
      const binding = mapping[`slider:${entry.key}`];
      if (binding && binding.type === 'cc') {
        acc[entry.key] = binding;
      }
      return acc;
    }, {} as Record<keyof ParamsState, MappingBinding | undefined>);
  }, [mapping]);

  const ccBindingMap = useMemo(() => {
    const map = new Map<string, { key: keyof ParamsState; binding: MappingBinding }>();
    SLIDER_KEYS.forEach(({ key }) => {
      const binding = sliderBindings[key];
      if (binding && binding.type === 'cc') {
        map.set(midiEventKey(binding), { key, binding });
      }
    });
    return map;
  }, [sliderBindings]);

  const encoderBindings = useMemo(() => {
    const entries = mappingEntries()
      .map(([id, binding]) => ({ id, control: parseControlId(id), binding }))
      .filter((item) => item.control?.kind === 'encoder' && item.binding?.type === 'cc') as Array<{
        id: string;
        control: { kind: 'encoder'; controller: number };
        binding: { type: 'cc'; controller: number; channel: number; encoderMode?: EncoderMode; target?: ParamKey };
      }>;
    const map = new Map<string, { controlId: string; binding: typeof entries[number]['binding']; controller: number }>();
    entries.forEach(({ id, binding, control }) => {
      map.set(midiEventKey(binding), { controlId: id, binding, controller: control.controller });
    });
    return map;
  }, [mapping]);

  const scheduleHardwareParamUpdate = useCallback(
    (key: keyof ParamsState, value: number) => {
      const bucket = hardwareUpdateRef.current;
      const entry = bucket[key] ?? { value, raf: null };
      entry.value = value;
      if (entry.raf == null) {
        entry.raf = window.requestAnimationFrame(() => {
          entry.raf = null;
          bucket[key] = entry;
          suppressOutgoingRef.current = true;
          setParam(key, entry.value);
          suppressOutgoingRef.current = false;
        });
      }
      bucket[key] = entry;
    },
    [],
  );

  const sendPadSysex = useCallback(
    (pad: PadDeviceMapping) => {
      const color = padColors[pad.padValue];
      if (!color) return;
      sendPadColor({ pad: pad.padValue, r: color.r, g: color.g, b: color.b }, selectedOutputId || undefined);
    },
    [padColors, sendPadColor, selectedOutputId],
  );

  const triggerPadNote = useCallback(
    (pad: PadDeviceMapping) => {
      const targetId = selectedOutputId || undefined;
      sendNoteOn({ note: pad.note, channel: pad.channel, velocity: 100, targetId });
      window.setTimeout(() => {
        sendNoteOff({ note: pad.note, channel: pad.channel, velocity: 0, targetId });
      }, 50);
    },
    [selectedOutputId, sendNoteOff, sendNoteOn],
  );

  const handlePadSelect = useCallback(
    (pad: PadDeviceMapping) => {
      setActivePadIndex(pad.uiIndex);
      sendPadSysex(pad);
      triggerPadNote(pad);
    },
    [sendPadSysex, triggerPadNote],
  );

  const handlePadPreview = useCallback(
    (pad: PadDeviceMapping) => {
      sendPadSysex(pad);
      triggerPadNote(pad);
    },
    [sendPadSysex, triggerPadNote],
  );

  const handleMidiEvent = useCallback(
    (event: NormalizedMidiEvent) => {
      if (learnTarget) {
        const binding = captureBindingFromEvent(event);
        if (binding) {
          setBinding(learnTarget, binding);
          if (learnTarget.kind === 'encoder' && binding.type === 'cc') {
            encoderTrackerRef.current.clearOverride?.(learnTarget.controller);
          }
          setLearnTarget(null);
        }
      }

      if (event.type === 'noteon' || event.type === 'noteoff') {
        const key = `note:${event.channel}:${event.note}`;
        const padIndex = padBindingsByEvent.get(key);
        if (padIndex !== undefined) {
          if (event.type === 'noteon') {
            setActivePadIndex(padIndex);
            const pad = PAD_MAPPINGS[padIndex];
            sendPadSysex(pad);
          }
          return;
        }
      }

      if (event.type === 'cc') {
        const ccKey = `cc:${event.channel}:${event.controller}`;
        const sliderMatch = ccBindingMap.get(ccKey);
        if (sliderMatch) {
          const prev = getParamValue(sliderMatch.key);
          const next = applyIncomingValue(sliderMatch.key, event.value, prev);
          scheduleHardwareParamUpdate(sliderMatch.key, next);
          return;
        }

        const encoderMatch = encoderBindings.get(ccKey);
        if (encoderMatch) {
          const tracker = encoderTrackerRef.current;
          const delta = tracker.process(event.controller, event.value);
          const binding = encoderMatch.binding;
          const target = binding.target ?? 'spread';
          if (delta.delta !== 0) {
            const prev = getParamValue(target);
            const proposed = prev + delta.delta * 0.01;
            const next = normalizeUserInput(target, proposed, prev);
            scheduleHardwareParamUpdate(target, next);
          }
          return;
        }
      }
    },
    [ccBindingMap, encoderBindings, learnTarget, padBindingsByEvent, scheduleHardwareParamUpdate, sendPadSysex],
  );

  useEffect(() => {
    const unsubscribe = onMessage((event) => handleMidiEvent(event));
    return unsubscribe;
  }, [handleMidiEvent, onMessage]);

  const updatePadColor = useCallback(
    (channel: keyof Rgb, value: number) => {
      const pad = PAD_MAPPINGS[activePadIndex];
      setPadColors((previous) => {
        const current = previous[pad.padValue] ?? { r: 0, g: 0, b: 0 };
        const next = { ...current, [channel]: Math.max(0, Math.min(127, value)) } as Rgb;
        const updated = { ...previous, [pad.padValue]: next };
        return updated;
      });
    },
    [activePadIndex],
  );

  const handleSliderInput = useCallback(
    (key: keyof ParamsState, rawValue: number) => {
      const binding = sliderBindings[key];
      const previous = params[key];
      const normalized = normalizeUserInput(key, rawValue, previous);
      if (normalized === previous) return;
      setParam(key, normalized);
      if (!suppressOutgoingRef.current && binding && binding.type === 'cc') {
        const ccValue = paramToCC(key, normalized);
        sendCC({ controller: binding.controller, channel: binding.channel, value: ccValue, targetId: selectedOutputId || undefined });
      }
    },
    [params, selectedOutputId, sendCC, sliderBindings],
  );

  const handleSendOled = useCallback(() => {
    sendOled(oled, selectedOutputId || undefined);
  }, [oled, selectedOutputId, sendOled]);

  const startLearn = useCallback((control: LogicalControl) => {
    setLearnTarget(control);
  }, []);

  const encoderAssignments = useMemo(() => {
    const entries = mappingEntries();
    return entries
      .map(([id, binding]) => ({ id, control: parseControlId(id), binding }))
      .filter((entry): entry is { id: string; control: { kind: 'encoder'; controller: number }; binding: MidiBinding } => {
        return !!entry.control && entry.control.kind === 'encoder' && entry.binding?.type === 'cc';
      });
  }, [mapping]);

  const permissionBanner = !secureOrigin ? (
    <div className="permission-banner" role="alert">
      <strong>Serve from http://localhost or https://localhost.</strong> WebMIDI is blocked on file:// origins.
    </div>
  ) : status !== 'ready' ? (
    <div className="permission-banner" role="alert">
      {status === 'requesting' && <span>Requesting MIDI access…</span>}
      {status === 'idle' && <span>MIDI access required. Click the button below to continue.</span>}
      {status === 'denied' && <span>Access denied. Please allow MIDI + SysEx to use the controller.</span>}
      {status === 'unsupported' && <span>Your browser does not support WebMIDI. Use Chrome or Edge on desktop.</span>}
      {status !== 'unsupported' && (
        <button type="button" onClick={requestAccess} disabled={status === 'requesting'}>
          Request MIDI + SysEx
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="app-shell">
      {permissionBanner}

      <header>
        <div>
          <h1>MiniLab 3 Performance Surface</h1>
          <p>Tweak pad LEDs, push OLED overlays, and mirror the chord engine modifiers in real-time.</p>
        </div>
        <span className="status-chip" data-ready={midiReady}>
          <span aria-hidden>●</span>
          {status === 'ready'
            ? outputs.length > 0
              ? selectedOutputId
                ? `Connected: ${outputsToUse[0]?.name ?? 'output'}`
                : `${outputs.length} output(s) available`
              : 'No outputs detected'
            : status === 'requesting'
            ? 'Requesting access…'
            : status === 'denied'
            ? 'Access denied'
            : status === 'unsupported'
            ? 'WebMIDI unsupported'
            : 'Awaiting permission'}
        </span>
      </header>

      <section className="connection">
        <label>
          MIDI Output
          <select value={selectedOutputId} onChange={(event) => setSelectedOutputId(event.target.value)} disabled={!outputs.length}>
            <option value="">Send to all available outputs</option>
            {outputs.map((output) => (
              <option key={output.id} value={output.id}>
                {output.name}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          Inputs: {inputs.length ? inputs.map((input) => input.name).join(', ') : 'none'} — Outputs:{' '}
          {outputs.length ? outputs.map((output) => output.name).join(', ') : 'none'}
        </p>
      </section>

      <PadColorGrid
        pads={PAD_MAPPINGS}
        activePadIndex={activePadIndex}
        padColors={padColors}
        onSelect={handlePadSelect}
        onPreview={handlePadPreview}
        learnTargetIndex={learnTarget?.kind === 'pad' ? learnTarget.index : null}
      />

      <section className="control-panel">
        <div className="panel">
          <h2>Chord Modifiers</h2>
          <p>Hardware sliders and encoders stay in sync with the UI.</p>
          <div className="slider-list">
            {SLIDER_KEYS.map(({ key, label, description }) => {
              const value = params[key];
              const binding = sliderBindings[key];
              const bindingLabel = binding && binding.type === 'cc' ? `CC${binding.controller} · Ch ${binding.channel + 1}` : 'Unmapped';
              return (
                <div key={key} className="slider-row" data-learning={learnTarget?.kind === 'slider' && learnTarget.id === key}>
                  <div className="slider-meta">
                    <strong>{label}</strong>
                    <span>{formatParamLabel(key, value)}</span>
                    <small>{description}</small>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    value={Math.round(value * 1000)}
                    onChange={(event) => handleSliderInput(key, Number(event.target.value) / 1000)}
                  />
                  <div className="slider-actions">
                    <span>{bindingLabel}</span>
                    <button type="button" onClick={() => startLearn({ kind: 'slider', id: key })}>
                      Learn
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <h2>OLED Lines</h2>
          <p>Both lines accept up to 16 ASCII characters and are truncated automatically.</p>
          <div className="oled-fields">
            <label>
              Line 1
              <input
                type="text"
                maxLength={16}
                value={oled.line1}
                onChange={(event) => setOled((current) => ({ ...current, line1: event.target.value }))}
              />
            </label>
            <label>
              Line 2
              <input
                type="text"
                maxLength={16}
                value={oled.line2}
                onChange={(event) => setOled((current) => ({ ...current, line2: event.target.value }))}
              />
            </label>
          </div>
          <button type="button" onClick={handleSendOled} disabled={!midiReady}>
            Send OLED Text
          </button>
        </div>
      </section>

      <section className="panel mapping-panel">
        <h2>MIDI Mapping</h2>
        {learnTarget && <p className="hint">Learning… move the desired control on the MiniLab to complete binding.</p>}
        <table>
          <thead>
            <tr>
              <th>Control</th>
              <th>Binding</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {PAD_MAPPINGS.map((pad) => {
              const binding = mapping[`pad:${pad.uiIndex}`];
              const label = binding && binding.type === 'note' ? `Note ${binding.note} · Ch ${binding.channel + 1}` : 'Unmapped';
              return (
                <tr key={`pad-row-${pad.uiIndex}`} data-learning={learnTarget?.kind === 'pad' && learnTarget.index === pad.uiIndex}>
                  <td>Pad {pad.padValue} ({pad.label})</td>
                  <td>{label}</td>
                  <td>
                    <button type="button" onClick={() => startLearn({ kind: 'pad', index: pad.uiIndex })}>
                      Learn
                    </button>
                  </td>
                </tr>
              );
            })}
            {encoderAssignments.map(({ id, control, binding }) => {
              if (binding.type !== 'cc') return null;
              const override = encoderTrackerRef.current.getOverride(control.controller);
              return (
                <tr key={id} data-learning={learnTarget?.kind === 'encoder' && learnTarget.controller === control.controller}>
                  <td>Encoder CC{binding.controller}</td>
                  <td>
                    CC{binding.controller} · Ch {binding.channel + 1}
                    {binding.target ? ` → ${binding.target}` : ''}
                  </td>
                  <td className="encoder-actions">
                    <button type="button" onClick={() => startLearn({ kind: 'encoder', controller: control.controller })}>
                      Learn
                    </button>
                    <select
                      value={binding.target ?? ''}
                      onChange={(event) =>
                        setEncoderTarget(control.controller, (event.target.value || undefined) as ParamKey | undefined)
                      }
                    >
                      <option value="">No parameter</option>
                      {SLIDER_KEYS.map(({ key, label }) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={override ?? 'auto'}
                      onChange={(event) => {
                        const value = event.target.value as EncoderMode | 'auto';
                        if (value === 'auto') {
                          encoderTrackerRef.current.clearOverride(control.controller);
                        } else {
                          encoderTrackerRef.current.setOverride(control.controller, value);
                        }
                      }}
                    >
                      <option value="auto">Auto mode</option>
                      <option value="absolute">Absolute</option>
                      <option value="twos-complement">Relative (two’s complement)</option>
                      <option value="sign-magnitude">Relative (sign/magnitude)</option>
                      <option value="one-step">Relative (1/127)</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mapping-actions">
          <button type="button" onClick={() => resetMapping()}>
            Reset Mapping
          </button>
        </div>
      </section>

      <footer>
        <h2>Pad → Chord Map</h2>
        <p>The MiniLab pads (notes 36–43 on channel 9) mirror the chord engine palette.</p>
        <ul>
          {PAD_MAPPINGS.map((pad) => (
            <li key={pad.padValue}>
              Pad {pad.padValue}: <strong>{pad.label.toUpperCase()}</strong> · Note {pad.note}
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}
