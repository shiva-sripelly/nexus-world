"""Server-authoritative match simulation.

Clients only send inputs. The server applies them at a fixed tick rate,
runs AI enemies and AI opponents, resolves combat and is the single source
of truth for every position, hit and score.
"""

from __future__ import annotations

import math
import random
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from . import ai
from .config import TICK_DT, C
from .physics import (
    PLAYER_RADIUS,
    inside_arena,
    resolve_circle,
    segment_blocked,
    segment_point_distance,
    step_player,
)

ENEMY_RADIUS = float(C["enemyRadius"])
BOLT_RADIUS = float(C["boltRadius"])


@dataclass
class Input:
    seq: int
    mx: int
    mz: int
    aim: float
    fire: bool


@dataclass
class Player:
    id: str
    name: str
    color: str
    accessory: str
    is_bot: bool = False
    x: float = 0.0
    z: float = 0.0
    aim: float = 0.0
    hp: int = C["playerMaxHp"]
    alive: bool = True
    respawn_at: float = 0.0
    protected_until: float = 0.0
    score: int = 0
    kills: int = 0
    deaths: int = 0
    fire_cd: float = 0.0
    last_seq: int = 0
    connected: bool = True
    inputs: deque[Input] = field(default_factory=deque)
    brain: dict[str, Any] = field(default_factory=dict)


@dataclass
class Enemy:
    id: str
    x: float
    z: float
    hp: int = C["enemyMaxHp"]
    hit_cd: float = 0.0


@dataclass
class Bolt:
    id: int
    owner: str
    x: float
    z: float
    vx: float
    vz: float
    life: float = C["boltLife"]


def parse_input(data: dict[str, Any]) -> Input | None:
    """Validate an untrusted input message. Returns None if it is malformed."""
    try:
        seq = int(data["seq"])
        mx = max(-1, min(1, int(data.get("mx", 0))))
        mz = max(-1, min(1, int(data.get("mz", 0))))
        aim = float(data.get("aim", 0.0))
        fire = bool(data.get("fire", False))
    except (KeyError, TypeError, ValueError):
        return None
    if not math.isfinite(aim) or seq < 0:
        return None
    return Input(seq, mx, mz, aim, fire)


class GameSim:
    def __init__(self, roster: list[dict[str, Any]], match_seconds: float = 150.0, seed: int | None = None):
        self.rng = random.Random(seed)
        self.match_seconds = match_seconds
        self.countdown = float(C["countdownSeconds"])
        self.time = 0.0
        self.tick = 0
        self.phase = "countdown"
        self.players: dict[str, Player] = {}
        self.enemies: dict[str, Enemy] = {}
        self.bolts: list[Bolt] = []
        self.events: list[dict[str, Any]] = []
        self._next_bolt = 1
        self._next_enemy = 1
        self._enemy_timer = 2.0

        spawns = list(C["spawnPoints"])
        self.rng.shuffle(spawns)
        for i, entry in enumerate(roster):
            spot = spawns[i % len(spawns)]
            p = Player(
                id=entry["id"],
                name=entry["name"],
                color=entry.get("color", C["colors"][0]),
                accessory=entry.get("accessory", "none"),
                is_bot=entry.get("is_bot", False),
                x=float(spot["x"]),
                z=float(spot["z"]),
            )
            p.aim = math.atan2(-p.z, -p.x)  # face the centre
            self.players[p.id] = p

    # ------------------------------------------------------------------ input

    def push_input(self, player_id: str, data: dict[str, Any]) -> bool:
        p = self.players.get(player_id)
        inp = parse_input(data)
        if p is None or inp is None or inp.seq <= p.last_seq:
            return False
        if p.inputs and inp.seq <= p.inputs[-1].seq:
            return False
        if len(p.inputs) >= C["maxQueuedInputs"]:
            p.inputs.popleft()
        p.inputs.append(inp)
        return True

    def disconnect(self, player_id: str) -> None:
        p = self.players.get(player_id)
        if p:
            p.connected = False
            p.inputs.clear()

    # ------------------------------------------------------------------- tick

    @property
    def time_left(self) -> float:
        if self.phase == "countdown":
            return self.match_seconds
        return max(0.0, self.countdown + self.match_seconds - self.time)

    def step(self) -> None:
        if self.phase == "ended":
            return
        self.tick += 1
        self.time += TICK_DT

        if self.phase == "countdown":
            for p in self.players.values():
                while p.inputs:
                    inp = p.inputs.popleft()
                    p.last_seq, p.aim = inp.seq, inp.aim
            if self.time >= self.countdown:
                self.phase = "playing"
            return

        for p in self.players.values():
            if p.is_bot and p.connected:
                p.inputs.append(ai.bot_input(self, p, self.rng))

        for p in self.players.values():
            p.fire_cd = max(0.0, p.fire_cd - TICK_DT)
            if not p.alive and self.time >= p.respawn_at and p.connected:
                self._respawn(p)
            budget = C["maxInputsPerTick"]
            while p.inputs and budget > 0:
                self._apply_input(p, p.inputs.popleft())
                budget -= 1

        self._step_enemies()
        self._step_bolts()

        if self.time >= self.countdown + self.match_seconds:
            self.phase = "ended"

    def _apply_input(self, p: Player, inp: Input) -> None:
        p.last_seq = inp.seq
        p.aim = inp.aim
        if not p.alive or not p.connected:
            return
        p.x, p.z = step_player(p.x, p.z, inp.mx, inp.mz, TICK_DT)
        if inp.fire and p.fire_cd <= 0.0:
            p.fire_cd = C["fireCooldown"]
            dx, dz = math.cos(inp.aim), math.sin(inp.aim)
            offset = PLAYER_RADIUS + BOLT_RADIUS + 0.05
            self.bolts.append(
                Bolt(
                    self._next_bolt,
                    p.id,
                    p.x + dx * offset,
                    p.z + dz * offset,
                    dx * C["boltSpeed"],
                    dz * C["boltSpeed"],
                )
            )
            self._next_bolt += 1

    def _respawn(self, p: Player) -> None:
        others = [(o.x, o.z) for o in self.players.values() if o.alive and o.id != p.id]
        others += [(e.x, e.z) for e in self.enemies.values()]

        def safety(spot: dict[str, float]) -> float:
            if not others:
                return self.rng.random()
            return min(math.hypot(spot["x"] - ox, spot["z"] - oz) for ox, oz in others)

        spot = max(C["spawnPoints"], key=safety)
        p.x, p.z = float(spot["x"]), float(spot["z"])
        p.hp = C["playerMaxHp"]
        p.alive = True
        p.protected_until = self.time + C["spawnProtectionSeconds"]
        p.inputs.clear()

    # ---------------------------------------------------------------- enemies

    def _step_enemies(self) -> None:
        self._enemy_timer -= TICK_DT
        if self._enemy_timer <= 0:
            self._enemy_timer = C["enemySpawnEvery"]
            if len(self.enemies) < C["enemyMaxAlive"]:
                spot = self.rng.choice(C["enemySpawnPoints"])
                eid = f"e{self._next_enemy}"
                self._next_enemy += 1
                self.enemies[eid] = Enemy(eid, float(spot["x"]), float(spot["z"]))

        targets = [p for p in self.players.values() if p.alive and p.connected]
        for e in self.enemies.values():
            e.hit_cd = max(0.0, e.hit_cd - TICK_DT)
            if not targets:
                continue
            t = min(targets, key=lambda p: (p.x - e.x) ** 2 + (p.z - e.z) ** 2)
            dx, dz = t.x - e.x, t.z - e.z
            dist = math.sqrt(dx * dx + dz * dz)
            if dist > 1e-6:
                step = min(dist, C["enemySpeed"] * TICK_DT)
                e.x += dx / dist * step
                e.z += dz / dist * step
            if dist < PLAYER_RADIUS + ENEMY_RADIUS + 0.05 and e.hit_cd <= 0 and self.time >= t.protected_until:
                e.hit_cd = C["enemyHitCooldown"]
                self._damage_player(t, C["enemyContactDamage"], None)

        # Keep enemies from stacking on top of each other.
        enemies = list(self.enemies.values())
        for i, a in enumerate(enemies):
            for b in enemies[i + 1 :]:
                dx, dz = b.x - a.x, b.z - a.z
                d = math.sqrt(dx * dx + dz * dz)
                min_d = ENEMY_RADIUS * 2
                if 1e-6 < d < min_d:
                    push = (min_d - d) / 2
                    a.x -= dx / d * push
                    a.z -= dz / d * push
                    b.x += dx / d * push
                    b.z += dz / d * push
        for e in enemies:
            e.x, e.z = resolve_circle(e.x, e.z, ENEMY_RADIUS)

    # ------------------------------------------------------------------ bolts

    def _step_bolts(self) -> None:
        alive: list[Bolt] = []
        for b in self.bolts:
            x0, z0 = b.x, b.z
            b.x += b.vx * TICK_DT
            b.z += b.vz * TICK_DT
            b.life -= TICK_DT
            if b.life <= 0 or not inside_arena(b.x, b.z) or segment_blocked(x0, z0, b.x, b.z):
                continue
            if not self._bolt_hit(b, x0, z0):
                alive.append(b)
        self.bolts = alive

    def _bolt_hit(self, b: Bolt, x0: float, z0: float) -> bool:
        for p in self.players.values():
            if p.id == b.owner or not p.alive or not p.connected or self.time < p.protected_until:
                continue
            if segment_point_distance(x0, z0, b.x, b.z, p.x, p.z) <= PLAYER_RADIUS + BOLT_RADIUS:
                self._damage_player(p, C["boltDamage"], b.owner)
                return True
        for e in list(self.enemies.values()):
            if segment_point_distance(x0, z0, b.x, b.z, e.x, e.z) <= ENEMY_RADIUS + BOLT_RADIUS:
                e.hp -= C["boltDamage"]
                if e.hp <= 0:
                    del self.enemies[e.id]
                    shooter = self.players.get(b.owner)
                    if shooter:
                        shooter.score += C["scoreKillEnemy"]
                    self.events.append({"type": "sentinel_down", "by": b.owner})
                return True
        return False

    def _damage_player(self, p: Player, amount: int, attacker_id: str | None) -> None:
        p.hp -= amount
        if p.hp > 0:
            return
        p.hp = 0
        p.alive = False
        p.deaths += 1
        p.respawn_at = self.time + C["respawnSeconds"]
        attacker = self.players.get(attacker_id) if attacker_id else None
        if attacker:
            attacker.kills += 1
            attacker.score += C["scoreKillPlayer"]
        else:
            p.score = max(0, p.score + C["scoreDeathToEnemy"])
        self.events.append({"type": "kill", "killer": attacker_id, "victim": p.id})

    # --------------------------------------------------------------- output

    def roster(self) -> list[dict[str, Any]]:
        return [
            {"id": p.id, "name": p.name, "color": p.color, "accessory": p.accessory, "is_bot": p.is_bot}
            for p in self.players.values()
        ]

    def snapshot(self) -> dict[str, Any]:
        events, self.events = self.events, []
        return {
            "t": "snap",
            "tick": self.tick,
            "phase": self.phase,
            "timeLeft": round(self.time_left, 2),
            "countdown": round(max(0.0, self.countdown - self.time), 2),
            "players": [
                {
                    "id": p.id,
                    "x": round(p.x, 3),
                    "z": round(p.z, 3),
                    "a": round(p.aim, 3),
                    "hp": p.hp,
                    "al": p.alive,
                    "pr": self.time < p.protected_until,
                    "s": p.score,
                    "k": p.kills,
                    "d": p.deaths,
                    "q": p.last_seq,
                    "on": p.connected,
                }
                for p in self.players.values()
            ],
            "enemies": [{"id": e.id, "x": round(e.x, 3), "z": round(e.z, 3), "hp": e.hp} for e in self.enemies.values()],
            "bolts": [{"id": b.id, "x": round(b.x, 3), "z": round(b.z, 3), "o": b.owner} for b in self.bolts],
            "events": events,
        }

    def standings(self) -> list[dict[str, Any]]:
        ranked = sorted(self.players.values(), key=lambda p: (-p.score, -p.kills, p.deaths, p.name))
        return [
            {
                "id": p.id,
                "name": p.name,
                "is_bot": p.is_bot,
                "score": p.score,
                "kills": p.kills,
                "deaths": p.deaths,
                "place": i + 1,
            }
            for i, p in enumerate(ranked)
        ]
