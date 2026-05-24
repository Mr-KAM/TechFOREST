from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database (pooler pour l'app, direct pour les migrations)
    DATABASE_URL: str = ""
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
    UID_MONITORING_FAUNE: str = ""
    UID_MONITORING_REBOISEMENT: str = ""
    UID_PLANTING_ARBRE: str = ""
    UID_MENACES: str = ""

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # App
    APP_NAME: str = "TechFOREST API"
    DEBUG: bool = True

    # Comptes par défaut créés au bootstrap (script load_geodata)
    # Superadministrateur
    DEFAULT_SUPERADMIN_EMAIL: str = "superadmin@techforest.com"
    DEFAULT_SUPERADMIN_PASSWORD: str = "superadmin123"
    DEFAULT_SUPERADMIN_FULLNAME: str = "Super Administrateur TechFOREST"
    # Administrateur principal
    DEFAULT_ADMIN_EMAIL: str = "techforestadmin@gmail.com"
    DEFAULT_ADMIN_PASSWORD: str = "admin123"
    DEFAULT_ADMIN_FULLNAME: str = "Administrateur TechFOREST"
    # Utilisateur classique (viewer) du compte principal
    DEFAULT_USER_EMAIL: str = "user@techforest.com"
    DEFAULT_USER_PASSWORD: str = "user123"
    DEFAULT_USER_FULLNAME: str = "Utilisateur TechFOREST"
    DEFAULT_USER_ROLE: str = "viewer"

    model_config = {"env_file": ("Backend/.env", ".env"), "env_file_encoding": "utf-8"}

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def kobo_form_uids(self) -> dict[str, str]:
        return {
            "monitoring_faune": self.UID_MONITORING_FAUNE.strip(),
            "monitoring_reboisement": self.UID_MONITORING_REBOISEMENT.strip(),
            "planting_arbre": self.UID_PLANTING_ARBRE.strip(),
            "menaces": self.UID_MENACES.strip(),
        }


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    if not settings.DATABASE_URL.strip():
        raise RuntimeError(
            "DATABASE_URL is required. Set it in the environment or in Backend/.env/.env. "
            "For Docker Compose use postgresql://techforest:techforest@db:5432/techforest_db. "
            "For Dokploy, define DATABASE_URL and DIRECT_URL in the app service environment."
        )
    return settings
