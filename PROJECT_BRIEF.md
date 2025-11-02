# 🧠 Project Brief — MiniLab-3 Chord Builder / Performance System

## Overview
A custom **hardware–software MIDI environment** based on the **Arturia MiniLab 3**.  
Goal: transform the controller into a *chord engine, arp/strum system, and live performance surface* with real-time LED & OLED feedback.

The project consists of:
- **Python engine** → MIDI input parser, chord generation, SysEx display/pad feedback  
- **React WebMIDI UI** → live control of OLED lines and pad colors  
- **Arturia MCC preset** → defines hardware note/CC mapping  
- **DAW integration** via macOS **IAC Driver** (“ChordOut”)

Tested OS: **macOS Sequoia**  
Languages: Python 3.13 / Node v20 / React (Vite)  

---

## Hardware Mapping Summary

| Section | Function | MIDI |
|----------|-----------|------|
| Pads 21–28 | chord types (maj, min, maj7, min7, sus2, sus4, dim, aug) | notes 36–43 (ch 9) |
| Keys | root note input | note values (ch 0) |
| Faders 1–4 | chord modifiers | CC 14, 15, 30, 31 (ch 0) |
| Encoders 1–8 | context-specific params | CC 86, 87, 89, 90 / 110, 111, 116, 117 |
| Main encoder | mode select (CC 28 rotate) / confirm (CC 118 press) | ch 0 |
| Mod strip | strum speed / modulation | CC 1 |
| Pitch strip | pitchbend / morph axis | pitchwheel |
| Shift | config modifier | CC 27 |
| Hold, Oct ± | internal / TBA (use proxy pads if needed) | — |

---

## Core Concepts

**Pads = chord types**  
Each pad triggers an interval set, e.g.:
```
maj  = [0,4,7]
min  = [0,3,7]
maj7 = [0,4,7,11]
min7 = [0,3,7,10]
sus2 = [0,2,7]
sus4 = [0,5,7]
dim  = [0,3,6]
aug  = [0,4,8]
```

**Keys = roots**  
Pressing a key adds its note value to each interval in the chosen chord type:
```
notes = [root + i for i in CHORD_MAP[current_chord]]
```

**Faders = chord modifiers**
| Fader | Parameter | Range | Effect |
|-------|------------|--------|--------|
| 1 | Complexity | 0–127 | add 7th / 9th / 11th |
| 2 | Spread | 0–127 | widen voicing 0–24 semitones |
| 3 | Octave doubling | 0–127 | add ±12/24 oct notes |
| 4 | Tension | 0–127 | add b9/#11/#5 depending on chord |

---

## Mode System (Main Encoder)

| Mode | Subtypes | Main Parameters |
|------|-----------|-----------------|
| **Chord** | Plain, Spread, Voicing1–3, Inversion Cycle, Poly-Stack | Complexity, Spread |
| **Strum** | Up, Down, UpDown, Random, Humanized | Speed, Gap, Velocity |
| **Arp** | Up, Down, PingPong, Random, Latch, Gate-Sweep | Tempo, Gate, Swing |
| **Scale** | Major, Minor, Dorian, Mixolydian, Pentatonic, User | Root, Quantize |
| **Voicing** | Compact, Open, Drop-2/3, Quartal, Hybrid | Spread, Register |
| **Rhythm** | 16-Step, Triplet, Euclidean, Random, Swing | Density, Gate%, Swing |
| **FX** | Delay, Reverb, Filter, LFO, Distortion | Rate, Depth, Mix |
| **Morph** | A→B Smooth, Quantized, Crossfade, Pad-Morph | MorphPos, Speed |
| **Performance** | Scene 1–8, Bank A/B, Mute, Solo | Scene, Volume |
| **Sampler** | One-Shot, Loop, Gate, Toggle | TriggerType, ADSR |

Press encoder = toggle between **ModeSelect** ↔ **SubtypeSelect**.

---

## SysEx Feedback

- **OLED** → two-line ASCII strings  
  - SysEx header `F0 00 20 6B 7F 42 04 02 60 01 ... F7`  
- **Pad LEDs** → RGB values (0–127 each) via  
  - `F0 00 20 6B 7F 42 02 02 16 [padID] [r] [g] [b] F7`  
- **WebMIDI UI** allows color + text editing in Chrome/Edge.

---

## Software Architecture

```
MiniLab-3
   │
   ▼
Python MIDI Engine
   ├─ Input parser
   ├─ Global state (mode, subtype, fader values)
   ├─ Chord / Strum / Arp generation
   ├─ SysEx feedback (OLED + pads)
   └─ Output → IAC “ChordOut” (port to DAW)
         ▲
         │
React WebMIDI UI  → live color/text control
```

---

## Files to Maintain

| File | Role |
|------|------|
| `chord_builder.py` | main MIDI engine |
| `minilab3_display_colors.py` | OLED + pad SysEx |
| `midi_logger.py` | port / message monitor |
| `minilab-ui/` | Vite + React WebMIDI app |
| `assets/` | SVG + PDF blueprints |
| `README.md` | public documentation |
| `PROJECT_BRIEF.md` | this file |

---

## Development Setup (macOS Sequoia)

```bash
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git python@3.13 node
python3 -m venv ~/venvs/minilab
source ~/venvs/minilab/bin/activate
pip install mido python-rtmidi
brew install --cask visual-studio-code
```

Enable IAC Driver in *Audio MIDI Setup → MIDI Studio → IAC Driver → “Device is online”*.

---

## TBA / Next Steps
- [ ] Assign functional use for Hold / Oct ± buttons  
- [ ] Implement DAW Clock Sync toggle  
- [ ] Store/recall presets to JSON  
- [ ] Live WebSocket link between Python engine and Web UI  
- [ ] Optimize SysEx batching for faster pad refresh  
- [ ] Optional VST / AU plugin bridge (future)

---

## License
MIT License — open for educational and creative use.

**Author:** [@Mihoskvs](https://github.com/Mihoskvs)  
**Year:** 2025  
**Tested on:** macOS Sequoia · Python 3.13 · Node 20 · Arturia MCC v2.15
