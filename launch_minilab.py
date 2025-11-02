"""Launcher: auto-detect MiniLab ports and run the chord engine.

- Finds MiniLab input/output
- Uses IAC/loopback if present; else creates virtual MIDI out "ChordLab Out"
- Sends LED/OLED feedback to the MiniLab output

Usage:
  python launch_minilab.py
"""
from __future__ import annotations

import os
import sys
from contextlib import ExitStack
from typing import Optional

try:
    import mido  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    import mido_stub as mido  # type: ignore

from chord_builder import EngineConfig, MiniLabChordEngine


def pick_first(names: list[str], *needles: str) -> Optional[str]:
    needles_lower = [n.lower() for n in needles]
    for name in names:
        lower = name.lower()
        if any(n in lower for n in needles_lower):
            return name
    return None


def find_ports() -> tuple[Optional[str], Optional[str], Optional[str], bool]:
    in_name = os.getenv("CHORDLAB_IN")
    out_name = os.getenv("CHORDLAB_OUT")
    fb_name = os.getenv("CHORDLAB_FB")

    inputs = list(mido.get_input_names())
    outputs = list(mido.get_output_names())

    if not in_name:
        in_name = pick_first(inputs, "minilab", "arturia") or (inputs[0] if inputs else None)
    if not fb_name:
        fb_name = pick_first(outputs, "minilab", "arturia")

    created_virtual_out = False
    if not out_name:
        out_name = pick_first(outputs, "iac", "chordout", "loopmidi", "loopbe", "bus")
        if not out_name:
            created_virtual_out = True

    return in_name, out_name, fb_name, created_virtual_out


def main() -> int:
    in_name, out_name, fb_name, need_virtual_out = find_ports()

    if in_name is None:
        print("Could not find MiniLab input. Available inputs:", mido.get_input_names(), file=sys.stderr)
        return 2
    if fb_name is None:
        print("Could not find MiniLab output for feedback. Available outputs:", mido.get_output_names(), file=sys.stderr)
        return 2

    print("Inputs:", mido.get_input_names())
    print("Outputs:", mido.get_output_names())

    with ExitStack() as stack:
        in_port = stack.enter_context(mido.open_input(in_name))

        if need_virtual_out:
            print("No loopback found; creating virtual output 'ChordLab Out'")
            out_port = stack.enter_context(mido.open_output("ChordLab Out", virtual=True))
            print("In your DAW, set instrument track input to 'ChordLab Out'.")
        else:
            out_port = stack.enter_context(mido.open_output(out_name))

        fb_port = stack.enter_context(mido.open_output(fb_name))

        engine = MiniLabChordEngine(out_port, EngineConfig(velocity=96, channel=0, latch=False), feedback_port=fb_port)
        print(f"Listening on {in_name} -> chords to {getattr(out_port, 'name', 'ChordLab Out')} -> feedback to {fb_name}")
        print("Ctrl+C to stop.")
        try:
            for message in in_port:
                engine.process_message(message)
        except KeyboardInterrupt:
            return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
