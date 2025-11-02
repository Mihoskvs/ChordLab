"""Utilities for generating MiniLab 3 SysEx messages for LEDs and OLED text."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Tuple

SYSEX_HEADER_PAD = [0xF0, 0x00, 0x20, 0x6B, 0x7F, 0x42, 0x02, 0x02, 0x16]
SYSEX_HEADER_OLED = [0xF0, 0x00, 0x20, 0x6B, 0x7F, 0x42, 0x04, 0x02, 0x60, 0x01]
SYSEX_END = 0xF7

PAD_IDS = {
    "PAD_21": 0x15,
    "PAD_22": 0x16,
    "PAD_23": 0x17,
    "PAD_24": 0x18,
    "PAD_25": 0x19,
    "PAD_26": 0x1A,
    "PAD_27": 0x1B,
    "PAD_28": 0x1C,
}


@dataclass(frozen=True)
class RGB:
    r: int
    g: int
    b: int

    def clamp(self) -> "RGB":
        return RGB(*(max(0, min(127, value)) for value in (self.r, self.g, self.b)))

    def as_tuple(self) -> Tuple[int, int, int]:
        c = self.clamp()
        return c.r, c.g, c.b


def build_pad_color_sysex(pad: str, color: RGB) -> bytes:
    if pad not in PAD_IDS:
        raise KeyError(f"Unknown pad identifier: {pad}")
    r, g, b = color.as_tuple()
    payload = SYSEX_HEADER_PAD + [PAD_IDS[pad], r, g, b, SYSEX_END]
    return bytes(payload)


def build_batch_pad_sysex(updates: Iterable[Tuple[str, RGB]]) -> bytes:
    body: list[int] = []
    for pad, color in updates:
        if pad not in PAD_IDS:
            raise KeyError(f"Unknown pad identifier: {pad}")
        r, g, b = color.as_tuple()
        body.extend([PAD_IDS[pad], r, g, b])
    return bytes(SYSEX_HEADER_PAD + body + [SYSEX_END])


def build_oled_sysex(line1: str, line2: str) -> bytes:
    def _encode_line(text: str) -> list[int]:
        text = text[:16]
        data = [ord(c) & 0x7F for c in text]
        data.extend([0x00] * (16 - len(data)))
        return data

    payload = SYSEX_HEADER_OLED + _encode_line(line1) + _encode_line(line2) + [SYSEX_END]
    return bytes(payload)


__all__ = ["RGB", "build_pad_color_sysex", "build_batch_pad_sysex", "build_oled_sysex"]

