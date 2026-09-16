import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://urban:test@127.0.0.1/urban_ai_test")
os.environ.setdefault("JWT_SECRET", "test-only-secret-with-at-least-32-characters")
os.environ.setdefault("EDGE_API_KEY", "test-only-edge-key")


@pytest.fixture
def db():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a dedicated PostGIS database ending in _test")
    engine = create_engine(url)
    if not engine.url.database.endswith("_test"):
        pytest.fail("Integration database name must end in _test")
    from app.db.models import Base
    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        Base.metadata.create_all(connection)
    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(connection, join_transaction_mode="create_savepoint", expire_on_commit=False) as session:
            yield session
        transaction.rollback()
    engine.dispose()
