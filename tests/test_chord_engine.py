try:
    from mido import Message
except ModuleNotFoundError:  # pragma: no cover - fallback for tests
    from mido_stub import Message

from chord_builder import MiniLabChordEngine, EngineConfig, PadChord


class DummyPort:
    def __init__(self):
        self.messages = []

    def send(self, message):
        self.messages.append(message)


def test_basic_major_chord():
    port = DummyPort()
    engine = MiniLabChordEngine(port, EngineConfig())

    engine.process_message(Message('note_on', note=60, velocity=100, channel=0))
    assert {msg.note for msg in port.messages} == {60, 64, 67}


def test_chord_switching_with_pad():
    port = DummyPort()
    engine = MiniLabChordEngine(port, EngineConfig())

    engine.process_message(Message('note_on', note=37, velocity=100, channel=8))
    engine.process_message(Message('note_on', note=60, velocity=100, channel=0))

    assert engine.state.current_chord == PadChord.MINOR
    assert {msg.note for msg in port.messages} == {60, 63, 67}


def test_fader_complexity_adds_extensions():
    port = DummyPort()
    engine = MiniLabChordEngine(port, EngineConfig())

    engine.process_message(Message('control_change', control=14, value=127))
    engine.process_message(Message('note_on', note=60, velocity=100, channel=0))

    notes = {msg.note for msg in port.messages}
    assert notes.issuperset({60, 64, 67})
    assert any(note in {74, 77, 81} for note in notes)
