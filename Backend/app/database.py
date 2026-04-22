from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def ensure_postgis(connection):
    """Active l'extension PostGIS si elle n'existe pas."""
    connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    connection.commit()


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
