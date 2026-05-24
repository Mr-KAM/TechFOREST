from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Charge Backend/.env (chemin absolu ancre sur ce fichier).
# override=False : les variables deja presentes dans l'environnement
# (Docker, CI, Dokploy, tests) ont la priorite.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE, override=False)

_PLACEHOLDER_SECRET_KEY = "change-me-to-a-random-secret-key-in-production"
_MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    # Database (pooler pour l'app, direct pour les migrations)
    DATABASE_URL: str = ""
    DIRECT_URL: str = ""

    # Pool SQLAlchemy — ignoré si DB_USE_NULL_POOL=true (ex. Supabase pgBouncer)
    # Mettre DB_USE_NULL_POOL=true quand DATABASE_URL pointe vers un pooler
    # externe (pgBouncer port 6543, Supabase transaction mode, PgBouncer AWS RDS).
    DB_USE_NULL_POOL: bool = True
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_RECYCLE: int = 1800  # secondes avant de recycler une connexion idle

    # JWT — REQUIRED. Aucune valeur par défaut: doit être fournie par l'environnement.
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Google Earth Engine (compte de service — fichier JSON jamais commité)
    GEE_CREDENTIALS_FILE: str = "gee-service-account-key.json"
    GEE_PROJECT_ID: str = ""

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
    DEBUG: bool = False

    # Comptes bootstrap OPTIONNELS — créés uniquement si email ET password
    # sont fournis par l'environnement. Aucune valeur par défaut sensible.
    DEFAULT_SUPERADMIN_EMAIL: str = ""
    DEFAULT_SUPERADMIN_PASSWORD: str = ""
    DEFAULT_SUPERADMIN_FULLNAME: str = "Super Administrateur TechFOREST"
    DEFAULT_ADMIN_EMAIL: str = ""
    DEFAULT_ADMIN_PASSWORD: str = ""
    DEFAULT_ADMIN_FULLNAME: str = "Administrateur TechFOREST"
    DEFAULT_USER_EMAIL: str = ""
    DEFAULT_USER_PASSWORD: str = ""
    DEFAULT_USER_FULLNAME: str = "Utilisateur TechFOREST"
    DEFAULT_USER_ROLE: str = "viewer"

    # Les variables sont deja chargees par load_dotenv() ci-dessus ;
    # pydantic-settings lit simplement os.environ.
    model_config = {"env_file_encoding": "utf-8"}

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
    _validate(settings)
    return settings


def _validate(settings: Settings) -> None:
    errors: list[str] = []

    if not settings.DATABASE_URL.strip():
        errors.append(
            "DATABASE_URL is required (e.g. postgresql://user:pass@host:5432/db). "
            "For Docker Compose use postgresql://techforest:${DB_PASSWORD}@db:5432/techforest_db."
        )

    secret = settings.SECRET_KEY.strip()
    if not secret:
        errors.append(
            "SECRET_KEY is required. Generate one with: "
            "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
    elif secret == _PLACEHOLDER_SECRET_KEY:
        errors.append(
            "SECRET_KEY is still the placeholder value. Generate a real one with "
            "`python -c \"import secrets; print(secrets.token_urlsafe(48))\"`."
        )
    elif len(secret) < _MIN_SECRET_KEY_LENGTH:
        errors.append(
            f"SECRET_KEY must be at least {_MIN_SECRET_KEY_LENGTH} characters "
            f"(got {len(secret)})."
        )

    if errors:
        raise RuntimeError(
            "Invalid TechFOREST configuration:\n  - " + "\n  - ".join(errors)
        )
