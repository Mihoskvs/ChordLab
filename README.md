# ChordLab
[CURRENTLY ONLY FOR MINILAB 3] Convert your MIDI Controller into a Chord builder inspired by Orchid by Telepathic Instruments.

# 🎛 MiniLab-3 Chord Builder / Performance System

A hybrid **hardware–software MIDI environment** built around the **Arturia MiniLab 3**, turning it into a powerful *chord engine, arpeggiator, and live performance controller*.

---

## 🧩 Overview

This project re-uses the MiniLab 3’s pads, faders, encoders, and OLED display to generate, manipulate, and visualize complex chords and performance modes.  
It includes:

- A **Python backend** (MIDI engine, chord generator, SysEx feedback)
- A **React frontend** (WebMIDI app for live LED & OLED control)
- Full **Arturia MCC** mapping setup and open MIDI routing via the **IAC Driver** on macOS

---

## 🧠 Concept

- **Pads (21–28)** select *chord types* — e.g. major, minor, sus2, diminished.  
- **Keys** on the keyboard set the *root note* — the actual pitch of the chord.  
- **Faders** define *chord complexity and shape*:  
  - F1 → Complexity (triad → 7th → 9th → 11th)  
  - F2 → Spread (voice distance, 0–24 semitones)  
  - F3 → Octave doubling (0, ±12, ±24)  
  - F4 → Tension (adds #11, b9, #5, etc.)
- **Main encoder** switches *modes* (Chord / Strum / Arp / Scale / Voicing / Rhythm / FX / Morph / Performance / Sampler*).  
  - Turn = select mode  
  - Press = enter subtype  
- **OLED** and **pad LEDs** provide live feedback via SysEx messages.  
- **IAC “ChordOut”** virtual port sends playable MIDI output to your DAW or synth.

---

## 🔧 Hardware Mapping Summary

| Control | Type | MIDI | Function |
|----------|------|------|-----------|
| Pads 21–28 | note 36–43 (ch 9) | Chord types | maj / min / maj7 / min7 / sus2 / sus4 / dim / aug |
| Faders 1–4 | CC 14 / 15 / 30 / 31 | Chord modifiers | complexity / spread / oct / tension |
| Encoders 1–8 | CC 86 / 87 / 89 / 90 / 110 / 111 / 116 / 117 | Context parameters |
| Main encoder | CC 28 (rotate), CC 118 (click) | Mode / Subtype selector |
| Mod strip | CC 1 | Strum speed / Mod depth |
| Pitch strip | Pitchwheel | Pitchbend / Morph axis |
| Shift | CC 27 | Config modifier |
| Hold, Oct ± | internal / TBA | optional DAW sync / range shift |

---

## 🖥️ Installation

### TBA

