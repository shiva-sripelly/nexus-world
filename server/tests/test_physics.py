import json
import math
from pathlib import Path

import pytest

from nexus.config import TICK_DT
from nexus.physics import (
    HALF,
    OBSTACLES,
    PLAYER_RADIUS,
    PLAYER_SPEED,
    move_direction,
    resolve_circle,
    segment_blocked,
    segment_point_distance,
    step_player,
)

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "movement_fixtures.json"


def test_straight_move_covers_speed_times_dt():
    x, z = step_player(-20.0, -25.0, 1, 0, TICK_DT)
    assert x == pytest.approx(-20.0 + PLAYER_SPEED * TICK_DT)
    assert z == -25.0


def test_diagonal_is_normalized():
    dx, dz = move_direction(1, 1)
    assert math.hypot(dx, dz) == pytest.approx(1.0)


def test_input_values_are_clamped():
    assert move_direction(5, -9) == move_direction(1, -1)


def test_arena_walls_stop_the_player():
    x, z = HALF - PLAYER_RADIUS, 0.0
    for _ in range(30):
        x, z = step_player(x, z, 1, 0, TICK_DT)
    assert x == pytest.approx(HALF - PLAYER_RADIUS)


@pytest.mark.parametrize("box", OBSTACLES)
def test_players_never_end_inside_obstacles(box):
    # Walk straight into the left face of every obstacle for two seconds.
    x, z = box.x - box.hx - 2.0, box.z
    for _ in range(60):
        x, z = step_player(x, z, 1, 0, TICK_DT)
    assert x <= box.x - box.hx - PLAYER_RADIUS + 1e-9


def test_circle_inside_box_is_pushed_out():
    box = OBSTACLES[0]
    x, z = resolve_circle(box.x, box.z, PLAYER_RADIUS)
    nearest = min(abs(x - (box.x - box.hx)), abs(x - (box.x + box.hx)), abs(z - (box.z - box.hz)), abs(z - (box.z + box.hz)))
    assert nearest == pytest.approx(PLAYER_RADIUS)


def test_segment_blocked_by_centre_pillar():
    assert segment_blocked(-10, 0, 10, 0)
    assert not segment_blocked(-10, 24, 10, 24)


def test_segment_point_distance():
    assert segment_point_distance(0, 0, 10, 0, 5, 3) == pytest.approx(3)
    assert segment_point_distance(0, 0, 10, 0, -4, 3) == pytest.approx(5)


def test_shared_fixtures_match_server_physics():
    """The client tests the same fixtures, so this proves client and server agree."""
    data = json.loads(FIXTURES.read_text())
    assert data["dt"] == pytest.approx(TICK_DT)
    for case in data["cases"]:
        x, z = case["x"], case["z"]
        for mx, mz in case["steps"]:
            x, z = step_player(x, z, mx, mz, data["dt"])
        assert [x, z] == pytest.approx(case["expected"], abs=1e-12)
