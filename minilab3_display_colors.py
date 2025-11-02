"""Utilities for generating Arturia MiniLab 3 SysEx messages.

The MiniLab 3 exposes two key custom SysEx endpoints:

* OLED display (two 16-character lines)
* RGB pad LEDs (0-127 brightness per color)

This helper keeps the byte packing logic in a single place so the rest of
the application can simply pass human-friendly values.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

SYSEX_HEADER_DISPLAY = [0xF0, 0x00, 0x20, 0x6B, 0x7F, 0x42, 0x04, 0x02, 0x60, 0x01]
SYSEX_HEADER_PADS = [0xF0, 0x00, 0x20, 0x6B, 0x7F, 0x42, 0x02, 0x02, 0x16]
SYSEX_END = 0xF7

DISPLAY_CHAR_LIMIT = 16
PAD_RANGE = range(36, 44)


def _sanitize_text(text: str) -> str:
    ascii_only = text.encode("ascii", errors="ignore").decode("ascii")
    return ascii_only.ljust(DISPLAY_CHAR_LIMIT)[:DISPLAY_CHAR_LIMIT]


@dataclass(frozen=True)
class PadColor:
    red: int
    green: int
    blue: int

    def as_bytes(self) -> Sequence[int]:
        return [max(0, min(127, self.red)), max(0, min(127, self.green)), max(0, min(127, self.blue))]


def build_display_sysex(line1: str, line2: str) -> bytes:
    """Construct a SysEx packet for the MiniLab 3 OLED display."""

    payload = list(SYSEX_HEADER_DISPLAY)
    payload.extend(ord(c) for c in _sanitize_text(line1))
    payload.extend(ord(c) for c in _sanitize_text(line2))
    payload.append(SYSEX_END)
    return bytes(payload)


def build_pad_sysex(pad_id: int, color: PadColor) -> bytes:
    if pad_id not in PAD_RANGE:
        raise ValueError(f"Pad id must be between {PAD_RANGE.start} and {PAD_RANGE.stop - 1}")
    payload = list(SYSEX_HEADER_PADS)
    payload.append(pad_id)
    payload.extend(color.as_bytes())
    payload.append(SYSEX_END)
    return bytes(payload)


def batch_pad_sysex(pairs: Iterable[tuple[int, PadColor]]) -> Sequence[bytes]:
    return [build_pad_sysex(pad, color) for pad, color in pairs]


__all__ = ["PadColor", "build_display_sysex", "build_pad_sysex", "batch_pad_sysex"]
