"""Simple MIDI monitor utility for debugging MiniLab 3 mappings."""
from __future__ import annotations

import argparse
import sys
from typing import Optional

import mido


def list_ports() -> None:
    print("Available MIDI inputs:")
    for name in mido.get_input_names():
        print(f"  - {name}")
    print("\nAvailable MIDI outputs:")
    for name in mido.get_output_names():
        print(f"  - {name}")


def monitor(port_name: str, raw: bool = False) -> None:
    try:
        with mido.open_input(port_name) as port:
            print(f"Listening on {port_name}. Press Ctrl+C to stop.")
            for message in port:
                if raw:
                    print(message.hex())
                else:
                    print(message)
    except KeyboardInterrupt:  # pragma: no cover - interactive utility
        print("\nStopped.")
    except IOError as exc:
        raise SystemExit(f"Failed to open MIDI port: {exc}")


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="MiniLab 3 MIDI monitor")
    parser.add_argument("port", nargs="?", help="MIDI input port name")
    parser.add_argument("--raw", action="store_true", help="Display hex data instead of parsed messages")
    parser.add_argument("--list", action="store_true", help="List available MIDI ports and exit")
    args = parser.parse_args(argv)

    if args.list or not args.port:
        list_ports()
        if not args.port:
            return
    monitor(args.port, raw=args.raw)


if __name__ == "__main__":  # pragma: no cover
    main(sys.argv[1:])
