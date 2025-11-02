# ChordLab — MiniLab 3 Chord Builder

Transform the Arturia **MiniLab 3** into a performance-ready chord workstation. ChordLab ships with a Python MIDI engine, WebMIDI control surface, and utilities for lighting the pads / OLED display with live feedback.

![MiniLab 3 pads illustration](assets/minilab-pads.svg)

> 💡 This repository mirrors the structure described in the project brief. Each tool can be run independently or combined for a full live performance setup.

---

## Project Layout

| Path | Description |
| --- | --- |
| `chord_builder.py` | Python chord engine that interprets pad/keyboard input and emits harmonised chords |
| `minilab3_display_colors.py` | Helpers for building SysEx payloads that light the pads and update the OLED |
| `midi_logger.py` | Simple CLI utility for mirroring and debugging MIDI traffic |
| `tests/` | Pytest suite covering the core chord engine behaviour |
| `minilab-ui/` | Vite + React WebMIDI dashboard for pushing pad colours and OLED text |
| `assets/` | Visual assets referenced in documentation |
| `Project Brief` | Original brief from the hardware team |

---

## Getting Started (Python Engine)

### 1. Install dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

> ℹ️ The repository ships with a very small `mido_stub` module so the test suite can run without system MIDI dependencies. For real hardware interaction, install the official [`mido`](https://mido.readthedocs.io/) package, which will automatically be used when available.

### 2. Run the chord engine in a DAW setup

The engine expects the MiniLab 3 to send data on its default channels and will forward generated chords to the configured output port (defaults to channel 1). It can be embedded into your own script or used interactively:

```python
from mido import open_input, open_output
from chord_builder import MiniLabChordEngine

with open_input('MiniLab3 In') as in_port, open_output('IAC Driver ChordOut') as out_port:
    engine = MiniLabChordEngine(out_port)
    for message in in_port:
        engine.process_message(message)
```

### 3. Running the tests

```bash
pytest
```

---

## Web UI (WebMIDI)

The `minilab-ui` directory contains a Vite project that can send SysEx commands directly from the browser (Chrome / Edge).

```bash
cd minilab-ui
npm install
npm run dev
```

Open the printed URL in a WebMIDI-compatible browser, select the MiniLab output and use the controls to update pad colours / OLED lines.

---

## Utilities

### MIDI Logger

List available input ports and monitor data flowing through them while optionally forwarding to another destination:

```bash
python midi_logger.py "MiniLab3 In" "IAC Driver ChordOut"
```

### SysEx Helpers

Generate raw SysEx payloads for use with other tools or hardware testing rigs:

```python
from minilab3_display_colors import RGB, build_pad_color_sysex

sysex = build_pad_color_sysex('PAD_21', RGB(120, 40, 10))
```

---

## License

MIT — see `LICENSE` for details.
