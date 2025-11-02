"""Helpers for generating Arturia MiniLab 3 SysEx packets.

The MiniLab 3 uses SysEx messages for both the OLED text and pad LED colours.
This module wraps the raw byte juggling in small, easy-to-test helpers.  It is
used by :mod:`chord_builder` but can also be consumed by standalone scripts
(such as a future WebSocket bridge).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

import mido

MANUFACTURER_ID = [0x00, 0x20, 0x6B]
UNIVERSAL_DEVICE_ID = [0x7F, 0x42, 0x04]

OLED_HEADER = MANUFACTURER_ID + UNIVERSAL_DEVICE_ID + [0x02, 0x60, 0x01]
PAD_HEADER = MANUFACTURER_ID + UNIVERSAL_DEVICE_ID + [0x02, 0x02, 0x16]


@dataclass(frozen=True)
class RGB:
    r: int
    g: int
    b: int

    def __post_init__(self) -> None:
        for value in (self.r, self.g, self.b):
            if not 0 <= value <= 127:
                raise ValueError("RGB values must be between 0 and 127 for MiniLab 3")


class MiniLab3Display:
    """High level interface for OLED and pad LED updates."""

    def __init__(self, port: mido.ports.BaseOutput) -> None:
        self.port = port

    def set_oled_lines(self, line1: str, line2: str) -> None:
        payload = self._encode_oled(line1, line2)
        message = mido.Message("sysex", data=payload)
        self.port.send(message)

    def set_pad_color(self, pad: int, color: RGB) -> None:
        payload = self._encode_pad_color(pad, color)
        message = mido.Message("sysex", data=payload)
        self.port.send(message)

    # -- Encoding helpers ------------------------------------------------------

    @staticmethod
    def _encode_oled(line1: str, line2: str) -> List[int]:
        def encode_line(text: str) -> List[int]:
            text = text[:16]
            ascii_codes = [ord(char) & 0x7F for char in text]
            padded = ascii_codes + [0x20] * (16 - len(ascii_codes))
            return padded

        return [0xF0, *OLED_HEADER, *encode_line(line1), *encode_line(line2), 0xF7]

    @staticmethod
    def _encode_pad_color(pad: int, color: RGB) -> List[int]:
        if not 0 <= pad <= 127:
            raise ValueError("Pad ID must be between 0 and 127")
        return [0xF0, *PAD_HEADER, pad, color.r, color.g, color.b, 0xF7]


def batch_pad_colors(mapping: Iterable[tuple[int, RGB]]) -> List[mido.Message]:
    """Generate a list of SysEx messages for multiple pad colour updates."""

    return [
        mido.Message("sysex", data=MiniLab3Display._encode_pad_color(pad, color))
        for pad, color in mapping
    ]
