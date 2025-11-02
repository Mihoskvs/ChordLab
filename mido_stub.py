"""Fallback implementation of the tiny subset of ``mido`` used in tests."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Iterator, List


@dataclass
class Message:
    """Simplified MIDI message container used in tests."""

    type: str

    def __init__(self, type: str, **kwargs: Any) -> None:
        object.__setattr__(self, "type", type)
        for key, value in kwargs.items():
            object.__setattr__(self, key, value)

    def copy(self, **overrides: Any) -> "Message":
        values = self.__dict__ | overrides
        return Message(self.type, **{k: v for k, v in values.items() if k != "type"})

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        attrs = ", ".join(f"{k}={v!r}" for k, v in self.__dict__.items() if k != "type")
        return f"Message(type={self.type!r}, {attrs})"


class DummyPort:
    def __init__(self, name: str):
        self.name = name
        self.sent_messages: List[Message] = []
        self._iter_messages: Iterator[Message] | None = None

    def __enter__(self) -> "DummyPort":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False

    def send(self, message: Message) -> None:
        self.sent_messages.append(message)

    def attach_iter(self, messages: Iterable[Message]) -> None:
        self._iter_messages = iter(messages)

    def __iter__(self) -> Iterator[Message]:
        if self._iter_messages is None:
            raise RuntimeError("DummyPort has no attached iterator")
        return self._iter_messages


def open_input(name: str, virtual: bool = False, callback=None):  # noqa: ANN001 - signature compatibility
    return DummyPort(name)


def open_output(name: str, virtual: bool = False):  # noqa: ANN001 - signature compatibility
    return DummyPort(name)


def get_input_names() -> list[str]:
    return []


def get_output_names() -> list[str]:
    return []


__all__ = ["Message", "open_input", "open_output", "get_input_names", "get_output_names", "DummyPort"]
