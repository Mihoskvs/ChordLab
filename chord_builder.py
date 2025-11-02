"""Core MIDI chord engine for the MiniLab-3 chord builder project.

This module implements the central state machine that interprets
incoming MIDI data from the Arturia MiniLab 3, translates pad presses
into chord qualities, merges keyboard roots and fader based modifiers,
and finally emits playable MIDI note lists along with feedback events
for the controller display.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Iterable, List, Sequence, Tuple

import mido

# --- Chord definitions ----------------------------------------------------

CHORD_TYPES: Dict[str, Tuple[int, ...]] = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
    "maj7": (0, 4, 7, 11),
    "min7": (0, 3, 7, 10),
    "sus2": (0, 2, 7),
    "sus4": (0, 5, 7),
    "dim": (0, 3, 6),
    "aug": (0, 4, 8),
}


class Mode(Enum):
    """High level performance modes toggled by the main encoder."""

    CHORD = "chord"
    STRUM = "strum"
    ARP = "arp"
    SCALE = "scale"
    VOICING = "voicing"
    RHYTHM = "rhythm"
    FX = "fx"
    MORPH = "morph"
    PERFORMANCE = "performance"
    SAMPLER = "sampler"


# --- Controller ranges ----------------------------------------------------

PAD_NOTE_RANGE = range(36, 44)  # Pads 21-28 transmit notes 36-43 on channel 9
CHORD_FADERS = (14, 15, 30, 31)  # CC numbers for complexity/spread/octave/tension
ENCODER_CC = (86, 87, 89, 90, 110, 111, 116, 117)
MODE_ENCODER_CC = 28
MODE_ENCODER_PRESS = 118
SHIFT_CC = 27


@dataclass
class FaderState:
    """Holds the continuous values of the four modifier faders."""

    complexity: int = 0
    spread: int = 0
    octave: int = 0
    tension: int = 0

    def update_from_cc(self, cc: int, value: int) -> None:
        if cc == CHORD_FADERS[0]:
            self.complexity = value
        elif cc == CHORD_FADERS[1]:
            self.spread = value
        elif cc == CHORD_FADERS[2]:
            self.octave = value
        elif cc == CHORD_FADERS[3]:
            self.tension = value


@dataclass
class ControllerState:
    """Represents the global performance state of the controller."""

    active_chord: str = "maj"
    root_note: int = 60
    faders: FaderState = field(default_factory=FaderState)
    mode: Mode = Mode.CHORD
    subtype_index: int = 0
    shift_held: bool = False

    def chord_intervals(self) -> Sequence[int]:
        return CHORD_TYPES[self.active_chord]


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def _spread_offsets(spread_value: int, base_intervals: Sequence[int]) -> List[int]:
    """Apply the spread fader to the base intervals."""

    if not base_intervals:
        return []

    max_spread = 24
    spread_semitones = round((spread_value / 127) * max_spread)
    offsets: List[int] = []
    for index, interval in enumerate(base_intervals):
        offsets.append(interval + index * spread_semitones)
    return offsets


def _apply_octave_doubling(octave_value: int, intervals: Iterable[int]) -> List[int]:
    base = list(intervals)
    if octave_value >= 85:  # add +24 & +12
        base.extend(i + 24 for i in base)
        base.extend(i + 12 for i in base)
    elif octave_value >= 64:  # add +12
        base.extend(i + 12 for i in base)
    elif octave_value >= 42:  # add -12 and +12
        base.extend(i + 12 for i in base)
        base.extend(i - 12 for i in base)
    elif octave_value >= 21:  # add -12
        base.extend(i - 12 for i in base)
    return base


def _apply_complexity(complexity_value: int, chord: str, intervals: Iterable[int]) -> List[int]:
    base = list(intervals)
    if complexity_value >= 96:
        base.append(14)  # add 9th
        base.append(17)  # add 11th
    elif complexity_value >= 64:
        base.append(14)
    elif complexity_value >= 32 and chord in {"maj", "min", "sus2", "sus4"}:
        base.append(11 if chord == "maj" else 10)
    return base


def _apply_tension(tension_value: int, chord: str, intervals: Iterable[int]) -> List[int]:
    base = list(intervals)
    if tension_value < 42:
        return base
    if chord in {"maj", "maj7", "sus4"}:
        base.append(6)  # #11
    elif chord in {"min", "min7"}:
        base.append(13)  # b9
    else:
        base.append(8)  # #5 / b13
    if tension_value >= 96:
        base.append(20)  # add #9 / 13 color tone
    return base


def generate_voicing(state: ControllerState, root: int | None = None) -> List[int]:
    """Return a list of MIDI note numbers for the active chord state."""

    root_note = state.root_note if root is None else root
    base_intervals = list(state.chord_intervals())
    intervals = _spread_offsets(state.faders.spread, base_intervals)
    intervals = _apply_complexity(state.faders.complexity, state.active_chord, intervals)
    intervals = _apply_octave_doubling(state.faders.octave, intervals)
    intervals = _apply_tension(state.faders.tension, state.active_chord, intervals)
    notes = sorted({root_note + interval for interval in intervals})
    return [_clamp(note, 0, 127) for note in notes]


class MiniLabChordEngine:
    """High level interface tying MIDI input to chord generation."""

    def __init__(self, input_name: str, output_name: str | None = None) -> None:
        self.state = ControllerState()
        self.input_name = input_name
        self.output_name = output_name
        self.input_port = mido.open_input(input_name)
        self.output_port = mido.open_output(output_name) if output_name else None

    # -- message handling -------------------------------------------------

    def handle_message(self, message: mido.Message) -> None:
        if message.type == "note_on" and message.velocity > 0:
            self._handle_note_on(message)
        elif message.type == "control_change":
            self._handle_control_change(message)
        elif message.type == "pitchwheel":
            self._handle_pitch(message)

    def _handle_note_on(self, message: mido.Message) -> None:
        if message.channel == 8 and message.note in PAD_NOTE_RANGE:
            index = message.note - PAD_NOTE_RANGE.start
            self.state.active_chord = list(CHORD_TYPES.keys())[index]
        else:
            self.state.root_note = message.note
            notes = generate_voicing(self.state, message.note)
            self._emit_chord(notes, message.velocity)

    def _handle_control_change(self, message: mido.Message) -> None:
        if message.control in CHORD_FADERS:
            self.state.faders.update_from_cc(message.control, message.value)
        elif message.control == MODE_ENCODER_CC:
            # encoder uses 65/63 for inc/dec
            if message.value == 65:
                self._cycle_mode(1)
            elif message.value == 63:
                self._cycle_mode(-1)
        elif message.control == MODE_ENCODER_PRESS:
            self.state.subtype_index = (self.state.subtype_index + 1) % 8
        elif message.control == SHIFT_CC:
            self.state.shift_held = message.value >= 64

    def _handle_pitch(self, message: mido.Message) -> None:
        # Placeholder hook for morph axis. Currently not used but kept to
        # illustrate where modulation logic would plug in.
        pass

    # -- helpers ----------------------------------------------------------

    def _cycle_mode(self, delta: int) -> None:
        modes = list(Mode)
        index = modes.index(self.state.mode)
        self.state.mode = modes[(index + delta) % len(modes)]

    def _emit_chord(self, notes: Sequence[int], velocity: int) -> None:
        if not self.output_port:
            return
        for note in notes:
            self.output_port.send(mido.Message("note_on", note=note, velocity=velocity, channel=0))
        for note in notes:
            self.output_port.send(mido.Message("note_off", note=note, velocity=0, channel=0))

    # -- lifecycle --------------------------------------------------------

    def run(self) -> None:
        for message in self.input_port:
            self.handle_message(message)


__all__ = [
    "CHORD_TYPES",
    "ControllerState",
    "FaderState",
    "Mode",
    "MiniLabChordEngine",
    "generate_voicing",
]
