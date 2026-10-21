# NEXUS WORLD

[![CI](https://github.com/YOUR-USERNAME/nexus-world/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR-USERNAME/nexus-world/actions/workflows/ci.yml)

A browser-based, real-time multiplayer 3D arena game. Players queue for ranked matches or create lobbies, customise their character and fight each other, AI opponents and AI Sentinel enemies in a neon arena. The server is authoritative: clients only send inputs, and every position, hit and score is decided on the server.

**Stack:** React Three Fiber · Three.js · TypeScript · FastAPI · WebSockets · PostgreSQL · Redis

## Features

| Area | What it does |
|------|--------------|
| **Real-time networking** | One WebSocket per player. A 30 Hz server tick, 15 Hz snapshots, a bounded outgoing queue per client (slow connections drop stale snapshots instead of stalling the game loop), and a latency meter. |
| **Server-authoritative gameplay** | Inputs are validated and sequence-numbered. The server applies at most 2 inputs per tick, which blocks speed hacks, and it alone resolves movement, collisions, bolts, damage, kills and respawns. |
| **Client-side prediction** | The local player moves instantly using a TypeScript port of the server physics, then reconciles against each snapshot by replaying unacknowledged inputs. Small errors are smoothed out rather than snapped. |
| **Interpolation** | Other players, enemies and bolts are rendered about 133 ms in the past and blended between snapshots. Respawn teleports are detected so players don't slide across the map. |
| **Matchmaking** | A ranked queue groups the longest-waiting player with the closest ratings, and AI opponents fill empty slots after a short wait. |
| **Lobbies** | Create a lobby, share its code, ready up, add or remove AI opponents, and the host starts a casual match. |
| **AI** | AI opponents play through the same input pipeline as humans: target selection, line-of-sight checks, strafing, retreating at low health, and stuck detection. Sentinel enemies spawn in waves and hunt the nearest player. |
| **Ranked play** | Multiplayer Elo, computed pairwise across every pair of finishers. Ratings are stored in PostgreSQL, and the leaderboard is cached in a Redis sorted set. |
| **Replays** | Every match is recorded, gzip-compressed (a few KB per minute), stored in PostgreSQL and sent to the browser still compressed. The replay viewer has play/pause, seek, 0.5× to 4× speed and a choice of which player to follow. |
| **Character customization** | Jacket colour and accessory (visor, horns, antenna, halo), with a live 3D preview. |
| **Performance** | Arena decoration and bolts use `InstancedMesh`, Sentinels come from a fixed object pool, game state lives outside React so it never triggers re-renders, and the bloom pass gives the neon glow. |

## Architecture

```
 Browser (React + R3F)                         Server (FastAPI)
┌──────────────────────────┐   WebSocket   ┌──────────────────────────────┐
│ input sampler (30 Hz) ───┼──── input ───▶│ Hub: lobbies, matchmaking     │
│ prediction + reconcile   │               │ MatchRunner (asyncio, 30 Hz)  │
│ snapshot buffer + interp │◀── snapshot ──┤   └─ GameSim (pure Python)    │
│ R3F scene, HUD           │   (15 Hz)     │       physics · AI · combat   │
└──────────────────────────┘               │ Elo · replay recorder         │
            ▲  REST: leaderboard,          └───────┬──────────────┬───────┘
            └─ matches, replays                    ▼              ▼
                                               PostgreSQL       Redis
                                           players, matches,  leaderboard
                                               replays        sorted set
```

The two physics implementations, `server/nexus/physics.py` and `client/src/game/physics.ts`, must behave identically for prediction to work. Both test suites check them against the same generated fixtures in `shared/movement_fixtures.json`, so CI fails if they drift apart. Shared game constants live in `shared/constants.json`, which both sides read.

## Project Structure

```
nexus-world/
├── shared/                 constants.json, movement_fixtures.json
├── server/
│   ├── nexus/
│   │   ├── app.py          FastAPI app: REST + /ws
│   │   ├── hub.py          connections, lobbies, matchmaking, MatchRunner
│   │   ├── sim.py          authoritative game simulation
│   │   ├── physics.py      movement, collision, ray tests
│   │   ├── ai.py           AI opponents
│   │   ├── elo.py          multiplayer Elo
│   │   ├── replay.py       recording and compression
│   │   ├── db.py           SQLAlchemy models + queries (PostgreSQL / SQLite)
│   │   └── leaderboard.py  Redis sorted set, with an in-memory fallback
│   ├── scripts/make_fixtures.py
│   └── tests/              55 tests
├── client/
│   └── src/
│       ├── game/           prediction, interpolation, replay player, store
│       ├── net/            socket + protocol types
│       ├── scene/          arena, characters, sentinels, bolts, preview
│       └── ui/             menu, queue, lobbies, HUD, results, leaderboard, replays
├── Dockerfile              builds the client and serves it from FastAPI
└── docker-compose.yml      game + PostgreSQL + Redis
```

## Run It

### Option 1: Docker (everything in one command)

```bash
docker compose up --build
```

Then open http://localhost:8000.

### Option 2: Local development

The server works without PostgreSQL or Redis. By default it uses SQLite and an in-memory leaderboard.

```bash
# Terminal 1: game server
cd server
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn nexus.app:app --reload

# Terminal 2: client
cd client
npm install
npm run dev
```

Then open http://localhost:5173. Vite forwards `/api` and `/ws` requests to the server on port 8000. To test multiplayer, open a second browser window with a different callsign.

To use PostgreSQL and Redis locally, set these before starting the server:

```bash
export DATABASE_URL=postgresql+asyncpg://nexus:nexus@localhost:5432/nexus
export REDIS_URL=redis://localhost:6379/0
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./nexus.db` | Database connection |
| `REDIS_URL` | *(unset: in-memory)* | Leaderboard cache |
| `NEXUS_MATCH_SECONDS` | `150` | Match length in seconds |
| `NEXUS_QUEUE_FILL_AFTER` | `8` | Seconds to wait before AI opponents fill a ranked match |
| `NEXUS_STATIC_DIR` | *(unset)* | Folder with a built client for the server to serve |

## Controls

| Input | Action |
|-------|--------|
| `W` `A` `S` `D` or arrow keys | Move |
| Mouse | Aim |
| Left click or `Space` | Fire |

Scoring: +100 for eliminating a player, +25 for destroying a Sentinel, and −25 for being destroyed by a Sentinel. When the timer runs out, the highest score wins.

## Testing

```bash
cd server && pytest -v && ruff check .            # 55 tests
cd client && npm run typecheck && npm test        # 17 tests
```

To run the server tests against real services, set these variables first. CI does this:

```bash
NEXUS_TEST_DATABASE_URL=postgresql+asyncpg://... NEXUS_TEST_REDIS_URL=redis://... pytest
```

What the tests cover:

- **Physics:** wall and obstacle collision, diagonal normalization, ray tests, and the server/client parity fixtures.
- **Simulation:** input validation, the per-tick input limit, fire cooldown, hits, kills, score, respawns, spawn protection, walls blocking bolts, Sentinel chase and contact damage, full bot-only matches, and the snapshot schema.
- **Matchmaking and Elo:** rating-based grouping, filling with AI opponents, Elo symmetry, upset wins, and bots never being rated.
- **API, end to end:** name claiming with token protection, a full ranked match over the WebSocket (leaderboard, profile, match history and the compressed replay), the full lobby flow (host-only actions, ready checks, casual matches leaving ratings unchanged), and error handling.
- **Client:** prediction and reconciliation, interpolation, the snapshot buffer, and replay seeking and events.

If you change the physics, regenerate the fixtures with `python server/scripts/make_fixtures.py` and update `physics.ts` to match.

## WebSocket Protocol

Client → server: `hello`, `queue`, `cancel_queue`, `create_lobby`, `join_lobby`, `leave_lobby`, `toggle_ready`, `add_bot`, `remove_bot`, `start_match`, `update_look`, `input {seq, mx, mz, aim, fire}`, `leave_match`, `ping`.

Server → client: `welcome`, `error`, `lobbies`, `lobby`, `queue_status`, `match_start`, `snap`, `match_end`, `pong`.

Exact message shapes are in `client/src/net/protocol.ts`.

## License

MIT
"# nexus-world" 
