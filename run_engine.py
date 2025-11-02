"""CLI runner for the MiniLab 3 chord engine.

Examples
  List ports
    python run_engine.py --list

  Run with explicit ports (recommended)
    python run_engine.py --in "MiniLab" --out "IAC" --fb "MiniLab"

  Auto-pick ports by name heuristics
    python run_engine.py --auto
"""
from __future__ import annotations

import argparse
import sys
from typing import Iterable, Optional

try:
    import mido  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - allow running without system MIDI
    import mido_stub as mido  # type: ignore

from chord_builder import EngineConfig, MiniLabChordEngine

# Default pad notes as per brief (pads 21–28 → notes 36–43).
# Can be overridden by setting CHORDLAB_PAD_NOTES to a comma-separated list.
import os as _os
_pad_override = _os.getenv("CHORDLAB_PAD_NOTES")
if _pad_override:
    try:
        _PAD_NOTES = {int(x.strip()) for x in _pad_override.split(',') if x.strip()}
    except Exception:
        _PAD_NOTES = {36, 37, 38, 39, 40, 41, 42, 43}
else:
    _PAD_NOTES = {36, 37, 38, 39, 40, 41, 42, 43}


def iter_names(candidates: Iterable[str]) -> list[str]:
    return list(candidates)


def list_ports() -> None:
    ins = iter_names(mido.get_input_names())
    outs = iter_names(mido.get_output_names())
    print("Available MIDI inputs:")
    for name in ins:
        print(f"  - {name}")
    print("\nAvailable MIDI outputs:")
    for name in outs:
        print(f"  - {name}")


def auto_pick_ports() -> tuple[Optional[str], Optional[str], Optional[str]]:
    ins = iter_names(mido.get_input_names())
    outs = iter_names(mido.get_output_names())

    in_name = next((n for n in ins if "minilab" in n.lower() or "arturia" in n.lower()), ins[0] if ins else None)
    fb_name = next((n for n in outs if "minilab" in n.lower() or "arturia" in n.lower()), None)
    out_name = (
        next((n for n in outs if any(tag in n.lower() for tag in ("iac", "chordout", "loopmidi", "loopbe", "bus"))), None)
        or next((n for n in outs if "daw" in n.lower()), None)
        or (outs[0] if outs else None)
    )
    return in_name, out_name, fb_name


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the MiniLab 3 chord engine")
    parser.add_argument("--in", dest="in_port", help="MIDI input port name (MiniLab 3 input)")
    parser.add_argument("--out", dest="out_port", help="Chord output port name (e.g., IAC Driver)")
    parser.add_argument("--fb", dest="fb_port", help="Feedback output for pad/OLED (MiniLab 3 output)")
    parser.add_argument("--list", action="store_true", help="List available ports and exit")
    parser.add_argument("--auto", action="store_true", help="Auto-pick ports based on common names")
    parser.add_argument("--velocity", type=int, default=96, help="Note-on velocity for generated chords")
    parser.add_argument("--channel", type=int, default=0, help="MIDI channel for generated chords (0-15)")
    parser.add_argument("--latch", action="store_true", help="Latch generated chords until key up is ignored")
    parser.add_argument("--dry-run", action="store_true", help="Use stub ports (no physical MIDI required)")
    args = parser.parse_args(argv)

    if args.list:
        list_ports()
        return 0

    in_name = args.in_port
    out_name = args.out_port
    fb_name = args.fb_port

    if args.auto and (in_name is None or out_name is None or fb_name is None):
        ai, ao, af = auto_pick_ports()
        in_name = in_name or ai
        out_name = out_name or ao
        fb_name = fb_name or af

    if args.dry_run:
        # Use stub ports regardless of backend availability
        from mido_stub import open_input, open_output  # type: ignore

        with open_input(in_name or "MiniLab-Stub") as in_port, open_output(out_name or "ChordOut-Stub") as out_port, open_output(
            fb_name or "MiniLab-Stub-Out"
        ) as fb_port:
            engine = MiniLabChordEngine(out_port, EngineConfig(velocity=args.velocity, channel=args.channel, latch=args.latch), feedback_port=fb_port)
            print("Running in dry-run mode. Waiting for messages on stub input… (Ctrl+C to exit)")
            try:
                for message in in_port:
                    engine.process_message(message)
            except KeyboardInterrupt:
                return 0
            return 0

    missing_required = [label for name, label in ((in_name, "--in"), (out_name, "--out")) if name is None]
    if missing_required:
        list_ports()
        print("", file=sys.stderr)
        print(
            "Missing ports: " + ", ".join(missing_required) + ". Provide flags or use --auto to guess.",
            file=sys.stderr,
        )
        return 2

    if fb_name is None:
        print("[warn] No MiniLab output found for LED/OLED feedback. Running without hardware feedback.")

    try:
        with mido.open_input(in_name) as in_port, mido.open_output(out_name) as out_port:
            fb_port = None
            if fb_name is not None:
                try:
                    fb_port = mido.open_output(fb_name)
                except IOError as exc:
                    print(f"[warn] Failed to open feedback port {fb_name!r}: {exc}. Continuing without feedback.")
                    fb_port = None
            cfg = EngineConfig(velocity=args.velocity, channel=args.channel, latch=args.latch)
            engine = MiniLabChordEngine(out_port, cfg, feedback_port=fb_port)
            fb_label = fb_name if fb_port is not None else "[none]"
            print(f"Listening on {in_name} → chords to {out_name} • feedback to {fb_label}. Ctrl+C to stop.")
            try:
                for message in in_port:
                    try:
                        if getattr(message, 'type', '') in {'note_on', 'note_off'} and getattr(message, 'note', None) in _PAD_NOTES:
                            # Coerce pad notes to the expected pad channel (index 8 → MIDI ch 9)
                            ch = getattr(message, 'channel', 0)
                            if ch != 8:
                                message = message.copy(channel=8)
                        engine.process_message(message)
                    except Exception as exc:  # keep runner alive on unexpected messages
                        print(f"Skipped malformed message: {exc}")
            except KeyboardInterrupt:
                return 0
            finally:
                if fb_port is not None:
                    fb_port.close()
    except IOError as exc:  # port open errors
        print(f"Failed to open MIDI ports: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
