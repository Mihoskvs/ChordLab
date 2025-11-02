"""MiniLab 3 chord engine.

This module exposes :class:`MiniLabChordEngine` which translates incoming MIDI
messages into extended chord voicings and manages outgoing LED/OLED feedback.

The implementation focuses on being unit-testable without requiring the
physical controller. It stores internal state in plain Python objects and uses
:meth:`mido.Message` compatible packets for MIDI communication.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, List, Optional, Sequence

try:  # pragma: no cover - exercised in tests through the stub
    from mido import Message
except ModuleNotFoundError:  # pragma: no cover - fallback for tests
    from mido_stub import Message  # type: ignore

from minilab3_display_colors import RGB, build_oled_sysex, build_pad_color_sysex


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


# Pads send notes 36-43 on channel 9 (index 8)
PAD_NOTE_TO_CHORD: Dict[int, PadChord] = {
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

PAD_TO_LED_ID: Dict[PadChord, str] = {
    PadChord.MAJOR: 'PAD_21',
    PadChord.MINOR: 'PAD_22',
    PadChord.MAJOR7: 'PAD_23',
    PadChord.MINOR7: 'PAD_24',
    PadChord.SUS2: 'PAD_25',
    PadChord.SUS4: 'PAD_26',
    PadChord.DIM: 'PAD_27',
    PadChord.AUG: 'PAD_28',
}

PAD_BASE_COLOURS: Dict[PadChord, RGB] = {
    PadChord.MAJOR: RGB(64, 16, 16),
    PadChord.MINOR: RGB(16, 64, 32),
    PadChord.MAJOR7: RGB(60, 32, 64),
    PadChord.MINOR7: RGB(32, 60, 64),
    PadChord.SUS2: RGB(16, 64, 64),
    PadChord.SUS4: RGB(12, 40, 72),
    PadChord.DIM: RGB(64, 8, 64),
    PadChord.AUG: RGB(80, 40, 12),
}

CHORD_DISPLAY_LABELS: Dict[PadChord, str] = {
    PadChord.MAJOR: 'MAJ',
    PadChord.MINOR: 'MIN',
    PadChord.MAJOR7: 'MAJ7',
    PadChord.MINOR7: 'MIN7',
    PadChord.SUS2: 'SUS2',
    PadChord.SUS4: 'SUS4',
    PadChord.DIM: 'DIM',
    PadChord.AUG: 'AUG',
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
MODE_SUBTYPES: Dict[Mode, Sequence[str]] = {
    Mode.CHORD: ('Plain', 'Spread', 'Voicing 1', 'Voicing 2', 'Voicing 3', 'Poly-Stack'),
    Mode.STRUM: ('Up', 'Down', 'UpDown', 'Random', 'Humanized'),
    Mode.ARP: ('Up', 'Down', 'PingPong', 'Random', 'Latch', 'Gate-Sweep'),
    Mode.SCALE: ('Major', 'Minor', 'Dorian', 'Mixolydian', 'Pentatonic', 'User'),
    Mode.VOICING: ('Compact', 'Open', 'Drop-2', 'Drop-3', 'Quartal', 'Hybrid'),
    Mode.RHYTHM: ('16-Step', 'Triplet', 'Euclidean', 'Random', 'Swing'),
    Mode.FX: ('Delay', 'Reverb', 'Filter', 'LFO', 'Distortion'),
    Mode.MORPH: ('A→B Smooth', 'Quantized', 'Crossfade', 'Pad Morph'),
    Mode.PERFORMANCE: ('Scene 1', 'Scene 2', 'Scene 3', 'Scene 4', 'Scene 5', 'Scene 6', 'Scene 7', 'Scene 8'),
    Mode.SAMPLER: ('One-Shot', 'Loop', 'Gate', 'Toggle'),
}

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


# ---------------------------------------------------------------------------
# Dataclasses and helpers
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


def note_name(note: int) -> str:
    """Return scientific pitch notation (C4, Eb3, …)."""

    name = NOTE_NAMES[note % 12]
    octave = (note // 12) - 1
    return f'{name}{octave}'


def boost_colour(colour: RGB, amount: int = 20) -> RGB:
    return RGB(
        min(colour.r + amount, 127),
        min(colour.g + amount, 127),
        min(colour.b + amount, 127),
    )


@dataclass
class FaderState:
    """Represents the value of the four chord-shaping faders."""

    complexity: int = 0
    spread: int = 0
    octave: int = 0
    tension: int = 0

    def as_dict(self) -> Dict[str, int]:
        return {
            'complexity': self.complexity,
            'spread': self.spread,
            'octave': self.octave,
            'tension': self.tension,
        }


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
    mode_sub_index: int = 0
    mode_select_submenu: bool = False
    faders: FaderState = field(default_factory=FaderState)
    current_chord: PadChord = PadChord.MAJOR
    last_root: Optional[int] = None
    held_notes: Dict[int, List[int]] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class MiniLabChordEngine:
    """High level manager for converting pad/key input into chords."""

    def __init__(
        self,
        output_port,
        config: Optional[EngineConfig] = None,
        *,
        feedback_port=None,
    ) -> None:
        self.output_port = output_port
        self.feedback_port = feedback_port
        self.config = config or EngineConfig()
        self.state = EngineState()
        self._push_mode_feedback()
        self._update_led_feedback(self.state.current_chord)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_message(self, message: Message) -> None:
        """Process a MIDI message from the MiniLab."""

        if message.type == 'note_on' and getattr(message, 'velocity', 0) > 0:
            self._handle_note_on(message)
        elif message.type in {'note_off', 'note_on'}:
            self._handle_note_off(message)
        elif message.type == 'control_change':
            self._handle_cc(message)
        elif message.type == 'pitchwheel':
            # Forward pitch wheel to the output as-is.
            self._send(message)

    # ------------------------------------------------------------------
    # Message handlers
    # ------------------------------------------------------------------

    def _handle_note_on(self, message: Message) -> None:
        if getattr(message, 'channel', 0) == 8:  # Pads live on channel 9 → index 8
            self._handle_pad_press(message.note)
            return

        root = message.note
        self.state.last_root = root
        notes = self._build_chord_notes(root)
        self.state.held_notes[root] = notes
        for note in notes:
            self._send(
                Message(
                    'note_on',
                    note=note,
                    velocity=self.config.velocity,
                    channel=self.config.channel,
                )
            )
        self._update_chord_display(root)

    def _handle_note_off(self, message: Message) -> None:
        if self.config.latch:
            return
        notes = self.state.held_notes.pop(message.note, [])
        for note in notes:
            self._send(Message('note_off', note=note, velocity=0, channel=self.config.channel))
        if self.state.last_root == message.note:
            self.state.last_root = None
            self._push_mode_feedback()

    def _handle_cc(self, message: Message) -> None:
        control = getattr(message, 'control', None)
        value = getattr(message, 'value', 0)
        if control == 28:
            self._rotate_mode(value)
        elif control == 118 and value > 0:
            self._toggle_mode_submenu()
        elif control in {14, 15, 30, 31}:
            self._update_fader(control, value)
        else:
            # Forward unhandled CC to the output for use in DAW mappings.
            self._send(message)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _handle_pad_press(self, note: int) -> None:
        chord = PAD_NOTE_TO_CHORD.get(note)
        if chord is None:
            return
        if chord is self.state.current_chord:
            self._update_led_feedback(chord)
            return
        self.state.current_chord = chord
        self._update_led_feedback(chord)
        self._refresh_current_chord()

    def _rotate_mode(self, value: int) -> None:
        if value == 64:  # detent
            return
        direction = 1 if value > 64 else -1
        if self.state.mode_select_submenu:
            self.state.mode_sub_index = (self.state.mode_sub_index + direction) % len(MODE_SUBTYPES[self.state.mode])
        else:
            modes = MODE_ROTARY_VALUES
            current_index = modes.index(self.state.mode)
            new_index = (current_index + direction) % len(modes)
            self.state.mode = modes[new_index]
            self.state.mode_sub_index = 0
        self._push_mode_feedback()

    def _toggle_mode_submenu(self) -> None:
        self.state.mode_select_submenu = not self.state.mode_select_submenu
        self._push_mode_feedback()

    def _update_fader(self, control: int, value: int) -> None:
        value = clamp(value, 0, 127)
        if control == 14:
            self.state.faders.complexity = value
        elif control == 15:
            self.state.faders.spread = value
        elif control == 30:
            self.state.faders.octave = value
        elif control == 31:
            self.state.faders.tension = value
        self._refresh_current_chord()

    def _refresh_current_chord(self) -> None:
        root = self.state.last_root
        if root is None or root not in self.state.held_notes:
            return
        previous = set(self.state.held_notes.get(root, []))
        updated = set(self._build_chord_notes(root))

        for note in previous - updated:
            self._send(Message('note_off', note=note, velocity=0, channel=self.config.channel))
        for note in updated - previous:
            self._send(Message('note_on', note=note, velocity=self.config.velocity, channel=self.config.channel))

        self.state.held_notes[root] = sorted(updated)
        self._update_chord_display(root)

    def _build_chord_notes(self, root: int) -> List[int]:
        intervals = list(CHORD_INTERVALS[self.state.current_chord])

        # Complexity adds extensions up to 13th.
        complexity_level = scale_range(self.state.faders.complexity, 0, 127, 0, 3)
        if complexity_level >= 1 and 14 not in intervals:
            intervals.append(14)  # 9th
        if complexity_level >= 2 and 17 not in intervals:
            intervals.append(17)  # 11th
        if complexity_level >= 3 and 21 not in intervals:
            intervals.append(21)  # 13th

        # Tension adds alterations depending on chord type.
        tension_level = scale_range(self.state.faders.tension, 0, 127, 0, 3)
        if tension_level >= 1:
            intervals.append(13)  # b9
        if tension_level >= 2:
            intervals.append(18)  # #11
        if tension_level >= 3:
            intervals.append(20)  # #5 / b13

        # Spread shifts upper notes by octaves to open the voicing.
        spread = int(scale_range(self.state.faders.spread, 0, 127, 0, 3))
        for index in range(1, len(intervals)):
            intervals[index] += 12 * min(spread, index)

        # Octave doubling adds copies ±12/24 semitones.
        octave_setting = self.state.faders.octave
        extra_notes: List[int] = []
        if octave_setting > 96:
            extra_notes.extend(interval + 24 for interval in intervals)
        if octave_setting > 64:
            extra_notes.extend(interval + 12 for interval in intervals)
        if octave_setting > 32:
            extra_notes.extend(interval - 12 for interval in intervals)
        if octave_setting > 16:
            extra_notes.extend(interval - 24 for interval in intervals)

        notes = [root + interval for interval in intervals]
        notes.extend(root + interval for interval in extra_notes)

        return sorted({clamp(note, 0, 127) for note in notes})

    # ------------------------------------------------------------------
    # Feedback helpers
    # ------------------------------------------------------------------

    def _update_led_feedback(self, active: PadChord) -> None:
        if self.feedback_port is None:
            return
        for chord, pad_id in PAD_TO_LED_ID.items():
            base_colour = PAD_BASE_COLOURS[chord]
            colour = boost_colour(base_colour) if chord is active else base_colour
            self._send_sysex(build_pad_color_sysex(pad_id, colour))

    def _push_mode_feedback(self) -> None:
        if self.feedback_port is None:
            return
        mode_label = self.state.mode.name.title()
        subtype = MODE_SUBTYPES[self.state.mode][self.state.mode_sub_index % len(MODE_SUBTYPES[self.state.mode])]
        if self.state.mode_select_submenu:
            line1 = f'Mode* {mode_label}'
            line2 = f'> {subtype}'
        else:
            line1 = f'Mode {mode_label}'
            line2 = subtype
        self._send_sysex(build_oled_sysex(line1, line2))

    def _update_chord_display(self, root: Optional[int]) -> None:
        if self.feedback_port is None:
            return
        if root is None:
            self._push_mode_feedback()
            return
        label = CHORD_DISPLAY_LABELS[self.state.current_chord]
        mode_label = self.state.mode.name.title()
        subtype = MODE_SUBTYPES[self.state.mode][self.state.mode_sub_index % len(MODE_SUBTYPES[self.state.mode])]
        line1 = f'{note_name(root)} {label}'
        line2 = f'{mode_label}: {subtype}'
        self._send_sysex(build_oled_sysex(line1, line2))

    def _send(self, message: Message) -> None:
        if self.output_port is None:
            return
        self.output_port.send(message)

    def _send_sysex(self, payload: bytes) -> None:
        if self.feedback_port is None:
            return
        data = list(payload)
        if data and data[0] == 0xF0 and data[-1] == 0xF7:
            data = data[1:-1]
        self.feedback_port.send(Message('sysex', data=data))


__all__ = [
    'FaderState',
    'EngineConfig',
    'EngineState',
    'MiniLabChordEngine',
    'PadChord',
]
