"""Leaderboard cache: a Redis sorted set, or an in-memory fallback for dev and tests."""

from __future__ import annotations

from typing import Protocol

KEY = "nexus:leaderboard"
NAMES = "nexus:names"


class Leaderboard(Protocol):
    async def set(self, player_id: str, name: str, rating: int) -> None: ...
    async def top(self, limit: int) -> list[dict]: ...
    async def rank(self, player_id: str) -> int | None: ...
    async def ping(self) -> bool: ...
    async def close(self) -> None: ...


class MemoryLeaderboard:
    def __init__(self) -> None:
        self._ratings: dict[str, int] = {}
        self._names: dict[str, str] = {}

    async def set(self, player_id: str, name: str, rating: int) -> None:
        self._ratings[player_id] = rating
        self._names[player_id] = name

    def _ordered(self) -> list[tuple[str, int]]:
        return sorted(self._ratings.items(), key=lambda kv: (-kv[1], self._names[kv[0]]))

    async def top(self, limit: int) -> list[dict]:
        return [
            {"rank": i + 1, "id": pid, "name": self._names[pid], "rating": r}
            for i, (pid, r) in enumerate(self._ordered()[:limit])
        ]

    async def rank(self, player_id: str) -> int | None:
        for i, (pid, _) in enumerate(self._ordered()):
            if pid == player_id:
                return i + 1
        return None

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        pass


class RedisLeaderboard:
    def __init__(self, url: str):
        import redis.asyncio as redis

        self.r = redis.from_url(url, decode_responses=True)

    async def set(self, player_id: str, name: str, rating: int) -> None:
        async with self.r.pipeline(transaction=True) as pipe:
            pipe.zadd(KEY, {player_id: rating})
            pipe.hset(NAMES, player_id, name)
            await pipe.execute()

    async def top(self, limit: int) -> list[dict]:
        rows = await self.r.zrevrange(KEY, 0, limit - 1, withscores=True)
        if not rows:
            return []
        names = await self.r.hmget(NAMES, [pid for pid, _ in rows])
        return [
            {"rank": i + 1, "id": pid, "name": name or "?", "rating": int(score)}
            for i, ((pid, score), name) in enumerate(zip(rows, names, strict=True))
        ]

    async def rank(self, player_id: str) -> int | None:
        r = await self.r.zrevrank(KEY, player_id)
        return None if r is None else r + 1

    async def ping(self) -> bool:
        try:
            return bool(await self.r.ping())
        except Exception:
            return False

    async def close(self) -> None:
        await self.r.aclose()


def create_leaderboard(redis_url: str | None) -> Leaderboard:
    return RedisLeaderboard(redis_url) if redis_url else MemoryLeaderboard()
