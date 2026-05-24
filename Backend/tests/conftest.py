"""Configuration pytest pour les tests du backend TechFOREST."""

import os
import sys
import pytest
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool, Text as SAText
from sqlalchemy.orm import sessionmaker

# ── Patch les settings AVANT d'importer quoi que ce soit de l'app ──
os.environ.update({
    "DATABASE_URL": "sqlite:///:memory:",
    "DIRECT_URL": "",
    "SECRET_KEY": "test-secret-key-for-unit-tests-please-use-32-plus-chars",
    "ALGORITHM": "HS256",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "GEE_CREDENTIALS_FILE": "fake-creds.json",
    "GEE_PROJECT_ID": "test-project",
    "DATA_DIR": os.path.join(os.path.dirname(__file__), "fixtures"),
    "URL_KOBO": "https://kf.kobotoolbox.org/",
    "KOBO_API_TOKEN": "fake-token",
    "API_VERSION": "2",
    "UID_MONITORING_FAUNE": "configured-faune-uid",
    "UID_MONITORING_REBOISEMENT": "configured-reboisement-uid",
    "UID_PLANTING_ARBRE": "configured-planting-uid",
    "UID_MENACES": "configured-menaces-uid",
    "CORS_ORIGINS": "http://localhost:3000",
    "DEBUG": "false",
})

# ── Patch init_db pour éviter le CREATE EXTENSION postgis sur SQLite ──
import app.database as _db_module

def _noop_init_db():
    pass

_db_module.init_db = _noop_init_db

# Maintenant on peut importer l'app (init_db est patchée)
from app.database import Base, get_db
from app.main import app
from app.security import hash_password, create_access_token
from app.models.user import User
from app.models.forest import ForestZone, GEELayer

# ── Remplacer la colonne Geometry PostGIS par du Text pour SQLite ──
ForestZone.__table__.c.geometry.type = SAText()

# ── Engine SQLite in-memory ──
TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


# ── Fixtures ──

@pytest.fixture(autouse=True)
def setup_database():
    """Crée et détruit les tables avant/après chaque test."""
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture()
def db():
    """Session DB pour les tests."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    """Client HTTP de test FastAPI."""
    return TestClient(app)


@pytest.fixture()
def test_user(db):
    """Crée un utilisateur de test en base."""
    user = User(
        email="test@example.com",
        full_name="Test User",
        hashed_password=hash_password("password123"),
        role="viewer",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def admin_user(db):
    """Crée un admin de test en base."""
    user = User(
        email="admin@example.com",
        full_name="Admin User",
        hashed_password=hash_password("adminpass"),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def inactive_user(db):
    """Crée un utilisateur désactivé."""
    user = User(
        email="inactive@example.com",
        full_name="Inactive User",
        hashed_password=hash_password("password123"),
        role="viewer",
        is_active=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def auth_headers(test_user):
    """Headers HTTP avec un JWT valide."""
    token = create_access_token(data={"sub": str(test_user.id), "role": test_user.role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_headers(admin_user):
    """Headers HTTP avec un JWT admin."""
    token = create_access_token(data={"sub": str(admin_user.id), "role": admin_user.role})
    return {"Authorization": f"Bearer {token}"}
