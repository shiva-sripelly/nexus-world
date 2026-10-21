import os

import pytest

from nexus.config import Settings


@pytest.fixture
def settings(tmp_path) -> Settings:
    """Fast settings for tests. Set NEXUS_TEST_DATABASE_URL / NEXUS_TEST_REDIS_URL
    to run the API tests against real PostgreSQL and Redis (CI does)."""
    return Settings(
        database_url=os.environ.get("NEXUS_TEST_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"),
        redis_url=os.environ.get("NEXUS_TEST_REDIS_URL") or None,
        match_seconds=1.0,
        queue_fill_after=0.2,
        matchmaking_interval=0.05,
    )


@pytest.fixture
def anyio_backend():
    return "asyncio"
