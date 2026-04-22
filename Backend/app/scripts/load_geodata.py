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


def create_admin_user():
    """Crée un utilisateur admin par défaut si aucun n'existe."""
    from app.security import hash_password

    db = _SessionLocal()
    try:
        existing = db.query(User).filter(User.role == "admin").first()
        if existing:
            print(f"  [SKIP] Admin existant : {existing.email}")
            return

        admin = User(
            email="techforestadmin@gmail.com",
            full_name="Administrateur TechFOREST",
            hashed_password=hash_password("admin123"),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print("  [OK] Admin créé : techforestadmin@gmail.com / admin123")
        print("  ⚠️  Changez ce mot de passe en production !")

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
