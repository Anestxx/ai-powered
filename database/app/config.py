from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://urban_admin:urban_password@localhost:5432/urban_intelligence"
    secret_key: str = "development-only-secret"
    event_merge_radius_m: float = 15.0
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
