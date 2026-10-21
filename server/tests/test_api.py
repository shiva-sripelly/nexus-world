"""End-to-end tests through the real HTTP and WebSocket endpoints."""

import uuid

import pytest
from fastapi.testclient import TestClient

from nexus.app import create_app


def uname(prefix="P") -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def receive_until(ws, t: str, limit: int = 2000) -> dict:
    for _ in range(limit):
        msg = ws.receive_json()
        if msg["t"] == t:
            return msg
    raise AssertionError(f"never received {t!r}")


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def hello(ws, name, token=None, **look):
    ws.send_json({"t": "hello", "name": name, "token": token, **look})
    return ws.receive_json()


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["database"] is True


def test_rejects_bad_names(client):
    with client.websocket_connect("/ws") as ws:
        msg = hello(ws, "x!")
        assert msg["t"] == "error" and msg["code"] == "bad_name"


def test_name_is_claimed_and_protected_by_token(client):
    name = uname()
    with client.websocket_connect("/ws") as ws:
        welcome = hello(ws, name, color="#22d3ee", accessory="halo")
        assert welcome["t"] == "welcome" and welcome["rating"] == 1000
        token = welcome["token"]
        assert token
    with client.websocket_connect("/ws") as ws:
        msg = hello(ws, name)
        assert msg["code"] == "name_taken"
    with client.websocket_connect("/ws") as ws:
        msg = hello(ws, name, token=token)
        assert msg["t"] == "welcome" and msg["token"] is None


def test_ranked_match_end_to_end(client):
    name = uname("R")
    with client.websocket_connect("/ws") as ws:
        me = hello(ws, name)
        ws.send_json({"t": "queue"})
        start = receive_until(ws, "match_start")
        assert start["mode"] == "ranked" and start["you"] == me["id"]
        assert len(start["roster"]) == 4 and sum(r["is_bot"] for r in start["roster"]) == 3

        ws.send_json({"t": "input", "seq": 1, "mx": 1, "mz": 0, "aim": 0.5, "fire": True})
        snap = receive_until(ws, "snap")
        assert {p["id"] for p in snap["players"]} == {r["id"] for r in start["roster"]}

        end = receive_until(ws, "match_end")
        assert [r["place"] for r in end["results"]] == [1, 2, 3, 4]
        mine = next(r for r in end["results"] if r["id"] == me["id"])
        assert mine["ratingAfter"] == mine["ratingBefore"] + mine["delta"]

    board = client.get("/api/leaderboard").json()
    assert any(row["name"] == name for row in board)
    profile = client.get(f"/api/players/{name}").json()
    assert profile["matches"] == 1 and profile["rating"] == mine["ratingAfter"]

    matches = client.get("/api/matches").json()
    assert matches[0]["id"] == end["matchId"]

    replay = client.get(f"/api/replays/{end['replayId']}")
    assert replay.status_code == 200
    data = replay.json()  # stored gzip-compressed, decoded by the HTTP client
    assert data["header"]["matchId"] == end["matchId"]
    assert len(data["frames"]) > 10
    assert data["frames"][-1]["phase"] == "ended"


def test_lobby_flow_with_bot_and_second_player(client):
    host_name, guest_name = uname("H"), uname("G")
    with client.websocket_connect("/ws") as host, client.websocket_connect("/ws") as guest:
        hello(host, host_name)
        hello(guest, guest_name)

        host.send_json({"t": "create_lobby"})
        lobby = receive_until(host, "lobby")
        guest.send_json({"t": "join_lobby", "id": lobby["id"].lower()})
        assert len(receive_until(guest, "lobby")["members"]) == 2

        guest.send_json({"t": "add_bot"})
        assert receive_until(guest, "error")["code"] == "not_host"

        host.send_json({"t": "add_bot"})
        assert len(receive_until(host, "lobby")["members"]) >= 2

        host.send_json({"t": "start_match"})
        err = receive_until(host, "error")
        assert err["code"] == "not_ready"

        guest.send_json({"t": "toggle_ready"})
        receive_until(host, "lobby")
        host.send_json({"t": "start_match"})
        start = receive_until(host, "match_start")
        assert start["mode"] == "casual" and len(start["roster"]) == 3
        assert receive_until(guest, "match_start")["matchId"] == start["matchId"]

        end = receive_until(host, "match_end")
        assert all(r["delta"] == 0 for r in end["results"])  # casual: no rating change
        back = receive_until(host, "lobby")
        assert back["state"] == "waiting"

    # Casual matches are stored, but only ranked play puts you on the leaderboard.
    names = {row["name"] for row in client.get("/api/leaderboard").json()}
    assert host_name not in names and guest_name not in names
    assert client.get(f"/api/players/{host_name}").json()["matches"] == 1


def test_unknown_lobby_and_unknown_message(client):
    with client.websocket_connect("/ws") as ws:
        hello(ws, uname())
        ws.send_json({"t": "join_lobby", "id": "NOPE00"})
        assert ws.receive_json()["code"] == "not_found"
        ws.send_json({"t": "self_destruct"})
        assert ws.receive_json()["code"] == "unknown"


def test_missing_resources_return_404(client):
    assert client.get("/api/players/nobody_here").status_code == 404
    assert client.get("/api/replays/does-not-exist").status_code == 404
