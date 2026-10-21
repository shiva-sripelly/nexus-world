"""AI opponents (bots that play the match like humans do).

Bots never touch the simulation directly: each tick they produce an
``Input``, exactly like a human client, so they obey the same movement,
collision and fire-rate rules.
"""

from __future__ import annotations

import math
import random
from typing import TYPE_CHECKING

from .physics import segment_blocked

if TYPE_CHECKING:
    from .sim import GameSim, Input, Player

AIM_ERROR = 0.14  # radians of random aim error
APPROACH_DIST = 11.0
RETREAT_DIST = 5.0
FIRE_RANGE = 20.0


def _discrete(dx: float, dz: float) -> tuple[int, int]:
    length = math.sqrt(dx * dx + dz * dz)
    if length < 1e-6:
        return 0, 0
    mx = (1 if dx > 0 else -1) if abs(dx) > 0.38 * length else 0
    mz = (1 if dz > 0 else -1) if abs(dz) > 0.38 * length else 0
    return mx, mz


def bot_input(sim: GameSim, bot: Player, rng: random.Random) -> Input:
    from .sim import Input

    brain = bot.brain
    seq = bot.last_seq + len(bot.inputs) + 1
    if not bot.alive:
        return Input(seq, 0, 0, bot.aim, False)

    # Stuck detection: flip strafe direction if we barely moved recently.
    history = brain.setdefault("history", [])
    history.append((bot.x, bot.z))
    if len(history) > 15:
        hx, hz = history.pop(0)
        if math.hypot(bot.x - hx, bot.z - hz) < 0.3:
            brain["strafe"] = -brain.get("strafe", 1)
            brain["wander"] = None

    if sim.time >= brain.get("strafe_until", 0.0):
        brain["strafe"] = rng.choice((-1, 1))
        brain["strafe_until"] = sim.time + rng.uniform(1.0, 2.5)

    candidates: list[tuple[float, float, float]] = []
    for p in sim.players.values():
        if p.id != bot.id and p.alive and p.connected and sim.time >= p.protected_until:
            candidates.append(((p.x - bot.x) ** 2 + (p.z - bot.z) ** 2, p.x, p.z))
    for e in sim.enemies.values():
        candidates.append(((e.x - bot.x) ** 2 + (e.z - bot.z) ** 2, e.x, e.z))

    if not candidates:
        target = brain.get("wander")
        if target is None or math.hypot(target[0] - bot.x, target[1] - bot.z) < 2:
            target = (rng.uniform(-22, 22), rng.uniform(-22, 22))
            brain["wander"] = target
        mx, mz = _discrete(target[0] - bot.x, target[1] - bot.z)
        return Input(seq, mx, mz, math.atan2(target[1] - bot.z, target[0] - bot.x), False)

    _, tx, tz = min(candidates)
    dx, dz = tx - bot.x, tz - bot.z
    dist = math.sqrt(dx * dx + dz * dz)
    aim = math.atan2(dz, dx) + rng.uniform(-AIM_ERROR, AIM_ERROR)
    clear = not segment_blocked(bot.x, bot.z, tx, tz)

    ux, uz = (dx / dist, dz / dist) if dist > 1e-6 else (1.0, 0.0)
    side_x, side_z = -uz * brain["strafe"], ux * brain["strafe"]
    if bot.hp <= 30 and dist < APPROACH_DIST:
        move_x, move_z = -ux + side_x * 0.6, -uz + side_z * 0.6
    elif dist > APPROACH_DIST or not clear:
        move_x, move_z = ux + side_x * 0.5, uz + side_z * 0.5
    elif dist < RETREAT_DIST:
        move_x, move_z = -ux + side_x * 0.5, -uz + side_z * 0.5
    else:
        move_x, move_z = side_x, side_z

    mx, mz = _discrete(move_x, move_z)
    return Input(seq, mx, mz, aim, clear and dist < FIRE_RANGE)
