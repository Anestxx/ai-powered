from datetime import datetime, timedelta, timezone
from secrets import compare_digest
from uuid import UUID
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.db.models import User
from app.db.session import get_db

password_hasher = PasswordHasher()
bearer = HTTPBearer(auto_error=False)
edge_header = APIKeyHeader(name="X-Edge-Key", auto_error=False)


def verify_password(password, hashed):
    try:
        return password_hasher.verify(hashed, password)
    except VerificationError:
        return False


def create_token(user):
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user.id), "iat": now,
                       "exp": now + timedelta(minutes=settings.access_token_expire_minutes)},
                      settings.jwt_secret, algorithm="HS256")


def require_edge(key: str | None = Depends(edge_header)):
    if key is None or not compare_digest(key, get_settings().edge_api_key):
        raise HTTPException(401, "Invalid edge API key")


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)):
    try:
        if credentials is None:
            raise ValueError()
        payload = jwt.decode(credentials.credentials, get_settings().jwt_secret,
                             algorithms=["HS256"], options={"require": ["sub", "exp", "iat"]})
        user = db.get(User, UUID(payload["sub"]))
        if user is None or not user.is_active:
            raise ValueError()
        return user
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise HTTPException(401, "Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"})


def require_roles(*roles):
    def dependency(user: User = Depends(current_user)):
        if user.role not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return dependency
