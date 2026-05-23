# TechFOREST - Backend API

API FastAPI du projet TechFOREST pour l'authentification, la cartographie, les analyses Google Earth Engine, les KPI KoboToolbox et les medias.

## Architecture

```text
Backend/
|- app/
|  |- main.py                # Point d'entree FastAPI
|  |- config.py              # Settings pydantic via .env
|  |- database.py            # SQLAlchemy + PostGIS
|  |- security.py            # JWT + hash password
|  |- models/                # SQLAlchemy models
|  |- schemas/               # Schemas Pydantic
|  |- routes/
|  |  |- auth.py             # /api/auth/*
|  |  |- carto.py            # /api/carto/*
|  |  |- kpi.py              # /api/kpi/*
|  |  `- media.py            # /api/media/*
|  |- services/
|  |  |- gee_service.py      # Handlers GEE
|  |  `- kobo_service.py     # Service pykobo
|  `- scripts/
|     `- load_geodata.py     # Import GeoJSON + admin
|- alembic/
|- data/
|- tests/
|- requirements.txt
`- readme_backend.md
```

## Prerequis

- Python 3.11+
- PostgreSQL avec PostGIS (ou Supabase PostgreSQL/PostGIS)
- Credentials Google Earth Engine valides
- Token KoboToolbox

## Installation

```bash
cd Backend
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/macOS
# source venv/bin/activate

pip install -r requirements.txt
```

## Configuration .env

Variables principales a renseigner :

| Variable | Description |
|---|---|
| DATABASE_URL | URL PostgreSQL utilisee par l'application |
| DIRECT_URL | URL PostgreSQL directe pour migrations/scripts |
| SECRET_KEY | Cle secrete JWT |
| ALGORITHM | Algo JWT (HS256) |
| ACCESS_TOKEN_EXPIRE_MINUTES | Duree de vie du token |
| GEE_CREDENTIALS_FILE | Fichier de credentials GEE |
| GEE_PROJECT_ID | Projet Google Earth Engine |
| DATA_DIR | Dossier data (GeoJSON + media) |
| URL_KOBO | URL KoboToolbox de base |
| KOBO_API_TOKEN | Token KoboToolbox |
| API_VERSION | Version API Kobo (2) |
| UID_MONITORING_FAUNE | UID formulaire Monitoring faune |
| UID_MONITORING_REBOISEMENT | UID formulaire Monitoring reboisement |
| UID_PLANTING_ARBRE | UID formulaire Planting arbre |
| UID_MENACES | UID formulaire Menaces |
| CORS_ORIGINS | Origines CORS separees par virgules |
| DEFAULT_SUPERADMIN_EMAIL / _PASSWORD / _FULLNAME | Compte superadmin cree au bootstrap |
| DEFAULT_ADMIN_EMAIL / _PASSWORD / _FULLNAME | Compte admin principal cree au bootstrap |
| DEFAULT_USER_EMAIL / _PASSWORD / _FULLNAME / _ROLE | Compte utilisateur classique (par defaut role `viewer`) |

## Initialisation de la base

```bash
alembic upgrade head
python -m app.scripts.load_geodata
```

Le script de chargement cree aussi 3 comptes par defaut (lus depuis `.env`) :

| Role | Email (defaut) | Mot de passe (defaut) |
|---|---|---|
| superadmin | superadmin@techforest.com | superadmin123 |
| admin | techforestadmin@gmail.com | admin123 |
| viewer | user@techforest.com | user123 |

⚠️  Surchargez ces valeurs via le `.env` et changez les mots de passe en production.

## Lancement

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Documentation API :

- Swagger : http://localhost:8000/docs
- ReDoc : http://localhost:8000/redoc

## Endpoints

### Health

- GET /
- GET /health

### Auth

- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- PUT /api/auth/me

### Cartographie

- GET /api/carto/zones
- GET /api/carto/zones/{zone_id}
- POST /api/carto/zones
- POST /api/carto/gee/clip
- GET /api/carto/gee/layers
- GET /api/carto/geojson/forets
- GET /api/carto/geojson/pays

### KPI / KoboToolbox

- GET /api/kpi/forms
- GET /api/kpi/forms/configured
- GET /api/kpi/dashboard
- GET /api/kpi/forms/{form_uid}/submissions
- GET /api/kpi/forms/{form_uid}/dashboard

Important : le parametre {form_uid} accepte soit l'UID Kobo brut, soit une cle metier configuree dans .env (menaces, monitoring_faune, monitoring_reboisement, planting_arbre).

### Medias

- GET /api/media/videos
- GET /api/media/videos/{video_key}

video_key supportes : drone, presentation

## Couches Google Earth Engine disponibles

- tree_cover
- forest_loss
- forest_gain
- ndvi
- land_cover
- elevation
- slope
- hillshade

## Notes implementation KPI

- Le backend utilise pykobo pour interroger KoboToolbox.
- pykobo est synchrone, donc les appels sont executes dans un thread pool via run_in_executor.
- Les dashboards KPI calculent automatiquement count/sum/mean pour les champs numeriques (ou un sous-ensemble via query param fields).

## Tests

Depuis Backend :

```bash
pytest tests/ -v
```

Test cible KPI :

```bash
pytest tests/test_kpi.py -q
```