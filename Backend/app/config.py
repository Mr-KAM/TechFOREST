from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database (pooler pour l'app, direct pour les migrations)
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/techforest_db"
    DIRECT_URL: str = ""

    # JWT
    SECRET_KEY: str = "change-me-to-a-random-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Google Earth Engine (OAuth2 installed app credentials)
    GEE_CREDENTIALS_FILE: str = "gee-service-account-key.json"
    GEE_PROJECT_ID: str = "nodal-almanac-491321-r8"

    # Dossier des données GeoJSON
    DATA_DIR: str = "data"

    # KoboToolbox (pykobo)
    URL_KOBO: str = "https://kf.kobotoolbox.org/"
    KOBO_API_TOKEN: str = ""
    API_VERSION: int = 2

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # App
    APP_NAME: str = "TechFOREST API"
    DEBUG: bool = True

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
