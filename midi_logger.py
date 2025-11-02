"""Simple terminal logger for incoming/outgoing MIDI ports."""
from __future__ import annotations

import contextlib
import sys
import time
from typing import Iterable, Optional

try:
    from mido import open_input, open_output
except ModuleNotFoundError:  # pragma: no cover - fallback for tests
    from mido_stub import open_input, open_output



class MidiLogger:
    """Mirror MIDI messages between ports while printing them."""

    def __init__(self, input_port: str, output_port: Optional[str] = None):
        self.input_name = input_port
        self.output_name = output_port

    def run(self) -> None:
        with contextlib.ExitStack() as stack:
            in_port = stack.enter_context(open_input(self.input_name))
            out_port = stack.enter_context(open_output(self.output_name)) if self.output_name else None
            print(f"Listening on {self.input_name}. Forwarding to {self.output_name or '[none]'}")
            for message in in_port:
                timestamp = time.strftime("%H:%M:%S")
                print(f"[{timestamp}] {message}")
                if out_port is not None:
                    out_port.send(message)


def list_ports() -> Iterable[str]:
    try:
        from mido import get_input_names
    except ModuleNotFoundError:  # pragma: no cover - fallback for tests
        from mido_stub import get_input_names

    return get_input_names()


def main(argv: list[str] | None = None) -> int:
    argv = list(argv or sys.argv[1:])
    if not argv:
        print("Usage: midi_logger.py <input-port> [output-port]", file=sys.stderr)
        return 1
    input_port = argv[0]
    output_port = argv[1] if len(argv) > 1 else None
    MidiLogger(input_port, output_port).run()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
