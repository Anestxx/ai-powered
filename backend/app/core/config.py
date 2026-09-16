from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str
    jwt_secret: str = Field(min_length=32)
    edge_api_key: str = Field(min_length=16)
    allowed_origins: list[str] = ["http://localhost:3000"]
    access_token_expire_minutes: int = Field(default=60, gt=0)
    traffic_outputs_dir: Path = Path(__file__).resolve().parents[3] / 'traffic-ai' / 'outputs'


@lru_cache
def get_settings():
    return Settings()
