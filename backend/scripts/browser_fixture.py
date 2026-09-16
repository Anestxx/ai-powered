"""Serve an isolated, disposable PostGIS database for browser integration checks."""
import argparse
import json
import os
from pathlib import Path
import secrets
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--credentials-file', required=True)
    args = parser.parse_args()
    from app.core.config import get_settings
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    base = make_url(get_settings().database_url)
    database = 'urban_browser_' + uuid4().hex[:12] + '_test'
    admin = create_engine(base.set(database='postgres'), isolation_level='AUTOCOMMIT')
    with admin.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{database}"'))
    os.environ['DATABASE_URL'] = base.set(database=database).render_as_string(hide_password=False)
    os.environ['ALLOWED_ORIGINS'] = '["http://localhost:3001"]'
    get_settings.cache_clear()
    from app.db.models import Base, User
    from app.db.session import get_engine
    engine = get_engine()
    from app.core.security import password_hasher
    from sqlalchemy.orm import Session
    import uvicorn
    credentials = Path(args.credentials_file)
    try:
        with engine.begin() as connection:
            connection.execute(text('CREATE EXTENSION IF NOT EXISTS postgis'))
            Base.metadata.create_all(connection)
        password = secrets.token_urlsafe(24)
        with Session(engine) as session:
            session.add(User(email='browser-check@example.test', password_hash=password_hasher.hash(password), role='admin'))
            session.commit()
        credentials.write_text(json.dumps({'email': 'browser-check@example.test', 'password': password}), encoding='utf-8')
        print('Isolated browser API ready on port 8017; no operational database records are used.', flush=True)
        uvicorn.run('app.main:app', host='127.0.0.1', port=8017, log_level='warning')
    finally:
        engine.dispose()
        credentials.unlink(missing_ok=True)
        assert database.startswith('urban_browser_') and database.endswith('_test')
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE "{database}" WITH (FORCE)'))
        admin.dispose()


if __name__ == '__main__':
    main()
