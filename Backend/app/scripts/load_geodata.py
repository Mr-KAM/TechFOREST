"""
Script de chargement initial des données GeoJSON en base de données.
Usage: python -m app.scripts.load_geodata
"""

import json
import os
import sys

# Ajouter le dossier parent au path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import create_engine
from shapely.geometry import shape
from geoalchemy2.shape import from_shape

from app.config import get_settings
from app.database import Base, ensure_postgis
from app.models import User, ForestZone, GEELayer

settings = get_settings()

# Utiliser la connexion directe (pas le pooler) pour le chargement
_db_url = settings.DIRECT_URL or settings.DATABASE_URL
_engine = create_engine(_db_url, pool_pre_ping=True)

from sqlalchemy.orm import sessionmaker
_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def load_forest_zones(geojson_path: str):
    """Charge les zones de forêt depuis un fichier GeoJSON."""
    db = _SessionLocal()
    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        features = data.get("features", [])
        loaded = 0

        for feature in features:
            props = feature.get("properties", {})
            geom_json = feature.get("geometry")

            name = props.get("Nom") or props.get("Name") or props.get("name") or "Sans nom"
            code = props.get("Layer") or props.get("id") or f"zone_{loaded + 1}"
            area_ha = props.get("area_ha")

            # Vérifier si la zone existe déjà
            existing = db.query(ForestZone).filter(ForestZone.code == code).first()
            if existing:
                print(f"  [SKIP] Zone '{name}' (code: {code}) existe déjà")
                continue

            # Convertir la géométrie
            geom = shape(geom_json)
            zone = ForestZone(
                name=name,
                code=code,
                description=f"Forêt {name} - importée depuis {os.path.basename(geojson_path)}",
                area_ha=area_ha,
                geometry=from_shape(geom, srid=4326),
            )
            db.add(zone)
            loaded += 1
            print(f"  [OK] Zone '{name}' ({area_ha} ha) chargée")

        db.commit()
        print(f"\n  Total: {loaded} zone(s) chargée(s) depuis {os.path.basename(geojson_path)}")

    except Exception as e:
        db.rollback()
        print(f"  [ERREUR] {e}")
        raise
    finally:
        db.close()


def _ensure_user(db, *, email: str, password: str, full_name: str, role: str):
    """Crée un utilisateur s'il n'existe pas (par email).

    Ne fait RIEN si email ou password sont vides: aucun compte
    par défaut n'est créé silencieusement.
    """
    from app.security import hash_password, ALLOWED_ROLES, ROLE_VIEWER

    email = (email or "").strip().lower()
    if not email or not password:
        print(f"  [SKIP] Compte '{role}' non configuré (variables d'env absentes)")
        return

    role = role if role in ALLOWED_ROLES else ROLE_VIEWER

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        print(f"  [SKIP] Compte {role} existant : {existing.email}")
        return

    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    print(f"  [OK] Compte {role} créé : {email}")
    print("  ⚠️  Pensez à changer ce mot de passe immédiatement.")


def create_admin_user():
    """Crée les comptes superadmin, admin et utilisateur classique par défaut.

    Les identifiants sont lus depuis le fichier .env (DEFAULT_*).
    """
    from app.security import ROLE_SUPERADMIN, ROLE_ADMIN

    db = _SessionLocal()
    try:
        _ensure_user(
            db,
            email=settings.DEFAULT_SUPERADMIN_EMAIL,
            password=settings.DEFAULT_SUPERADMIN_PASSWORD,
            full_name=settings.DEFAULT_SUPERADMIN_FULLNAME,
            role=ROLE_SUPERADMIN,
        )
        _ensure_user(
            db,
            email=settings.DEFAULT_ADMIN_EMAIL,
            password=settings.DEFAULT_ADMIN_PASSWORD,
            full_name=settings.DEFAULT_ADMIN_FULLNAME,
            role=ROLE_ADMIN,
        )
        _ensure_user(
            db,
            email=settings.DEFAULT_USER_EMAIL,
            password=settings.DEFAULT_USER_PASSWORD,
            full_name=settings.DEFAULT_USER_FULLNAME,
            role=settings.DEFAULT_USER_ROLE,
        )
    except Exception as e:
        db.rollback()
        print(f"  [ERREUR] {e}")
    finally:
        db.close()


def main():
    print("=" * 50)
    print("TechFOREST - Chargement des données initiales")
    print("=" * 50)

    # Activer PostGIS + créer les tables
    print("\n[1/3] Activation PostGIS & création des tables...")
    with _engine.connect() as conn:
        ensure_postgis(conn)
    Base.metadata.create_all(bind=_engine)
    print("  [OK] PostGIS activé, tables créées")

    # Charger les zones de forêt
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
    forest_file = os.path.join(data_dir, "limite_des_forets.geojson")

    print(f"\n[2/3] Chargement des zones de forêt...")
    if os.path.exists(forest_file):
        load_forest_zones(forest_file)
    else:
        print(f"  [WARN] Fichier non trouvé : {forest_file}")

    # Créer l'admin par défaut
    print(f"\n[3/3] Vérification utilisateur admin...")
    create_admin_user()

    print("\n" + "=" * 50)
    print("Chargement terminé !")
    print("=" * 50)


if __name__ == "__main__":
    main()
