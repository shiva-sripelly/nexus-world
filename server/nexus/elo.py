"""Multiplayer Elo for free-for-all matches.

Every pair of players is treated as a head-to-head game: the higher finisher
"wins" the pair. Each player's change is the average of their pairwise
results, scaled by K. Bots play at a fixed rating and are never updated.
"""

from __future__ import annotations

K_FACTOR = 32
BOT_RATING = 1000


def expected(rating: float, opponent: float) -> float:
    return 1.0 / (1.0 + 10 ** ((opponent - rating) / 400.0))


def rating_changes(entries: list[dict]) -> dict[str, int]:
    """entries: [{"id", "rating", "place", "is_bot"}] → {id: delta} for humans."""
    n = len(entries)
    if n < 2:
        return {e["id"]: 0 for e in entries if not e.get("is_bot")}
    deltas: dict[str, int] = {}
    for a in entries:
        if a.get("is_bot"):
            continue
        total = 0.0
        for b in entries:
            if a is b:
                continue
            if a["place"] < b["place"]:
                actual = 1.0
            elif a["place"] == b["place"]:
                actual = 0.5
            else:
                actual = 0.0
            total += actual - expected(a["rating"], b["rating"])
        deltas[a["id"]] = round(K_FACTOR * total / (n - 1))
    return deltas
