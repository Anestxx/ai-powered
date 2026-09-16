"""Run backend tests, optionally creating a dedicated, non-production PostGIS DB."""

import argparse
import os
from pathlib import Path
import subprocess
import sys

BACKEND = Path(__file__).resolve().parents[1] / "backend"
TEST_DATABASE = "urban_ai_connection_test"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--integration", action="store_true")
    args = parser.parse_args()
    environment = os.environ.copy()
    if args.integration:
        os.chdir(BACKEND)
        sys.path.insert(0, str(BACKEND))
        from app.core.config import get_settings
        from sqlalchemy import create_engine, text
        from sqlalchemy.engine import make_url

        connection_url = make_url(get_settings().database_url)
        engine = create_engine(connection_url.set(database="postgres"), isolation_level="AUTOCOMMIT",
                               connect_args={"connect_timeout": 5})
        try:
            with engine.connect() as connection:
                exists = connection.scalar(text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": TEST_DATABASE})
                if not exists:
                    # Identifier is an internal constant, never caller-supplied SQL.
                    connection.execute(text('CREATE DATABASE "urban_ai_connection_test"'))
        finally:
            engine.dispose()
        environment["TEST_DATABASE_URL"] = connection_url.set(database=TEST_DATABASE).render_as_string(hide_password=False)
        print(f"Integration tests use {TEST_DATABASE}; fixtures roll back test records.", flush=True)
    else:
        environment.pop("TEST_DATABASE_URL", None)
        print("Unit tests only; use project.cmd test -Integration for the PostGIS checks.", flush=True)
    return subprocess.run([sys.executable, "-m", "pytest", "tests", "-q"], cwd=BACKEND, env=environment).returncode


if __name__ == "__main__":
    raise SystemExit(main())
