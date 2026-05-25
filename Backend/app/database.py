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


def ensure_postgis(connection):
    """Active l'extension PostGIS si elle n'existe pas."""
    from sqlalchemy.exc import NotSupportedError
    try:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        connection.commit()
    except NotSupportedError as e:
        raise SystemExit(
            "\n[ERREUR] PostGIS n'est pas installé sur ce serveur PostgreSQL.\n"
            "  → Supabase : activez PostGIS dans Database → Extensions.\n"
            "  → Docker   : utilisez l'image postgis/postgis:16-3.4.\n"
            "  → Bare-metal : apt-get install postgresql-XX-postgis-3\n"
            f"  Détail : {e}"
        ) from e


def init_db():
    """Crée les extensions et les tables. Appelé au démarrage."""
    with engine.connect() as conn:
        ensure_postgis(conn)
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency: yields a SQLAlchemy session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
