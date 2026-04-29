# TechFOREST

Plateforme de suivi forestier combinant cartographie web, analyses Google Earth Engine et indicateurs de terrain KoboToolbox.

## Contenu du depot

- Backend FastAPI pour auth, cartographie, KPI Kobo et medias
- Frontend React/Vite pour l'interface carto et dashboards
- Donnees GeoJSON et scripts de chargement initial

## Fonctionnalites principales

### Backend

- Authentification JWT
- Gestion de zones forestieres (PostgreSQL/PostGIS)
- Analyse raster Google Earth Engine par zone
- KPI KoboToolbox via pykobo
- Acces specifique aux formulaires Kobo par UID ou par cle metier
- Service de medias video

### Frontend

- React 19 + TypeScript + Vite
- Dashboard cartographique Leaflet
- Dashboard KPI Recharts
- UI Tailwind v4 + composants UI

## Stack technique

### Backend

- Python
- FastAPI
- SQLAlchemy + Alembic
- PostgreSQL/PostGIS
- Google Earth Engine
- pykobo

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- Leaflet
- Recharts

## Architecture

```text
TechFOREST/
|- Backend/
|  |- app/
|  |  |- routes/              # auth, carto, kpi, media
|  |  |- services/            # gee_service, kobo_service
|  |  |- models/
|  |  |- schemas/
|  |  `- scripts/
|  |- data/
|  |- tests/
|  `- readme_backend.md
|- Frontend/
|  |- src/
|  `- readme_frontend.md
`- Readme.md
```

## Prerequis

- Python 3.11+
- Node.js 20+
- npm
- PostgreSQL/PostGIS (ou Supabase compatible)
- Credentials Google Earth Engine
- Token KoboToolbox

## Demarrage rapide

### 1. Backend

```bash
cd Backend
python -m venv venv
# Windows
venv\Scripts\Activate.ps1
# Linux/macOS
# source venv/bin/activate

pip install -r requirements.txt
```

Configurer Backend/.env avec les variables requises, notamment :

- DATABASE_URL
- DIRECT_URL
- SECRET_KEY
- GEE_CREDENTIALS_FILE
- GEE_PROJECT_ID
- URL_KOBO
- KOBO_API_TOKEN
- API_VERSION
- UID_MONITORING_FAUNE
- UID_MONITORING_REBOISEMENT
- UID_PLANTING_ARBRE
- UID_MENACES

Initialisation et lancement :

```bash
alembic upgrade head
python -m app.scripts.load_geodata
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Documentation API :

- http://localhost:8000/docs
- http://localhost:8000/redoc

Compte admin par defaut cree par le script de chargement :

- Email : techforestadmin@gmail.com
- Mot de passe : admin123

### 2. Frontend

```bash
cd Frontend
npm install
npm run dev
```

Le frontend demarre generalement sur http://localhost:5173 et proxy /api vers le backend local.

## Endpoints backend

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

Le parametre {form_uid} accepte :

- un UID Kobo brut
- une cle metier configuree dans .env : menaces, monitoring_faune, monitoring_reboisement, planting_arbre

### Medias

- GET /api/media/videos
- GET /api/media/videos/{video_key}

## Tests

Depuis Backend :

```bash
pytest tests/ -v
```

Test KPI cible :

```bash
pytest tests/test_kpi.py -q
```

## Documentation complementaire

- [Backend/readme_backend.md](Backend/readme_backend.md)
- [Frontend/readme_frontend.md](Frontend/readme_frontend.md)
- [Backend/.env.example](Backend/.env.example)
