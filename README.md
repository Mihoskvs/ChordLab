# ChordLab

Transform the Arturia **MiniLab 3** into a chord performance workstation with a Python MIDI engine and a WebMIDI control panel.

## Project layout

| Path | Description |
| --- | --- |
| `chord_builder.py` | Core MIDI engine that interprets pad/keyboard/fader messages and generates chords. |
| `minilab3_display_colors.py` | SysEx helpers for OLED text and RGB pad colour packets. |
| `midi_logger.py` | Command-line tool to inspect or forward MiniLab MIDI traffic. |
| `minilab-ui/` | Vite + React WebMIDI interface for OLED/pad configuration. |
| `assets/` | Static references (pad map blueprints, artwork). |
| `PROJECT_BRIEF.md` | Original design brief and hardware mapping. |

## Python engine

### Installation

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt  # see below if the file is missing
```

> **Note**
> The repository does not pin dependencies yet. Install the following manually if `requirements.txt` is absent:
>
> ```bash
> pip install mido python-rtmidi
> ```

### Running the chord builder

```bash
python chord_builder.py
```

The engine opens the selected MiniLab 3 input port, tracks pad chord types, applies the four fader modifiers (complexity, spread, octave doubling, tension), and emits chord stacks to the configured output (e.g. IAC "ChordOut").

To monitor MIDI routing while developing, use:

```bash
python midi_logger.py
```

Add a port name to stream data or combine `--forward` to proxy to the DAW.

## Web UI

The React front-end lets you edit OLED lines and push RGB colours to pads via WebMIDI SysEx calls.

```bash
cd minilab-ui
pnpm install  # or npm install / yarn install
pnpm dev
```

Open `http://localhost:5173` in Chrome or Edge with experimental WebMIDI features enabled and choose the MiniLab 3 output port.

## Development checklist

- [x] Core chord interval map and modifier logic
- [x] SysEx helpers for OLED & pads
- [x] MIDI logging utility
- [x] WebMIDI configuration UI
- [ ] Hold / Octave button assignment
- [ ] DAW clock sync toggle
- [ ] Preset store/recall JSON files
- [ ] Live WebSocket bridge between Python engine and Web UI

For the full context and hardware layout see [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md).
