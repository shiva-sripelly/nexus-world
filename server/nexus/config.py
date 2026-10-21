"""Game constants (shared with the client) and server settings."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

_SHARED = Path(__file__).resolve().parent.parent.parent / "shared" / "constants.json"
_PACKAGED = Path(__file__).resolve().parent / "constants.json"
CONSTANTS_PATH = Path(os.environ.get("NEXUS_CONSTANTS", _SHARED if _SHARED.exists() else _PACKAGED))

C: dict = json.loads(CONSTANTS_PATH.read_text())

TICK_RATE: int = C["tickRate"]
TICK_DT: float = 1.0 / TICK_RATE
SNAPSHOT_EVERY: int = C["snapshotEvery"]


@dataclass
class Settings:
    database_url: str = "sqlite+aiosqlite:///./nexus.db"
    redis_url: str | None = None
    match_seconds: float = 150.0
    queue_fill_after: float = 8.0
    matchmaking_interval: float = 0.5
    static_dir: str | None = None
    cors_origins: list[str] = field(default_factory=lambda: ["*"])

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            database_url=os.environ.get("DATABASE_URL", cls.database_url),
            redis_url=os.environ.get("REDIS_URL") or None,
            match_seconds=float(os.environ.get("NEXUS_MATCH_SECONDS", cls.match_seconds)),
            queue_fill_after=float(os.environ.get("NEXUS_QUEUE_FILL_AFTER", cls.queue_fill_after)),
            static_dir=os.environ.get("NEXUS_STATIC_DIR") or None,
        )
