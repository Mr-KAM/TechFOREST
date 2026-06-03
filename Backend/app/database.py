from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()

# Supabase pgBouncer (transaction mode) et autres poolers externes gerent
# eux-memes les connexions : SQLAlchemy doit utiliser NullPool pour eviter
# un double-pooling qui epuise les slots disponibles.
# Connexion directe (Docker Compose, dev local) : pool configure normalement.
# SQLite (tests) : StaticPool en memoire, pas de pool configure.
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
elif settings.DB_USE_NULL_POOL:
    engine = create_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
        echo=False,
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE,
        echo=False,
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def run_migrations() -> None:
    """Applique toutes les migrations Alembic en attente au démarrage.

    - PostgreSQL : exécute `alembic upgrade head` via l'API programmatique
      en utilisant DIRECT_URL (connexion directe, pas le pooler pgBouncer).
    - SQLite (tests) : utilise create_all() car Alembic + PostGIS ne fonctionne
      pas sur SQLite.
    """
    import logging
    import os
    from pathlib import Path

    logger = logging.getLogger(__name__)

    if _is_sqlite:
        # Mode test : création directe des tables sans Alembic
        Base.metadata.create_all(bind=engine)
        logger.info("DB (SQLite) : tables créées via create_all")
        return

    try:
        from alembic.config import Config
        from alembic import command as alembic_command

        # Chemin absolu vers alembic.ini (Backend/alembic.ini)
        ini_path = Path(__file__).resolve().parent.parent / "alembic.ini"
        alembic_cfg = Config(str(ini_path))

        # Forcer le chemin du dossier alembic (robuste peu importe le CWD)
        scripts_dir = Path(__file__).resolve().parent.parent / "alembic"
        alembic_cfg.set_main_option("script_location", str(scripts_dir))

        # Utiliser DIRECT_URL pour les migrations (jamais le pooler)
        migration_url = settings.DIRECT_URL or settings.DATABASE_URL
        alembic_cfg.set_main_option("sqlalchemy.url", migration_url)

        logger.info("Alembic : application des migrations en attente…")
        alembic_command.upgrade(alembic_cfg, "head")
        logger.info("Alembic : base de données à jour.")
    except Exception as exc:
        # On logue l'erreur mais on ne bloque pas le démarrage si les tables
        # existent déjà (cas d'une DB déjà migrée manuellement).
        logger.error("Alembic : échec des migrations automatiques : %s", exc, exc_info=True)
        raise


def get_db():
    """Dependency: yields a SQLAlchemy session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
