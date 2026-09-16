import argparse
from getpass import getpass
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.security import password_hasher
from app.db.models import User
from app.db.session import get_engine


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    args = parser.parse_args()
    password = getpass("Admin password (at least 12 characters): ")
    if len(password) < 12 or password != getpass("Confirm password: "):
        raise SystemExit("Password too short or confirmation does not match")
    with Session(get_engine()) as db:
        email = args.email.lower().strip()
        if db.scalar(select(User).where(User.email == email)):
            raise SystemExit("User already exists")
        db.add(User(email=email, password_hash=password_hasher.hash(password), role="admin"))
        db.commit()
    print("Admin created")


if __name__ == "__main__":
    main()
