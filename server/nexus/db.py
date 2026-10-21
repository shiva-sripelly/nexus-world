"""PostgreSQL persistence (SQLite works too, for local dev and tests)."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    func,
    select,
)
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .elo import BOT_RATING

START_RATING = 1000


def _now() -> datetime:
    return datetime.now(UTC)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Base(DeclarativeBase):
    pass


class PlayerRow(Base):
    __tablename__ = "players"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    token_hash: Mapped[str] = mapped_column(String(64))
    rating: Mapped[int] = mapped_column(Integer, default=START_RATING, index=True)
    matches: Mapped[int] = mapped_column(Integer, default=0)
    ranked_matches: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    kills: Mapped[int] = mapped_column(Integer, default=0)
    deaths: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MatchRow(Base):
    __tablename__ = "matches"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mode: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    duration: Mapped[float] = mapped_column()
    participants: Mapped[list[MatchPlayerRow]] = relationship(
        back_populates="match", cascade="all, delete-orphan", lazy="selectin"
    )


class MatchPlayerRow(Base):
    __tablename__ = "match_players"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), index=True)
    player_id: Mapped[str | None] = mapped_column(ForeignKey("players.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(20))
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False)
    place: Mapped[int] = mapped_column(Integer)
    score: Mapped[int] = mapped_column(Integer)
    kills: Mapped[int] = mapped_column(Integer)
    deaths: Mapped[int] = mapped_column(Integer)
    rating_before: Mapped[int] = mapped_column(Integer)
    rating_after: Mapped[int] = mapped_column(Integer)
    match: Mapped[MatchRow] = relationship(back_populates="participants")


class ReplayRow(Base):
    __tablename__ = "replays"
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True)
    frame_count: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary)


class NameTaken(Exception):
    pass


class Database:
    def __init__(self, url: str):
        self.engine: AsyncEngine = create_async_engine(url, pool_pre_ping=True)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    async def create_all(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def close(self) -> None:
        await self.engine.dispose()

    async def ping(self) -> bool:
        try:
            async with self.engine.connect() as conn:
                await conn.execute(select(1))
            return True
        except Exception:
            return False

    # ---------------------------------------------------------------- players

    async def login(self, name: str, token: str | None) -> tuple[PlayerRow, str | None]:
        """Claim ``name`` or log in to it. Returns (player, new_token_if_created)."""
        async with self.sessions() as s:
            row = (await s.execute(select(PlayerRow).where(func.lower(PlayerRow.name) == name.lower()))).scalar()
            if row is not None:
                if token is None or not secrets.compare_digest(row.token_hash, hash_token(token)):
                    raise NameTaken(name)
                return row, None
            new_token = secrets.token_urlsafe(24)
            row = PlayerRow(name=name, token_hash=hash_token(new_token))
            s.add(row)
            await s.commit()
            return row, new_token

    async def get_player(self, name: str) -> PlayerRow | None:
        async with self.sessions() as s:
            stmt = select(PlayerRow).where(func.lower(PlayerRow.name) == name.lower())
            return (await s.execute(stmt)).scalar()

    async def top_players(self, limit: int) -> list[PlayerRow]:
        async with self.sessions() as s:
            stmt = select(PlayerRow).where(PlayerRow.ranked_matches > 0).order_by(PlayerRow.rating.desc()).limit(limit)
            return list((await s.execute(stmt)).scalars())

    # ---------------------------------------------------------------- matches

    async def record_match(
        self,
        match_id: str,
        mode: str,
        started_at: datetime,
        duration: float,
        standings: list[dict[str, Any]],
        ratings: dict[str, int],
        deltas: dict[str, int],
        replay: bytes,
        frame_count: int,
    ) -> dict[str, PlayerRow]:
        """Store the match, its replay and each human's updated stats in one transaction."""
        updated: dict[str, PlayerRow] = {}
        human_ids = [st["id"] for st in standings if not st["is_bot"]]
        async with self.sessions() as s, s.begin():
            # Load every human up front, in one query, before anything is added to the
            # session: a lookup mid-loop would autoflush and trigger lazy loads.
            players = {row.id: row for row in (await s.execute(select(PlayerRow).where(PlayerRow.id.in_(human_ids)))).scalars()}
            participants = []
            for st in standings:
                before = ratings.get(st["id"], BOT_RATING)
                after = before + deltas.get(st["id"], 0)
                row = players.get(st["id"])
                if row is not None:
                    row.matches += 1
                    row.ranked_matches += 1 if mode == "ranked" else 0
                    row.wins += 1 if st["place"] == 1 else 0
                    row.kills += st["kills"]
                    row.deaths += st["deaths"]
                    row.rating = after
                    updated[row.id] = row
                participants.append(
                    MatchPlayerRow(
                        player_id=row.id if row is not None else None,
                        name=st["name"],
                        is_bot=st["is_bot"],
                        place=st["place"],
                        score=st["score"],
                        kills=st["kills"],
                        deaths=st["deaths"],
                        rating_before=before,
                        rating_after=after,
                    )
                )
            s.add(MatchRow(id=match_id, mode=mode, started_at=started_at, duration=duration, participants=participants))
            s.add(ReplayRow(match_id=match_id, frame_count=frame_count, data=replay))
        return updated

    async def recent_matches(self, limit: int) -> list[MatchRow]:
        async with self.sessions() as s:
            stmt = select(MatchRow).order_by(MatchRow.ended_at.desc()).limit(limit)
            return list((await s.execute(stmt)).scalars())

    async def get_replay(self, match_id: str) -> bytes | None:
        async with self.sessions() as s:
            row = await s.get(ReplayRow, match_id)
            return row.data if row else None
