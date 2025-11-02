# ChordLab

Transform the Arturia **MiniLab 3** into a chord performance workstation with a
Python MIDI engine, WebMIDI control surface, and curated hardware mapping.

This repository implements the system described in [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md):

- `chord_builder.py` — core MIDI processor that converts pad/keyboard input into
  harmonised chord output and SysEx feedback.
- `minilab3_display_colors.py` — helpers for OLED and pad LED SysEx packets.
- `midi_logger.py` — lightweight MIDI monitor for debugging controller mapping.
- `minilab-ui/` — Vite + React WebMIDI interface for live LED/OLED control.
- `assets/` — placeholder for MCC presets, pad layouts, and design blueprints.

---

## 🧠 Engine Overview

The Python engine listens to MiniLab 3 events and maintains global performance
state:

- **Chord Types** — Pads 21–28 select the harmonic template (major, minor,
  extended voicings, sus, diminished, augmented).
- **Root Detection** — Incoming key presses define the root pitch for the chord.
- **Chord Modifiers** — Faders 1–4 morph the voicing through complexity,
  spread, octave doubling, and tension parameters.
- **Mode System** — The main encoder toggles between high-level performance
  modes (Chord, Strum, Arp, Scale, Voicing, Rhythm, FX, Morph, Performance,
  Sampler) with subtype selection when the encoder is pressed.
- **SysEx Feedback** — Optional OLED + pad LED updates use the helpers in
  `minilab3_display_colors.py`.

The engine can run with real MIDI ports or in a dry-run configuration using the
`MockPort` helper for automated testing.

### Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install mido python-rtmidi
python chord_builder.py --input "MiniLab3 MIDI In" --output "IAC Driver ChordOut"
```

Use the `--dry-run` flag to instantiate the engine without physical hardware.

---

## 🎚 Web UI (Vite + React)

The WebMIDI interface mirrors the pad chord palette, exposes OLED controls, and
pushes SysEx updates directly to connected MiniLab 3 hardware.

```bash
cd minilab-ui
npm install
npm run dev
```

Open the displayed URL in a WebMIDI-compatible browser (Chrome or Edge) and
grant MIDI access when prompted.

---

## 🔍 Debugging Utilities

- `python midi_logger.py --list` — enumerate available MIDI ports.
- `python midi_logger.py "MiniLab3 MIDI In"` — print incoming MIDI events.

---

## 🗂 Project Structure

```
ChordLab/
├── PROJECT_BRIEF.md
├── README.md
├── assets/
├── chord_builder.py
├── midi_logger.py
├── minilab3_display_colors.py
└── minilab-ui/
```

---

## 📄 License

MIT License — see the brief for attribution details.
