import math

import pytest

from nexus.config import TICK_DT, C
from nexus.sim import Bolt, Enemy, GameSim, parse_input


def make_sim(n_humans=2, bots=0, seconds=30.0, seed=1) -> GameSim:
    roster = [{"id": f"p{i}", "name": f"P{i}"} for i in range(n_humans)]
    roster += [{"id": f"b{i}", "name": f"B{i}", "is_bot": True} for i in range(bots)]
    return GameSim(roster, match_seconds=seconds, seed=seed)


def start(sim: GameSim) -> None:
    while sim.phase == "countdown":
        sim.step()
    sim._enemy_timer = 1e9  # keep Sentinels out of tests that don't want them
    sim.enemies.clear()


def place(sim, pid, x, z):
    p = sim.players[pid]
    p.x, p.z = x, z
    p.protected_until = 0.0
    return p


# ------------------------------------------------------------------- inputs


@pytest.mark.parametrize(
    "data",
    [{}, {"seq": "x"}, {"seq": 1, "aim": float("nan")}, {"seq": -1}, {"seq": 1, "aim": "inf"}],
)
def test_malformed_inputs_are_rejected(data):
    assert parse_input(data) is None


def test_stale_or_duplicate_sequence_numbers_are_ignored():
    sim = make_sim()
    assert sim.push_input("p0", {"seq": 5})
    assert not sim.push_input("p0", {"seq": 5})
    assert not sim.push_input("p0", {"seq": 3})
    assert not sim.push_input("ghost", {"seq": 9})


def test_input_queue_is_bounded():
    sim = make_sim()
    for seq in range(1, 30):
        sim.push_input("p0", {"seq": seq})
    assert len(sim.players["p0"].inputs) == C["maxQueuedInputs"]


def test_countdown_blocks_movement_but_acks_inputs():
    sim = make_sim()
    p = sim.players["p0"]
    x0, z0 = p.x, p.z
    sim.push_input("p0", {"seq": 1, "mx": 1, "mz": 0, "aim": 0})
    sim.step()
    assert (p.x, p.z) == (x0, z0)
    assert p.last_seq == 1


def test_server_applies_at_most_two_inputs_per_tick():
    """Speed-hack guard: flooding inputs cannot move a player faster."""
    sim = make_sim()
    start(sim)
    p = place(sim, "p0", -20.0, 24.0)
    for seq in range(1, 9):
        sim.push_input("p0", {"seq": seq, "mx": 1})
    sim.step()
    assert p.x == pytest.approx(-20.0 + 2 * C["playerSpeed"] * TICK_DT)
    assert p.last_seq == 2


# ------------------------------------------------------------------- combat


def test_fire_rate_is_limited_by_cooldown():
    sim = make_sim()
    start(sim)
    place(sim, "p0", -20.0, 24.0)
    for seq in range(1, 11):
        sim.push_input("p0", {"seq": seq, "fire": True, "aim": 0.0})
        sim.step()
    # 10 ticks = 0.33 s → shots at t=0 and t=0.25 only
    assert sum(1 for b in sim.bolts if b.owner == "p0") <= 2


def test_bolt_hit_deals_damage():
    sim = make_sim()
    start(sim)
    place(sim, "p0", -10.0, 24.0)
    target = place(sim, "p1", -6.0, 24.0)
    sim.push_input("p0", {"seq": 1, "fire": True, "aim": 0.0})
    for _ in range(15):
        sim.step()
    assert target.hp == C["playerMaxHp"] - C["boltDamage"]


def test_kill_awards_score_and_respawns_victim():
    sim = make_sim()
    start(sim)
    shooter = place(sim, "p0", -10.0, 24.0)
    victim = place(sim, "p1", -6.0, 24.0)
    victim.hp = C["boltDamage"]
    sim.bolts.append(Bolt(99, "p0", -7.5, 24.0, C["boltSpeed"], 0.0))
    sim.step()
    assert not victim.alive
    assert shooter.kills == 1 and shooter.score == C["scoreKillPlayer"]
    assert victim.deaths == 1
    events = sim.snapshot()["events"]
    assert {"type": "kill", "killer": "p0", "victim": "p1"} in events

    for _ in range(int(C["respawnSeconds"] / TICK_DT) + 2):
        sim.step()
    assert victim.alive and victim.hp == C["playerMaxHp"]
    assert sim.time < victim.protected_until  # spawn protection


def test_walls_block_bolts():
    sim = make_sim()
    start(sim)
    place(sim, "p0", -6.0, 0.0)  # centre pillar spans x in [-2.5, 2.5]
    target = place(sim, "p1", 6.0, 0.0)
    sim.push_input("p0", {"seq": 1, "fire": True, "aim": 0.0})
    for _ in range(30):
        sim.step()
    assert target.hp == C["playerMaxHp"]


def test_spawn_protection_prevents_damage():
    sim = make_sim()
    start(sim)
    place(sim, "p0", -10.0, 24.0)
    target = place(sim, "p1", -6.0, 24.0)
    target.protected_until = sim.time + 10
    sim.bolts.append(Bolt(1, "p0", -7.5, 24.0, C["boltSpeed"], 0.0))
    sim.step()
    assert target.hp == C["playerMaxHp"]


def test_players_cannot_shoot_themselves():
    sim = make_sim()
    start(sim)
    p = place(sim, "p0", -10.0, 24.0)
    sim.bolts.append(Bolt(1, "p0", -10.0, 24.0, C["boltSpeed"], 0.0))
    sim.step()
    assert p.hp == C["playerMaxHp"]


# ------------------------------------------------------------------ enemies


def test_sentinels_spawn_chase_and_hit():
    sim = make_sim(n_humans=1)
    start(sim)
    p = place(sim, "p0", -20.0, 24.0)
    e = Enemy("e1", -20.0, 20.0)
    sim.enemies[e.id] = e
    d0 = math.hypot(e.x - p.x, e.z - p.z)
    for _ in range(40):
        sim.step()
    assert math.hypot(e.x - p.x, e.z - p.z) < d0
    assert p.hp < C["playerMaxHp"]


def test_killing_a_sentinel_scores_points():
    sim = make_sim(n_humans=1)
    start(sim)
    shooter = place(sim, "p0", -20.0, 24.0)
    sim.enemies["e1"] = Enemy("e1", -15.0, 24.0, hp=C["boltDamage"])
    sim.bolts.append(Bolt(1, "p0", -16.0, 24.0, C["boltSpeed"], 0.0))
    sim.step()
    assert "e1" not in sim.enemies
    assert shooter.score == C["scoreKillEnemy"]


def test_sentinels_spawn_over_time():
    sim = make_sim(n_humans=1, seconds=60)
    while sim.phase == "countdown":
        sim.step()
    for _ in range(int(12 / TICK_DT)):
        sim.step()
    assert len(sim.enemies) >= 1


# ------------------------------------------------------------- match flow


def test_match_ends_after_duration():
    sim = make_sim(seconds=2.0)
    for _ in range(int((C["countdownSeconds"] + 2.0) / TICK_DT) + 2):
        sim.step()
    assert sim.phase == "ended"
    assert sim.time_left == 0


def test_bots_play_a_full_match():
    sim = make_sim(n_humans=0, bots=4, seconds=60, seed=3)
    while sim.phase != "ended":
        sim.step()
    standings = sim.standings()
    assert [s["place"] for s in standings] == [1, 2, 3, 4]
    assert sum(s["kills"] for s in standings) > 0
    assert standings[0]["score"] >= standings[-1]["score"]


def test_disconnected_player_is_ignored():
    sim = make_sim()
    start(sim)
    sim.disconnect("p1")
    p = sim.players["p1"]
    sim.push_input("p1", {"seq": 1, "mx": 1})
    x0 = p.x
    sim.step()
    assert p.x == x0
    assert not sim.snapshot()["players"][1]["on"]


def test_snapshot_shape():
    sim = make_sim(bots=1)
    snap = sim.snapshot()
    assert snap["t"] == "snap"
    assert {"tick", "phase", "timeLeft", "players", "enemies", "bolts", "events"} <= snap.keys()
    assert {"id", "x", "z", "a", "hp", "al", "pr", "s", "k", "d", "q", "on"} == snap["players"][0].keys()
