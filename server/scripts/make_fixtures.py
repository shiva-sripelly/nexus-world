"""Regenerate shared/movement_fixtures.json from the server's physics.

The client's prediction code (client/src/game/physics.ts) is tested against
these fixtures, so any change to movement or collision on the server that is
not mirrored on the client makes the client tests fail.

    python scripts/make_fixtures.py
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from nexus.config import TICK_DT  # noqa: E402
from nexus.physics import HALF, OBSTACLES, step_player  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "shared" / "movement_fixtures.json"


def run(x: float, z: float, steps: list[list[int]]) -> list[float]:
    for mx, mz in steps:
        x, z = step_player(x, z, mx, mz, TICK_DT)
    return [x, z]


def main() -> None:
    rng = random.Random(1234)
    cases = []
    starts = [(0.0, 0.0), (HALF - 0.6, HALF - 0.6), (-HALF + 0.6, 0.0)]
    for b in OBSTACLES:  # right next to every obstacle face
        starts += [(b.x - b.hx - 0.7, b.z), (b.x + b.hx + 0.7, b.z), (b.x, b.z - b.hz - 0.7), (b.x, b.z + b.hz + 0.7)]
    starts += [(rng.uniform(-HALF, HALF), rng.uniform(-HALF, HALF)) for _ in range(60)]
    for x, z in starts:
        steps = []
        for _ in range(rng.randint(5, 90)):
            move = [rng.choice((-1, 0, 1)), rng.choice((-1, 0, 1))]
            steps += [move] * rng.randint(1, 12)
        cases.append({"x": x, "z": z, "steps": steps, "expected": run(x, z, steps)})
    OUT.write_text(json.dumps({"dt": TICK_DT, "cases": cases}))
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
