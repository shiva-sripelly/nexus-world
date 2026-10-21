from nexus.config import Settings
from nexus.hub import MAX_PLAYERS, Hub
from nexus.leaderboard import MemoryLeaderboard


class FakeClient:
    def __init__(self, name: str, rating: int, queued_at: float):
        self.id = name
        self.name = name
        self.rating = rating
        self.queued_at = queued_at


def make_hub(fill_after=8.0) -> Hub:
    return Hub(db=None, leaderboard=MemoryLeaderboard(), settings=Settings(queue_fill_after=fill_after))  # type: ignore[arg-type]


def test_waits_for_more_players_before_fill_time():
    hub = make_hub()
    hub.queue = [FakeClient("a", 1000, queued_at=100.0)]
    assert hub.form_matches(now=103.0) == []
    assert len(hub.queue) == 1


def test_fills_with_bots_after_waiting():
    hub = make_hub()
    hub.queue = [FakeClient("a", 1000, 100.0), FakeClient("b", 1100, 101.0)]
    groups = hub.form_matches(now=109.0)
    assert [[c.name for c in g] for g in groups] == [["a", "b"]]
    assert hub.queue == []
    assert all(c.queued_at is None for c in groups[0])


def test_full_match_pairs_oldest_with_closest_ratings():
    hub = make_hub()
    ratings = {"old": 1500, "far": 900, "near1": 1480, "near2": 1530, "near3": 1460, "mid": 1200}
    hub.queue = [FakeClient(n, r, 100.0 + i) for i, (n, r) in enumerate(ratings.items())]
    groups = hub.form_matches(now=101.0)
    first = {c.name for c in groups[0]}
    assert len(groups[0]) == MAX_PLAYERS
    assert first == {"old", "near1", "near2", "near3"}
    assert {c.name for c in hub.queue} == {"far", "mid"}
