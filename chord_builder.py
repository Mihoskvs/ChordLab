"""MiniLab 3 chord engine.

This module exposes :class:`MiniLabChordEngine` which translates incoming MIDI
messages into extended chord voicings and manages outgoing LED/OLED feedback.

The implementation focuses on being unit-testable without requiring the
physical controller.  It stores its internal state in plain Python objects and
uses :mod:`mido` messages to represent MIDI communication.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, List, Sequence

try:
    from mido import Message
except ModuleNotFoundError:  # pragma: no cover - fallback for tests
    from mido_stub import Message


# ---------------------------------------------------------------------------
# Static definitions
# ---------------------------------------------------------------------------


class PadChord(Enum):
    """Chord types mapped to the MiniLab 3 pads."""

    MAJOR = auto()
    MINOR = auto()
    MAJOR7 = auto()
    MINOR7 = auto()
    SUS2 = auto()
    SUS4 = auto()
    DIM = auto()
    AUG = auto()


PAD_TO_CHORD: Dict[int, PadChord] = {
    36: PadChord.MAJOR,
    37: PadChord.MINOR,
    38: PadChord.MAJOR7,
    39: PadChord.MINOR7,
    40: PadChord.SUS2,
    41: PadChord.SUS4,
    42: PadChord.DIM,
    43: PadChord.AUG,
}


CHORD_INTERVALS: Dict[PadChord, Sequence[int]] = {
    PadChord.MAJOR: (0, 4, 7),
    PadChord.MINOR: (0, 3, 7),
    PadChord.MAJOR7: (0, 4, 7, 11),
    PadChord.MINOR7: (0, 3, 7, 10),
    PadChord.SUS2: (0, 2, 7),
    PadChord.SUS4: (0, 5, 7),
    PadChord.DIM: (0, 3, 6),
    PadChord.AUG: (0, 4, 8),
}


@dataclass
class FaderState:
    """Represents the value of the four chord-shaping faders."""

    complexity: int = 0
    spread: int = 0
    octave: int = 0
    tension: int = 0

    def as_dict(self) -> Dict[str, int]:
        return {
            "complexity": self.complexity,
            "spread": self.spread,
            "octave": self.octave,
            "tension": self.tension,
        }


class Mode(Enum):
    """Top-level operating modes controlled by the main encoder."""

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


MODE_ROTARY_VALUES: Sequence[Mode] = tuple(Mode)


@dataclass
class EngineConfig:
    """Tunable configuration for the chord engine."""

    velocity: int = 96
    latch: bool = False
    channel: int = 0


@dataclass
class EngineState:
    """All mutable state for the chord engine."""

    mode: Mode = Mode.CHORD
    faders: FaderState = field(default_factory=FaderState)
    current_chord: PadChord = PadChord.MAJOR
    last_root: int | None = None
    held_notes: Dict[int, List[int]] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(value, maximum))


def scale_range(value: int, in_min: int, in_max: int, out_min: float, out_max: float) -> float:
    """Map ``value`` from one range to another."""

    span_in = in_max - in_min
    span_out = out_max - out_min
    if span_in == 0:
        return out_min
    return (value - in_min) / span_in * span_out + out_min


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class MiniLabChordEngine:
    """High level manager for converting pad/key input into chords."""

    def __init__(self, output_port, config: EngineConfig | None = None):
        self.output_port = output_port
        self.config = config or EngineConfig()
        self.state = EngineState()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_message(self, message: Message) -> None:
        """Process a MIDI message from the MiniLab.

        ``message`` is a :class:`mido.Message`.  Only NoteOn/NoteOff and Control
        Change messages are handled.  Other types are ignored silently.
        """

        if message.type == "note_on" and message.velocity > 0:
            self._handle_note_on(message)
        elif message.type in {"note_off", "note_on"}:
            self._handle_note_off(message)
        elif message.type == "control_change":
            self._handle_cc(message)
        elif message.type == "pitchwheel":
            # For now we simply forward pitch wheel to the output.
            self._send(message)

    # ------------------------------------------------------------------
    # Message handlers
    # ------------------------------------------------------------------

    def _handle_note_on(self, message: Message) -> None:
        if message.channel == 8:  # pads are on channel 9 → index 8
            chord = PAD_TO_CHORD.get(message.note)
            if chord:
                self.state.current_chord = chord
                self._update_led_feedback(chord)
            return

        # Treat all other channels as keys for the root note.
        self.state.last_root = message.note
        notes = self._build_chord_notes(message.note)
        self.state.held_notes[message.note] = notes
        for note in notes:
            self._send(
                Message(
                    "note_on",
                    note=note,
                    velocity=self.config.velocity,
                    channel=self.config.channel,
                )
            )

    def _handle_note_off(self, message: Message) -> None:
        notes = self.state.held_notes.pop(message.note, [])
        for note in notes:
            self._send(Message("note_off", note=note, velocity=0, channel=self.config.channel))

    def _handle_cc(self, message: Message) -> None:
        if message.control == 28:
            self._rotate_mode(message.value)
        elif message.control == 118:
            self._toggle_mode_submenu()
        elif message.control in {14, 15, 30, 31}:
            self._update_fader(message.control, message.value)
        else:
            # Forward unhandled CC to the output for use in DAW mappings.
            self._send(message)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _rotate_mode(self, value: int) -> None:
        index_shift = -1 if value < 64 else 1
        modes = MODE_ROTARY_VALUES
        current_index = modes.index(self.state.mode)
        new_index = (current_index + index_shift) % len(modes)
        self.state.mode = modes[new_index]

    def _toggle_mode_submenu(self) -> None:
        # Placeholder for ModeSelect ↔ SubtypeSelect toggle.
        pass

    def _update_fader(self, control: int, value: int) -> None:
        if control == 14:
            self.state.faders.complexity = value
        elif control == 15:
            self.state.faders.spread = value
        elif control == 30:
            self.state.faders.octave = value
        elif control == 31:
            self.state.faders.tension = value

        if self.state.last_root is not None and self.state.last_root in self.state.held_notes:
            # Rebuild currently held notes with new fader values.
            notes = self._build_chord_notes(self.state.last_root)
            self.state.held_notes[self.state.last_root] = notes

    def _build_chord_notes(self, root: int) -> List[int]:
        intervals = list(CHORD_INTERVALS[self.state.current_chord])

        # Complexity adds extensions up to 11th.
        complexity_level = scale_range(self.state.faders.complexity, 0, 127, 0, 3)
        if complexity_level >= 1 and 9 not in intervals:
            intervals.append(14)  # 9th
        if complexity_level >= 2 and 11 not in intervals:
            intervals.append(17)  # 11th
        if complexity_level >= 3 and 13 not in intervals:
            intervals.append(21)  # 13th

        # Tension adds alterations depending on chord type.
        tension_level = scale_range(self.state.faders.tension, 0, 127, 0, 3)
        if tension_level >= 1:
            intervals.append(13)  # b9
        if tension_level >= 2:
            intervals.append(18)  # #11
        if tension_level >= 3:
            intervals.append(20)  # #5 / b13

        # Spread shifts upper notes by octaves.
        spread = int(scale_range(self.state.faders.spread, 0, 127, 0, 3))
        for i in range(1, len(intervals)):
            intervals[i] += 12 * min(spread, i)

        # Octave doubling adds copies ±12/24 semitones.
        octave_setting = self.state.faders.octave
        extra_notes: List[int] = []
        if octave_setting > 96:  # add +24
            extra_notes.extend(interval + 24 for interval in intervals)
        if octave_setting > 64:  # add +12
            extra_notes.extend(interval + 12 for interval in intervals)
        if octave_setting > 32:  # add -12
            extra_notes.extend(interval - 12 for interval in intervals)
        if octave_setting > 16:  # add -24
            extra_notes.extend(interval - 24 for interval in intervals)

        notes = [root + interval for interval in intervals]
        notes.extend(root + interval for interval in extra_notes)

        return sorted({clamp(note, 0, 127) for note in notes})

    def _update_led_feedback(self, chord: PadChord) -> None:
        # Hook for SysEx feedback integration.
        pass

    def _send(self, message: Message) -> None:
        if self.output_port is None:
            return
        self.output_port.send(message)


__all__ = [
    "FaderState",
    "EngineConfig",
    "EngineState",
    "MiniLabChordEngine",
    "PadChord",
]
