"""Connections, lobbies, matchmaking and running matches."""

from __future__ import annotations

import asyncio
import logging
import random
import secrets
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket

from .config import SNAPSHOT_EVERY, TICK_DT, C, Settings
from .db import Database
from .elo import BOT_RATING, rating_changes
from .leaderboard import Leaderboard
from .replay import ReplayRecorder
from .sim import GameSim

log = logging.getLogger("nexus")

MAX_PLAYERS = C["maxPlayersPerMatch"]
BOT_NAMES = ["Vex", "Nyx", "Kira", "Juno", "Rook", "Zed", "Echo", "Onyx", "Pike", "Sol"]
MESSAGES_PER_SECOND = 120


class Client:
    """One connected player. Outgoing messages go through a bounded queue so a
    slow connection can never stall the game loop."""

    def __init__(self, ws: WebSocket, player_id: str, name: str, rating: int, color: str, accessory: str):
        self.ws = ws
        self.id = player_id
        self.name = name
        self.rating = rating
        self.color = color
        self.accessory = accessory
        self.lobby: Lobby | None = None
        self.match: MatchRunner | None = None
        self.queued_at: float | None = None
        self.outbox: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        self._window_start = time.monotonic()
        self._window_count = 0
        self.writer = asyncio.create_task(self._write_loop())

    def send(self, msg: dict[str, Any]) -> None:
        try:
            self.outbox.put_nowait(msg)
        except asyncio.QueueFull:
            if msg.get("t") == "snap":
                return  # a newer snapshot will follow; drop this one
            while not self.outbox.empty():
                self.outbox.get_nowait()
            self.outbox.put_nowait(msg)

    def allow_message(self) -> bool:
        now = time.monotonic()
        if now - self._window_start >= 1.0:
            self._window_start, self._window_count = now, 0
        self._window_count += 1
        return self._window_count <= MESSAGES_PER_SECOND

    async def _write_loop(self) -> None:
        try:
            while True:
                await self.ws.send_json(await self.outbox.get())
        except Exception:
            pass

    def roster_entry(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "color": self.color, "accessory": self.accessory, "is_bot": False}


def make_bot(taken: set[str], rng: random.Random) -> dict[str, Any]:
    names = [n for n in BOT_NAMES if f"{n} (bot)" not in taken] or BOT_NAMES
    return {
        "id": f"bot-{uuid.uuid4().hex[:8]}",
        "name": f"{rng.choice(names)} (bot)",
        "color": rng.choice(C["colors"]),
        "accessory": rng.choice(C["accessories"]),
        "is_bot": True,
    }


class Lobby:
    def __init__(self, name: str, host: Client):
        self.id = secrets.token_hex(3).upper()
        self.name = name
        self.host_id = host.id
        self.members: list[Client] = [host]
        self.ready: set[str] = set()
        self.bots: list[dict[str, Any]] = []
        self.state = "waiting"

    @property
    def size(self) -> int:
        return len(self.members) + len(self.bots)

    def summary(self) -> dict[str, Any]:
        host = next((m.name for m in self.members if m.id == self.host_id), "?")
        return {"id": self.id, "name": self.name, "host": host, "players": self.size, "max": MAX_PLAYERS, "state": self.state}

    def state_msg(self) -> dict[str, Any]:
        members = [
            {
                "id": m.id,
                "name": m.name,
                "color": m.color,
                "accessory": m.accessory,
                "rating": m.rating,
                "ready": m.id in self.ready or m.id == self.host_id,
                "is_bot": False,
            }
            for m in self.members
        ]
        members += [{**b, "rating": BOT_RATING, "ready": True} for b in self.bots]
        return {"t": "lobby", **self.summary(), "hostId": self.host_id, "members": members}

    def broadcast(self) -> None:
        msg = self.state_msg()
        for m in self.members:
            m.send(msg)


class MatchRunner:
    def __init__(self, hub: Hub, mode: str, humans: list[Client], bots: list[dict[str, Any]], lobby: Lobby | None = None):
        self.hub = hub
        self.id = str(uuid.uuid4())
        self.mode = mode
        self.lobby = lobby
        self.humans = {c.id: c for c in humans}
        self.ratings = {c.id: c.rating for c in humans} | {b["id"]: BOT_RATING for b in bots}
        roster = [c.roster_entry() for c in humans] + bots
        self.sim = GameSim(roster, match_seconds=hub.settings.match_seconds)
        self.started_at = datetime.now(UTC)
        self.recorder = ReplayRecorder({"matchId": self.id, "mode": mode, "roster": self.sim.roster(), "tickRate": 1 / TICK_DT})
        for c in humans:
            c.match = self
            c.send({"t": "match_start", "matchId": self.id, "mode": mode, "you": c.id, "roster": self.sim.roster()})
        self.task = asyncio.create_task(self.run())

    def broadcast(self, msg: dict[str, Any]) -> None:
        for c in self.humans.values():
            if c.match is self:
                c.send(msg)

    async def run(self) -> None:
        loop = asyncio.get_running_loop()
        next_tick = loop.time()
        try:
            while self.sim.phase != "ended":
                self.sim.step()
                if self.sim.tick % SNAPSHOT_EVERY == 0 or self.sim.phase == "ended":
                    snap = self.sim.snapshot()
                    self.recorder.add(snap)
                    self.broadcast(snap)
                if not any(c.match is self for c in self.humans.values()):
                    break  # every human left
                next_tick += TICK_DT
                delay = next_tick - loop.time()
                if delay < -0.25:  # we fell far behind (e.g. a GC pause): don't spiral
                    next_tick = loop.time()
                await asyncio.sleep(max(0.0, delay))
            await self.finish()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("match %s crashed", self.id)
        finally:
            self.hub.matches.pop(self.id, None)

    async def finish(self) -> None:
        standings = self.sim.standings()
        deltas: dict[str, int] = {}
        if self.mode == "ranked":
            deltas = rating_changes(
                [{"id": s["id"], "rating": self.ratings[s["id"]], "place": s["place"], "is_bot": s["is_bot"]} for s in standings]
            )
        try:
            updated = await self.hub.db.record_match(
                self.id,
                self.mode,
                self.started_at,
                self.sim.time,
                standings,
                self.ratings,
                deltas,
                self.recorder.encode(),
                len(self.recorder.frames),
            )
            if self.mode == "ranked":
                for row in updated.values():
                    await self.hub.leaderboard.set(row.id, row.name, row.rating)
        except Exception:
            log.exception("failed to store match %s", self.id)

        results = []
        for s in standings:
            before = self.ratings[s["id"]]
            delta = deltas.get(s["id"], 0)
            results.append({**s, "ratingBefore": before, "ratingAfter": before + delta, "delta": delta})
        msg = {"t": "match_end", "matchId": self.id, "mode": self.mode, "results": results, "replayId": self.id}
        for c in self.humans.values():
            if c.match is self:
                c.rating += deltas.get(c.id, 0)
                c.match = None
                c.send(msg)
        if self.lobby is not None:
            self.lobby.state = "waiting"
            self.lobby.ready.clear()
            self.lobby.broadcast()

    def leave(self, client: Client) -> None:
        if client.match is self:
            client.match = None
            self.sim.disconnect(client.id)


class Hub:
    def __init__(self, db: Database, leaderboard: Leaderboard, settings: Settings):
        self.db = db
        self.leaderboard = leaderboard
        self.settings = settings
        self.clients: dict[str, Client] = {}
        self.lobbies: dict[str, Lobby] = {}
        self.queue: list[Client] = []
        self.matches: dict[str, MatchRunner] = {}
        self.rng = random.Random()
        self._mm_task: asyncio.Task | None = None

    # ------------------------------------------------------------- lifecycle

    def start(self) -> None:
        self._mm_task = asyncio.create_task(self._matchmaking_loop())

    async def stop(self) -> None:
        tasks = [m.task for m in self.matches.values()]
        if self._mm_task:
            tasks.append(self._mm_task)
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def connect(self, client: Client) -> None:
        old = self.clients.get(client.id)
        if old is not None:
            old.send({"t": "error", "code": "replaced", "message": "Signed in from another tab."})
            self.disconnect(old)
            try:
                await old.ws.close()
            except Exception:
                pass
        self.clients[client.id] = client

    def disconnect(self, client: Client) -> None:
        if self.clients.get(client.id) is client:
            del self.clients[client.id]
        self._leave_queue(client)
        self._leave_lobby(client)
        if client.match:
            client.match.leave(client)
        client.writer.cancel()

    # -------------------------------------------------------------- messages

    async def handle(self, client: Client, msg: dict[str, Any]) -> None:
        if not client.allow_message():
            return
        t = msg.get("t")
        if t == "input":
            if client.match:
                client.match.sim.push_input(client.id, msg)
            return
        if t == "ping":
            client.send({"t": "pong", "ts": msg.get("ts")})
            return
        if t == "leave_match":
            if client.match:
                client.match.leave(client)
                client.send({"t": "left_match"})
            return
        if client.match:
            return self._error(client, "in_match", "Finish or leave your match first.")

        handler = {
            "update_look": self._update_look,
            "queue": self._queue,
            "cancel_queue": self._cancel_queue,
            "list_lobbies": self._list_lobbies,
            "create_lobby": self._create_lobby,
            "join_lobby": self._join_lobby,
            "leave_lobby": self._leave_lobby_msg,
            "toggle_ready": self._toggle_ready,
            "add_bot": self._add_bot,
            "remove_bot": self._remove_bot,
            "start_match": self._start_lobby_match,
        }.get(t)
        if handler is None:
            return self._error(client, "unknown", f"Unknown message type: {t}")
        handler(client, msg)

    @staticmethod
    def _error(client: Client, code: str, message: str) -> None:
        client.send({"t": "error", "code": code, "message": message})

    def _update_look(self, client: Client, msg: dict[str, Any]) -> None:
        if msg.get("color") in C["colors"]:
            client.color = msg["color"]
        if msg.get("accessory") in C["accessories"]:
            client.accessory = msg["accessory"]
        if client.lobby:
            client.lobby.broadcast()

    # ------------------------------------------------------------ matchmaking

    def _queue(self, client: Client, _msg: dict[str, Any]) -> None:
        if client.lobby:
            return self._error(client, "in_lobby", "Leave your lobby before queueing.")
        if client.queued_at is None:
            client.queued_at = time.monotonic()
            self.queue.append(client)
        self._send_queue_status()

    def _cancel_queue(self, client: Client, _msg: dict[str, Any]) -> None:
        self._leave_queue(client)
        client.send({"t": "queue_left"})

    def _leave_queue(self, client: Client) -> None:
        if client in self.queue:
            self.queue.remove(client)
        client.queued_at = None

    def _send_queue_status(self) -> None:
        now = time.monotonic()
        for c in self.queue:
            waited = now - (c.queued_at or now)
            c.send(
                {
                    "t": "queue_status",
                    "inQueue": len(self.queue),
                    "waited": round(waited, 1),
                    "botsIn": round(max(0.0, self.settings.queue_fill_after - waited), 1),
                }
            )

    def form_matches(self, now: float | None = None) -> list[list[Client]]:
        """Group queued players into matches. Oldest player first; their
        opponents are the queued players closest to them in rating."""
        now = time.monotonic() if now is None else now
        groups: list[list[Client]] = []
        while self.queue:
            oldest = self.queue[0]
            waited = now - (oldest.queued_at or now)
            if len(self.queue) >= MAX_PLAYERS:
                others = sorted(self.queue[1:], key=lambda c: abs(c.rating - oldest.rating))[: MAX_PLAYERS - 1]
                group = [oldest, *others]
            elif waited >= self.settings.queue_fill_after:
                group = self.queue[:MAX_PLAYERS]
            else:
                break
            for c in group:
                self._leave_queue(c)
            groups.append(group)
        return groups

    async def _matchmaking_loop(self) -> None:
        while True:
            await asyncio.sleep(self.settings.matchmaking_interval)
            try:
                for group in self.form_matches():
                    taken = {c.name for c in group}
                    bots = []
                    while len(group) + len(bots) < MAX_PLAYERS:
                        bot = make_bot(taken, self.rng)
                        taken.add(bot["name"])
                        bots.append(bot)
                    runner = MatchRunner(self, "ranked", group, bots)
                    self.matches[runner.id] = runner
                self._send_queue_status()
            except Exception:
                log.exception("matchmaking loop error")

    # ---------------------------------------------------------------- lobbies

    def _list_lobbies(self, client: Client, _msg: dict[str, Any]) -> None:
        client.send({"t": "lobbies", "lobbies": [lb.summary() for lb in self.lobbies.values()]})

    def _create_lobby(self, client: Client, msg: dict[str, Any]) -> None:
        if client.lobby:
            return self._error(client, "in_lobby", "You are already in a lobby.")
        self._leave_queue(client)
        name = str(msg.get("name") or f"{client.name}'s lobby")[:32]
        lobby = Lobby(name, client)
        self.lobbies[lobby.id] = lobby
        client.lobby = lobby
        lobby.broadcast()

    def _join_lobby(self, client: Client, msg: dict[str, Any]) -> None:
        lobby = self.lobbies.get(str(msg.get("id", "")).upper())
        if lobby is None:
            return self._error(client, "not_found", "That lobby no longer exists.")
        if client.lobby is lobby:
            return lobby.broadcast()
        if client.lobby:
            return self._error(client, "in_lobby", "Leave your current lobby first.")
        if lobby.state != "waiting":
            return self._error(client, "in_progress", "That lobby's match is in progress.")
        if lobby.size >= MAX_PLAYERS:
            return self._error(client, "full", "That lobby is full.")
        self._leave_queue(client)
        lobby.members.append(client)
        client.lobby = lobby
        lobby.broadcast()

    def _leave_lobby_msg(self, client: Client, _msg: dict[str, Any]) -> None:
        self._leave_lobby(client)
        client.send({"t": "lobby_left"})

    def _leave_lobby(self, client: Client) -> None:
        lobby = client.lobby
        if lobby is None:
            return
        client.lobby = None
        lobby.members = [m for m in lobby.members if m is not client]
        lobby.ready.discard(client.id)
        if not lobby.members:
            self.lobbies.pop(lobby.id, None)
            return
        if lobby.host_id == client.id:
            lobby.host_id = lobby.members[0].id
        lobby.broadcast()

    def _toggle_ready(self, client: Client, _msg: dict[str, Any]) -> None:
        lobby = client.lobby
        if lobby is None:
            return
        lobby.ready.symmetric_difference_update({client.id})
        lobby.broadcast()

    def _add_bot(self, client: Client, _msg: dict[str, Any]) -> None:
        lobby = client.lobby
        if lobby is None or lobby.host_id != client.id:
            return self._error(client, "not_host", "Only the host can add bots.")
        if lobby.size >= MAX_PLAYERS:
            return self._error(client, "full", "The lobby is full.")
        lobby.bots.append(make_bot({m.name for m in lobby.members} | {b["name"] for b in lobby.bots}, self.rng))
        lobby.broadcast()

    def _remove_bot(self, client: Client, msg: dict[str, Any]) -> None:
        lobby = client.lobby
        if lobby is None or lobby.host_id != client.id:
            return self._error(client, "not_host", "Only the host can remove bots.")
        lobby.bots = [b for b in lobby.bots if b["id"] != msg.get("id")]
        lobby.broadcast()

    def _start_lobby_match(self, client: Client, _msg: dict[str, Any]) -> None:
        lobby = client.lobby
        if lobby is None or lobby.host_id != client.id:
            return self._error(client, "not_host", "Only the host can start the match.")
        if lobby.size < 2:
            return self._error(client, "too_few", "Add another player or a bot first.")
        not_ready = [m.name for m in lobby.members if m.id != lobby.host_id and m.id not in lobby.ready]
        if not_ready:
            return self._error(client, "not_ready", f"Waiting for: {', '.join(not_ready)}")
        lobby.state = "playing"
        runner = MatchRunner(self, "casual", list(lobby.members), [dict(b) for b in lobby.bots], lobby)
        self.matches[runner.id] = runner
        lobby.broadcast()
