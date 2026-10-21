"""FastAPI application: REST API + the game WebSocket."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import C, Settings
from .db import Database, NameTaken
from .hub import Client, Hub
from .leaderboard import create_leaderboard

log = logging.getLogger("nexus")
NAME_RE = re.compile(r"^[A-Za-z0-9_]{3,16}$")
HELLO_TIMEOUT = 10.0


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db = Database(settings.database_url)
        await db.create_all()
        leaderboard = create_leaderboard(settings.redis_url)
        for row in await db.top_players(500):  # warm the cache from the source of truth
            await leaderboard.set(row.id, row.name, row.rating)
        hub = Hub(db, leaderboard, settings)
        hub.start()
        app.state.db, app.state.leaderboard, app.state.hub = db, leaderboard, hub
        yield
        await hub.stop()
        await leaderboard.close()
        await db.close()

    app = FastAPI(title="NEXUS WORLD", version=__version__, lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET"], allow_headers=["*"])

    @app.get("/api/health")
    async def health():
        hub: Hub = app.state.hub
        return {
            "status": "ok",
            "version": __version__,
            "database": await app.state.db.ping(),
            "redis": await app.state.leaderboard.ping(),
            "online": len(hub.clients),
            "matches": len(hub.matches),
            "inQueue": len(hub.queue),
        }

    @app.get("/api/leaderboard")
    async def leaderboard(limit: int = Query(20, ge=1, le=100)):
        return await app.state.leaderboard.top(limit)

    @app.get("/api/players/{name}")
    async def player(name: str):
        row = await app.state.db.get_player(name)
        if row is None:
            raise HTTPException(404, "Player not found")
        return {
            "id": row.id,
            "name": row.name,
            "rating": row.rating,
            "rank": await app.state.leaderboard.rank(row.id),
            "matches": row.matches,
            "wins": row.wins,
            "kills": row.kills,
            "deaths": row.deaths,
        }

    @app.get("/api/matches")
    async def matches(limit: int = Query(20, ge=1, le=100)):
        rows = await app.state.db.recent_matches(limit)
        return [
            {
                "id": m.id,
                "mode": m.mode,
                "endedAt": m.ended_at.isoformat(),
                "duration": round(m.duration, 1),
                "players": [
                    {"name": p.name, "isBot": p.is_bot, "place": p.place, "score": p.score, "kills": p.kills}
                    for p in sorted(m.participants, key=lambda p: p.place)
                ],
            }
            for m in rows
        ]

    @app.get("/api/replays/{match_id}")
    async def replay(match_id: str):
        data = await app.state.db.get_replay(match_id)
        if data is None:
            raise HTTPException(404, "Replay not found")
        # Stored gzip-compressed: send as-is and let the browser decompress.
        return Response(content=data, media_type="application/json", headers={"Content-Encoding": "gzip"})

    @app.websocket("/ws")
    async def game_socket(ws: WebSocket):
        await ws.accept()
        hub: Hub = app.state.hub
        try:
            hello = json.loads(await asyncio.wait_for(ws.receive_text(), HELLO_TIMEOUT))
        except (TimeoutError, WebSocketDisconnect, ValueError):
            await ws.close(code=1008)
            return
        name = str(hello.get("name", ""))
        if hello.get("t") != "hello" or not NAME_RE.match(name):
            await ws.send_json({"t": "error", "code": "bad_name", "message": "Name must be 3-16 letters, digits or _."})
            await ws.close(code=1008)
            return
        try:
            row, new_token = await app.state.db.login(name, hello.get("token"))
        except NameTaken:
            await ws.send_json({"t": "error", "code": "name_taken", "message": "That name belongs to another player."})
            await ws.close(code=1008)
            return

        color = hello.get("color") if hello.get("color") in C["colors"] else C["colors"][0]
        accessory = hello.get("accessory") if hello.get("accessory") in C["accessories"] else "none"
        client = Client(ws, row.id, row.name, row.rating, color, accessory)
        await hub.connect(client)
        client.send(
            {
                "t": "welcome",
                "id": row.id,
                "name": row.name,
                "token": new_token,
                "rating": row.rating,
                "rank": await app.state.leaderboard.rank(row.id),
            }
        )
        try:
            while True:
                raw = await ws.receive_text()
                if len(raw) > 4096:
                    continue
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                if isinstance(msg, dict):
                    await hub.handle(client, msg)
        except WebSocketDisconnect:
            pass
        except Exception:
            log.exception("socket error for %s", client.name)
        finally:
            hub.disconnect(client)

    if settings.static_dir and Path(settings.static_dir).is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="client")

    return app


app = create_app()
