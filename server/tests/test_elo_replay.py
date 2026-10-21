import pytest

from nexus.elo import BOT_RATING, K_FACTOR, expected, rating_changes
from nexus.replay import ReplayRecorder, decode


def test_expected_score_is_symmetric():
    assert expected(1200, 1000) + expected(1000, 1200) == pytest.approx(1.0)
    assert expected(1000, 1000) == pytest.approx(0.5)


def test_winner_gains_and_loser_loses_between_equals():
    d = rating_changes([{"id": "a", "rating": 1000, "place": 1}, {"id": "b", "rating": 1000, "place": 2}])
    assert d == {"a": K_FACTOR // 2, "b": -K_FACTOR // 2}


def test_upset_win_is_worth_more():
    favourite_wins = rating_changes([{"id": "a", "rating": 1400, "place": 1}, {"id": "b", "rating": 1000, "place": 2}])
    underdog_wins = rating_changes([{"id": "a", "rating": 1400, "place": 2}, {"id": "b", "rating": 1000, "place": 1}])
    assert underdog_wins["b"] > favourite_wins["a"]


def test_bots_are_never_rated():
    d = rating_changes(
        [
            {"id": "h", "rating": 1000, "place": 1},
            {"id": "bot", "rating": BOT_RATING, "place": 2, "is_bot": True},
        ]
    )
    assert "bot" not in d and d["h"] > 0


def test_four_player_changes_sum_to_zero_for_equal_ratings():
    d = rating_changes([{"id": str(i), "rating": 1000, "place": i + 1} for i in range(4)])
    assert sum(d.values()) == 0
    assert d["0"] > d["1"] > d["2"] > d["3"]


def test_replay_round_trip_strips_live_only_fields():
    rec = ReplayRecorder({"matchId": "m1", "roster": []})
    rec.add({"t": "snap", "tick": 2, "players": [{"id": "p", "x": 1, "q": 7}], "enemies": [], "bolts": [], "events": []})
    data = decode(rec.encode())
    assert data["header"]["matchId"] == "m1" and data["header"]["version"] == 1
    assert data["frames"][0]["players"][0] == {"id": "p", "x": 1}
    assert "t" not in data["frames"][0]
