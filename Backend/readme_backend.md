# TechFOREST – Backend API

API FastAPI Python pour l'application SIG TechFOREST.

## Architecture

```
Backend/
├── app/
│   ├── main.py              # Point d'entrée FastAPI
│   ├── config.py            # Configuration (pydantic-settings + .env)
│   ├── database.py          # SQLAlchemy engine, session, PostGIS
│   ├── security.py          # JWT, hachage bcrypt
│   ├── models/
│   │   ├── __init__.py      # Export des modèles
│   │   ├── user.py          # Modèle User
│   │   └── forest.py        # ForestZone (PostGIS), GEELayer
│   ├── schemas/
│   │   ├── auth.py          # Pydantic : auth, user
│   │   ├── forest.py        # Pydantic : zones, couches GEE
│   │   └── kpi.py           # Pydantic : KoboToolbox KPIs
│   ├── routes/
│   │   ├── auth.py          # /api/auth/*  (register, login, me)
│   │   ├── carto.py         # /api/carto/* (zones, GEE clip, GeoJSON)
│   │   └── kpi.py           # /api/kpi/*   (KoboToolbox)
│   ├── services/
│   │   ├── gee_service.py   # Google Earth Engine (NDVI, perte, gain, couvert)
│   │   └── kobo_service.py  # Client KoboToolbox API
│   └── scripts/
│       └── load_geodata.py  # Chargement initial GeoJSON + admin
├── alembic/
│   ├── env.py               # Config migrations (sync avec .env)
│   └── versions/
│       └── 001_initial.py   # Migration initiale (PostGIS + tables)
├── data/
│   ├── limite_des_forets.geojson
│   └── Limite_cote_d'ivoire.geojson
├── requirements.txt
├── alembic.ini
├── .env.example
└── .gitignore
```

## Prérequis

- Python 3.11+
- PostgreSQL + PostGIS (ou Supabase avec PostGIS activé)
- Credentials Google Earth Engine (OAuth2)
- Token API KoboToolbox

## Base de données

L'API utilise **Supabase** (PostgreSQL + PostGIS hébergé). Deux URLs sont configurées dans `.env` :

| Variable       | Usage                         | Port |
|----------------|-------------------------------|------|
| `DATABASE_URL` | Pooler (pgbouncer) pour l'app | 6543 |
| `DIRECT_URL`   | Connexion directe (migrations + scripts) | 5432 |

## Installation

```bash
cd Backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/macOS

pip install -r requirements.txt

# Copier et configurer le fichier d'environnement
cp .env.example .env
# Éditer .env avec vos paramètres (Supabase URLs, tokens, etc.)
```

## Initialisation de la base

```bash
# Appliquer les migrations (utilise DIRECT_URL)
alembic upgrade head

# Charger les zones de forêt + créer l'admin par défaut
python -m app.scripts.load_geodata
```

Données chargées :
- **Appouéba** – 3.9 ha (forêt suivie)
- **Zaranou** – 50.5 ha (forêt suivie)
- **Admin** – techforestadmin@gmail.com / admin123

## Lancement

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Documentation interactive :
- **Swagger UI** : http://localhost:8000/docs
- **ReDoc** : http://localhost:8000/redoc

## Endpoints

| Section          | Méthode | Route                              | Description                              |
|------------------|---------|------------------------------------|------------------------------------------|
| **Health**       | GET     | `/`                                | Status de l'API                          |
|                  | GET     | `/health`                          | Health check                             |
| **Auth**         | POST    | `/api/auth/register`               | Créer un compte                          |
|                  | POST    | `/api/auth/login`                  | Connexion (retourne JWT)                 |
|                  | GET     | `/api/auth/me`                     | Profil utilisateur connecté              |
|                  | PUT     | `/api/auth/me`                     | Modifier son profil                      |
| **Cartographie** | GET     | `/api/carto/zones`                 | Lister les zones de forêt                |
|                  | GET     | `/api/carto/zones/{id}`            | Détail d'une zone                        |
|                  | POST    | `/api/carto/zones`                 | Créer une zone (GeoJSON)                 |
|                  | POST    | `/api/carto/gee/clip`              | Découper couche GEE par zone             |
|                  | GET     | `/api/carto/gee/layers`            | Lister les couches GEE en base           |
|                  | GET     | `/api/carto/geojson/forets`        | GeoJSON brut des limites de forêts       |
|                  | GET     | `/api/carto/geojson/pays`          | GeoJSON brut limites Côte d'Ivoire       |
| **KPI**          | GET     | `/api/kpi/forms`                   | Lister formulaires KoboToolbox           |
|                  | GET     | `/api/kpi/forms/{uid}/submissions` | Soumissions d'un formulaire              |
|                  | GET     | `/api/kpi/forms/{uid}/dashboard`   | Tableau de bord KPI auto-calculé         |

## Couches GEE disponibles

| Type           | Description                                | Source                |
|----------------|--------------------------------------------|-----------------------|
| `tree_cover`   | Couverture forestière                      | Hansen 2023 v1.11     |
| `forest_loss`  | Perte de forêt par année                   | Hansen 2023 v1.11     |
| `forest_gain`  | Gain de forêt                              | Hansen 2023 v1.11     |
| `ndvi`         | NDVI composite médian                      | Sentinel-2 SR         |
| `land_cover`   | Occupation du sol (9 classes)              | Dynamic World V1      |
| `elevation`    | Altitude (MNT 30 m)                        | SRTM GL1              |
| `slope`        | Pente du terrain (degrés)                  | SRTM GL1 (dérivé)     |
| `hillshade`    | Ombrage du relief                          | SRTM GL1 (dérivé)     |

## Variables d'environnement

Voir `.env.example` pour la liste complète. Variables principales :

| Variable                  | Description                                    |
|---------------------------|------------------------------------------------|
| `DATABASE_URL`            | URL PostgreSQL (pooler Supabase)               |
| `DIRECT_URL`              | URL PostgreSQL directe (migrations)            |
| `SECRET_KEY`              | Clé secrète JWT                                |
| `GEE_PROJECT_ID`          | ID projet Google Earth Engine                  |
| `GEE_CREDENTIALS_FILE`    | Fichier credentials OAuth2 GEE                 |
| `KOBO_API_TOKEN`          | Token API KoboToolbox                          |
| `CORS_ORIGINS`            | Origines autorisées (séparées par virgules)     |