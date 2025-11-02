"""Utility script to monitor MIDI traffic for debugging the chord engine."""
from __future__ import annotations

import argparse
import contextlib
import sys
import time
from typing import Iterable, Optional

import mido


def list_ports() -> None:
    print("Available MIDI inputs:")
    for name in mido.get_input_names():
        print(f"  in : {name}")
    print("\nAvailable MIDI outputs:")
    for name in mido.get_output_names():
        print(f"  out: {name}")


def log_messages(port_name: str, duration: Optional[float] = None) -> None:
    with contextlib.closing(mido.open_input(port_name)) as port:
        print(f"Listening on {port_name}... Press Ctrl+C to stop.")
        start = time.time()
        for message in port:
            print(message)
            if duration and (time.time() - start) > duration:
                break


def forward_messages(input_port: str, output_port: str) -> None:
    with contextlib.closing(mido.open_input(input_port)) as in_port, contextlib.closing(
        mido.open_output(output_port)
    ) as out_port:
        print(f"Forwarding {input_port} -> {output_port}. Ctrl+C to quit.")
        for message in in_port:
            print(message)
            out_port.send(message)


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniLab 3 MIDI monitor")
    parser.add_argument("port", nargs="?", help="Input port name. If omitted only lists ports.")
    parser.add_argument("--duration", type=float, help="Optional duration in seconds to capture")
    parser.add_argument("--forward", metavar="OUTPUT", help="Forward incoming messages to OUTPUT")
    args = parser.parse_args(list(argv) if argv is not None else None)

    if not args.port:
        list_ports()
        return 0

    if args.forward:
        forward_messages(args.port, args.forward)
    else:
        log_messages(args.port, args.duration)
    return 0


if __name__ == "__main__":
    sys.exit(main())
