"""Replay recording: every broadcast snapshot is stored, gzip-compressed."""

from __future__ import annotations

import gzip
import json
from typing import Any

REPLAY_VERSION = 1


class ReplayRecorder:
    def __init__(self, header: dict[str, Any]):
        self.header = {"version": REPLAY_VERSION, **header}
        self.frames: list[dict[str, Any]] = []

    def add(self, snapshot: dict[str, Any]) -> None:
        frame = {k: v for k, v in snapshot.items() if k != "t"}
        # Per-player input sequence numbers only matter live, not in a replay.
        frame["players"] = [{k: v for k, v in p.items() if k != "q"} for p in snapshot["players"]]
        self.frames.append(frame)

    def encode(self) -> bytes:
        payload = {"header": self.header, "frames": self.frames}
        return gzip.compress(json.dumps(payload, separators=(",", ":")).encode())


def decode(data: bytes) -> dict[str, Any]:
    return json.loads(gzip.decompress(data))
