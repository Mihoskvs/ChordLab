"""Core MIDI engine for the MiniLab 3 chord performance system.

This module exposes the :class:`ChordLabEngine` which translates incoming
MIDI messages from the Arturia MiniLab 3 into harmonically rich chord output
and real-time SysEx feedback for the pads and OLED display.

The design follows the behaviour outlined in the project brief:
- Pads 21-28 select chord types
- Keyboard keys choose the chord root
- Faders 1-4 morph the harmony via complexity, spread, octave doubling and
  tension parameters
- The main encoder switches between high level performance modes

The engine can operate entirely in software (useful for automated testing) or
hook into physical MIDI ports via ``mido``.  When running without hardware the
``MockPort`` helper captures outgoing MIDI messages so that unit tests can
assert on the generated chords.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import mido

# --- Constants -----------------------------------------------------------------

PAD_TO_CHORD: Dict[int, Tuple[str, Sequence[int]]] = {
    21: ("maj", (0, 4, 7)),
    22: ("min", (0, 3, 7)),
    23: ("maj7", (0, 4, 7, 11)),
    24: ("min7", (0, 3, 7, 10)),
    25: ("sus2", (0, 2, 7)),
    26: ("sus4", (0, 5, 7)),
    27: ("dim", (0, 3, 6)),
    28: ("aug", (0, 4, 8)),
}

FADER_CC = {
    14: "complexity",
    15: "spread",
    30: "octave",
    31: "tension",
}

ENCODER_CC = {
    86: "param_a",
    87: "param_b",
    89: "param_c",
    90: "param_d",
    110: "param_e",
    111: "param_f",
    116: "param_g",
    117: "param_h",
}

MAIN_ENCODER_CC = 28
MAIN_ENCODER_PRESS_CC = 118
SHIFT_CC = 27

# --- Helper dataclasses --------------------------------------------------------


@dataclass
class ChordModifiers:
    """Represents the current position of the four faders.

    Values are stored as their raw MIDI positions (0-127) and converted into
    meaningful musical changes by :func:`apply_modifiers`.
    """

    complexity: int = 0
    spread: int = 0
    octave: int = 0
    tension: int = 0

    def update(self, name: str, value: int) -> None:
        setattr(self, name, max(0, min(127, value)))


class PerformanceMode(Enum):
    CHORD = auto()
    STRUM = auto()
    ARP = auto()
    SCALE = auto()
    VOICING = auto()
    RHYTHM = auto()
    FX = auto()
    MORPH = auto()
    PERFORMANCE = auto()
    SAMPLER = auto()

    @classmethod
    def ordered_modes(cls) -> List["PerformanceMode"]:
        return [
            cls.CHORD,
            cls.STRUM,
            cls.ARP,
            cls.SCALE,
            cls.VOICING,
            cls.RHYTHM,
            cls.FX,
            cls.MORPH,
            cls.PERFORMANCE,
            cls.SAMPLER,
        ]


@dataclass
class ModeState:
    mode: PerformanceMode = PerformanceMode.CHORD
    subtype_index: int = 0
    subtype_mode_select: bool = False  # False → selecting mode, True → subtype

    MODES_TO_SUBTYPES: Dict[PerformanceMode, Sequence[str]] = field(
        default_factory=lambda: {
            PerformanceMode.CHORD: (
                "Plain",
                "Spread",
                "Voicing 1",
                "Voicing 2",
                "Voicing 3",
                "Poly-Stack",
            ),
            PerformanceMode.STRUM: (
                "Up",
                "Down",
                "UpDown",
                "Random",
                "Humanized",
            ),
            PerformanceMode.ARP: (
                "Up",
                "Down",
                "PingPong",
                "Random",
                "Latch",
                "Gate Sweep",
            ),
            PerformanceMode.SCALE: (
                "Major",
                "Minor",
                "Dorian",
                "Mixolydian",
                "Pentatonic",
                "User",
            ),
            PerformanceMode.VOICING: (
                "Compact",
                "Open",
                "Drop-2",
                "Drop-3",
                "Quartal",
                "Hybrid",
            ),
            PerformanceMode.RHYTHM: (
                "16-Step",
                "Triplet",
                "Euclidean",
                "Random",
                "Swing",
            ),
            PerformanceMode.FX: (
                "Delay",
                "Reverb",
                "Filter",
                "LFO",
                "Distortion",
            ),
            PerformanceMode.MORPH: (
                "A→B Smooth",
                "Quantized",
                "Crossfade",
                "Pad Morph",
            ),
            PerformanceMode.PERFORMANCE: (
                "Scene 1",
                "Scene 2",
                "Scene 3",
                "Scene 4",
                "Scene 5",
                "Scene 6",
                "Scene 7",
                "Scene 8",
            ),
            PerformanceMode.SAMPLER: (
                "One-Shot",
                "Loop",
                "Gate",
                "Toggle",
            ),
        }
    )

    def current_subtype(self) -> str:
        subtypes = self.MODES_TO_SUBTYPES[self.mode]
        return subtypes[self.subtype_index % len(subtypes)]

    def rotate_mode(self, delta: int) -> None:
        ordered = self.ordered_modes()
        current_index = ordered.index(self.mode)
        self.mode = ordered[(current_index + delta) % len(ordered)]
        self.subtype_index = 0

    @classmethod
    def ordered_modes(cls) -> Sequence[PerformanceMode]:
        return PerformanceMode.ordered_modes()


# --- SysEx helpers (delegated to minilab3_display_colors) ----------------------

try:
    from minilab3_display_colors import MiniLab3Display
except ModuleNotFoundError:  # pragma: no cover - only during standalone testing
    MiniLab3Display = None  # type: ignore


# --- Engine --------------------------------------------------------------------


class ChordLabEngine:
    """Stateful MIDI processing engine for the project."""

    def __init__(
        self,
        output_port: Optional[mido.ports.BaseOutput] = None,
        display: Optional[MiniLab3Display] = None,
    ) -> None:
        self.pad_state: Dict[int, Tuple[str, Sequence[int]]] = PAD_TO_CHORD
        self.current_pad: int = 21
        self.root_note: Optional[int] = None
        self.modifiers = ChordModifiers()
        self.mode_state = ModeState()
        self.output_port = output_port or MockPort()
        self.display = display
        self.shift_held = False
        self.active_chords: Dict[int, List[int]] = {}
        self._update_display()

    # -- Public API -------------------------------------------------------------

    def process_message(self, message: mido.Message) -> None:
        """Main entry point for MIDI events."""

        if message.type == "control_change":
            if message.control == SHIFT_CC:
                self.shift_held = message.value >= 64
                return

            if message.control == MAIN_ENCODER_CC:
                direction = 1 if message.value > 64 else -1
                if self.mode_state.subtype_mode_select:
                    self._rotate_subtype(direction)
                else:
                    self.mode_state.rotate_mode(direction)
                self._update_display()
                return

            if message.control == MAIN_ENCODER_PRESS_CC and message.value > 0:
                self.mode_state.subtype_mode_select = not self.mode_state.subtype_mode_select
                self._update_display()
                return

            if message.control in FADER_CC:
                self.modifiers.update(FADER_CC[message.control], message.value)
                self._update_display()
                return

        if message.type in {"note_on", "note_off"} and message.channel == 8:
            self._handle_pad(message)
            return

        if message.type in {"note_on", "note_off"}:
            self._handle_key(message)
            return

    # -- Internal helpers -------------------------------------------------------

    def _handle_pad(self, message: mido.Message) -> None:
        if message.type == "note_on" and message.velocity > 0:
            pad = message.note
            if pad in self.pad_state:
                self.current_pad = pad
                self._update_display()

    def _handle_key(self, message: mido.Message) -> None:
        note = message.note
        if message.type == "note_on" and message.velocity > 0:
            self.root_note = note
            chord_notes = self._build_chord(note)
            self.active_chords[note] = chord_notes
            self._send_chord(chord_notes, velocity=message.velocity)
        elif message.type == "note_off":
            if note in self.active_chords:
                chord_notes = self.active_chords.pop(note)
                self._send_chord(chord_notes, note_on=False)

    def _rotate_subtype(self, delta: int) -> None:
        subtypes = self.mode_state.MODES_TO_SUBTYPES[self.mode_state.mode]
        self.mode_state.subtype_index = (self.mode_state.subtype_index + delta) % len(subtypes)

    def _update_display(self) -> None:
        if not self.display:
            return
        chord_name, _ = self.pad_state[self.current_pad]
        line1 = f"{self.mode_state.mode.name.title()} : {self.mode_state.current_subtype()}"
        if self.root_note is None:
            line2 = f"Chord: {chord_name.upper()}"
        else:
            root_name = note_name(self.root_note)
            line2 = f"{root_name} {chord_name.upper()}"
        self.display.set_oled_lines(line1, line2)

    def _build_chord(self, root: int) -> List[int]:
        chord_name, base_intervals = self.pad_state[self.current_pad]
        notes = [root + interval for interval in base_intervals]
        notes = self._apply_complexity(notes, chord_name)
        notes = self._apply_spread(notes)
        notes = self._apply_octave(notes)
        notes = self._apply_tension(notes, chord_name)
        return sorted(dict.fromkeys(notes))

    # -- Modifier implementations ----------------------------------------------

    def _apply_complexity(self, notes: List[int], chord_name: str) -> List[int]:
        value = self.modifiers.complexity
        if value < 32:
            return notes
        additions: List[int] = []
        if value >= 32:
            additions.append(10 if "min" in chord_name else 11)
        if value >= 64:
            additions.append(14)
        if value >= 96:
            additions.append(17)
        return notes + [notes[0] - notes[0] + add for add in additions]

    def _apply_spread(self, notes: List[int]) -> List[int]:
        value = self.modifiers.spread
        if value == 0 or len(notes) < 2:
            return notes
        spread_range = int(round((value / 127) * 24))
        spread_notes = notes[:]
        for i in range(1, len(spread_notes), 2):
            spread_notes[i] += spread_range
        return spread_notes

    def _apply_octave(self, notes: List[int]) -> List[int]:
        value = self.modifiers.octave
        additions: List[int] = []
        if value >= 32:
            additions.extend([note + 12 for note in notes])
        if value >= 96:
            additions.extend([note - 12 for note in notes])
        if value >= 120:
            additions.extend([note + 24 for note in notes])
        return notes + additions

    def _apply_tension(self, notes: List[int], chord_name: str) -> List[int]:
        value = self.modifiers.tension
        if value < 32:
            return notes
        if "maj" in chord_name or chord_name in {"sus2", "sus4", "aug"}:
            extra = [14, 18]  # 9th and #11
        elif "min" in chord_name:
            extra = [13, 17]  # b9 and 11
        elif chord_name == "dim":
            extra = [15]
        else:
            extra = [14]
        max_count = 1 + (value // 48)
        additions = extra[:max_count]
        root = notes[0]
        return notes + [root + interval for interval in additions]

    def _send_chord(self, notes: Iterable[int], velocity: int = 100, note_on: bool = True) -> None:
        msg_type = "note_on" if note_on else "note_off"
        for note in notes:
            msg = mido.Message(msg_type, note=note, velocity=velocity if note_on else 0)
            self.output_port.send(msg)


# --- Utilities -----------------------------------------------------------------


def note_name(note: int) -> str:
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    octave = (note // 12) - 1
    return f"{names[note % 12]}{octave}"


class MockPort(mido.ports.BaseOutput):  # pragma: no cover - very small shim
    """Simple ``mido`` compatible port that stores messages in memory."""

    def __init__(self) -> None:
        super().__init__()
        self.messages: List[mido.Message] = []

    def _send(self, message: mido.Message) -> None:
        self.messages.append(message)

    def clear(self) -> None:
        self.messages.clear()


def available_ports() -> Tuple[List[str], List[str]]:
    """Return lists of available input and output ports."""

    return list(mido.get_input_names()), list(mido.get_output_names())


def main() -> None:  # pragma: no cover - CLI glue
    import argparse

    parser = argparse.ArgumentParser(description="MiniLab 3 chord builder engine")
    parser.add_argument("--input", help="MIDI input port name")
    parser.add_argument("--output", help="MIDI output port name")
    parser.add_argument("--dry-run", action="store_true", help="Run without MIDI ports")
    args = parser.parse_args()

    if args.dry_run:
        engine = ChordLabEngine()
        print("Running in dry-run mode. Use Ctrl+C to exit.")
        try:
            while True:
                pass
        except KeyboardInterrupt:
            return

    if not args.input or not args.output:
        inputs, outputs = available_ports()
        raise SystemExit(
            "Input/output ports must be provided unless --dry-run is set.\n"
            f"Available inputs: {inputs}\nAvailable outputs: {outputs}"
        )

    with mido.open_input(args.input) as in_port, mido.open_output(args.output) as out_port:
        engine = ChordLabEngine(output_port=out_port)
        print("Listening for MIDI messages. Press Ctrl+C to stop.")
        try:
            for message in in_port:
                engine.process_message(message)
        except KeyboardInterrupt:
            print("Stopping.")


if __name__ == "__main__":  # pragma: no cover
    main()
