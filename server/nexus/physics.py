"""Deterministic 2D physics on the arena floor (x, z).

The client runs an identical port of ``step_player`` (client/src/game/physics.ts)
for client-side prediction. Both are checked against the same fixture file
(shared/movement_fixtures.json), so keep the two in sync.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .config import C

HALF = float(C["arenaHalfSize"])
PLAYER_RADIUS = float(C["playerRadius"])
PLAYER_SPEED = float(C["playerSpeed"])


@dataclass(frozen=True)
class Box:
    x: float
    z: float
    hx: float
    hz: float


OBSTACLES: tuple[Box, ...] = tuple(Box(o["x"], o["z"], o["hx"], o["hz"]) for o in C["obstacles"])


def resolve_circle(x: float, z: float, r: float) -> tuple[float, float]:
    """Push a circle out of the arena walls and every obstacle."""
    for _ in range(2):
        for box in OBSTACLES:
            cx = min(max(x, box.x - box.hx), box.x + box.hx)
            cz = min(max(z, box.z - box.hz), box.z + box.hz)
            dx = x - cx
            dz = z - cz
            d2 = dx * dx + dz * dz
            if d2 >= r * r:
                continue
            if d2 > 1e-12:
                d = math.sqrt(d2)
                push = r - d
                x += dx / d * push
                z += dz / d * push
            else:
                # Centre is inside the box: leave by the nearest face.
                left = x - (box.x - box.hx)
                right = (box.x + box.hx) - x
                top = z - (box.z - box.hz)
                bottom = (box.z + box.hz) - z
                m = min(left, right, top, bottom)
                if m == left:
                    x = box.x - box.hx - r
                elif m == right:
                    x = box.x + box.hx + r
                elif m == top:
                    z = box.z - box.hz - r
                else:
                    z = box.z + box.hz + r
        x = min(max(x, -HALF + r), HALF - r)
        z = min(max(z, -HALF + r), HALF - r)
    return x, z


def move_direction(mx: int, mz: int) -> tuple[float, float]:
    mx = max(-1, min(1, int(mx)))
    mz = max(-1, min(1, int(mz)))
    if mx and mz:
        inv = 1.0 / math.sqrt(2.0)
        return mx * inv, mz * inv
    return float(mx), float(mz)


def step_player(x: float, z: float, mx: int, mz: int, dt: float) -> tuple[float, float]:
    """Advance a player by one input. Must match the client's stepPlayer exactly."""
    dx, dz = move_direction(mx, mz)
    return resolve_circle(x + dx * PLAYER_SPEED * dt, z + dz * PLAYER_SPEED * dt, PLAYER_RADIUS)


def segment_hits_box(x0: float, z0: float, x1: float, z1: float, box: Box, pad: float = 0.0) -> bool:
    """Slab test: does the segment from (x0, z0) to (x1, z1) touch the (padded) box?"""
    t_min, t_max = 0.0, 1.0
    for p0, d, lo, hi in (
        (x0, x1 - x0, box.x - box.hx - pad, box.x + box.hx + pad),
        (z0, z1 - z0, box.z - box.hz - pad, box.z + box.hz + pad),
    ):
        if abs(d) < 1e-12:
            if p0 < lo or p0 > hi:
                return False
            continue
        t1 = (lo - p0) / d
        t2 = (hi - p0) / d
        if t1 > t2:
            t1, t2 = t2, t1
        t_min = max(t_min, t1)
        t_max = min(t_max, t2)
        if t_min > t_max:
            return False
    return True


def segment_blocked(x0: float, z0: float, x1: float, z1: float, pad: float = 0.0) -> bool:
    return any(segment_hits_box(x0, z0, x1, z1, box, pad) for box in OBSTACLES)


def segment_point_distance(x0: float, z0: float, x1: float, z1: float, px: float, pz: float) -> float:
    dx, dz = x1 - x0, z1 - z0
    len2 = dx * dx + dz * dz
    t = 0.0 if len2 < 1e-12 else max(0.0, min(1.0, ((px - x0) * dx + (pz - z0) * dz) / len2))
    cx, cz = x0 + dx * t, z0 + dz * t
    return math.sqrt((px - cx) ** 2 + (pz - cz) ** 2)


def inside_arena(x: float, z: float) -> bool:
    return -HALF <= x <= HALF and -HALF <= z <= HALF
