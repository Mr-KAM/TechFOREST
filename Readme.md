# TechFOREST

Plateforme de suivi forestier combinant cartographie web, analyses Google Earth Engine et indicateurs de terrain KoboToolbox.

## Contenu du depot

- **Backend** : API FastAPI (auth JWT, cartographie GEE, KPI Kobo, medias)
- **Frontend** : SPA React/Vite (dashboard carto, KPI)
- **Frontend_php** : application Laravel 11 (gestion parcelles, faune, menaces, imports Kobo, page carte branchee sur l'API FastAPI)
- **Donnees GeoJSON** + scripts de chargement initial

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
|- Backend/                   # API FastAPI (port 8000)
|  |- app/
|  |  |- routes/              # auth, carto, kpi, media
|  |  |- services/            # gee_service, kobo_service
|  |  |- models/ schemas/ scripts/
|  |- alembic/                # migrations PostGIS
|  |- data/
|  `- tests/
|- Frontend/                  # SPA React + Vite (port 5173)
|  `- src/
|- Frontend_php/              # App Laravel 11 (port 8080) + Vite (5174)
|  |- app/
|  |  |- Console/Commands/    # kobo:import-planting, monitoring, faune, menaces
|  |  |- Http/Controllers/    # CartoController (proxy FastAPI), Parcelle, Menace...
|  |  |- Services/            # KoboService, ImportKoboService, TechForestApiService
|  |  `- Models/
|  |- database/migrations/    # tables locales (parcelles, faune, menaces, ...)
|  `- resources/views/        # vues Blade (dashboard, carte, gestion)
|- docker/postgres-init/      # init Postgres (cree la DB Laravel + active PostGIS)
|- Dockerfile                 # image FastAPI + React
|- docker-compose.yml         # orchestration db + app + php
`- Readme.md
```

## Prerequis

- Python 3.11+
- Node.js 20+
- npm
- Docker Desktop (pour le lancement en conteneur)
- PostgreSQL/PostGIS (ou Supabase compatible)
- Credentials Google Earth Engine
- Token KoboToolbox

## Demarrage rapide

### Option recommandee : Docker Compose (3 services)

Une seule commande lance tout le projet :

- `db`  : Postgres + PostGIS (port 5432) — heberge **2 bases** : `techforest_db` (FastAPI) et `techforest_app` (Laravel)
- `app` : FastAPI (8000) + Frontend React/Vite (5173), migrations Alembic au boot
- `php` : Laravel 11 (8080) + Vite Laravel (5174), migrations Artisan au boot

Prerequis : Docker Desktop et un fichier `Backend/.env` valide (cf. `Backend/.env.example`).

Depuis la racine du projet :

```bash
docker compose up --build -d
```

Verifier l'etat :

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f php
```

#### Initialisation des donnees

1. **GeoJSON + comptes par defaut FastAPI** (zones de foret, superadmin, admin) :

   ```bash
   docker compose exec app python -m app.scripts.load_geodata
   ```

2. **Imports KoboToolbox vers Postgres (cote Laravel)** — a faire dans cet ordre :

   ```bash
   docker compose exec php php artisan kobo:import-planting
   docker compose exec php php artisan kobo:import-monitoring
   docker compose exec php php artisan kobo:import-faune
   docker compose exec php php artisan kobo:import-menaces
   ```

   Ou tout d'un coup :

   ```bash
   docker compose exec php sh -c "php artisan kobo:import-planting && php artisan kobo:import-monitoring && php artisan kobo:import-faune && php artisan kobo:import-menaces"
   ```

#### Acces

| Service             | URL                                |
|---------------------|------------------------------------|
| Frontend React      | http://localhost:5173              |
| API FastAPI         | http://localhost:8000              |
| Swagger             | http://localhost:8000/docs         |
| **Frontend Laravel**| **http://localhost:8080**          |
| Page carte Laravel  | http://localhost:8080/carte        |
| Postgres            | localhost:5432 (techforest/techforest) |

Arreter la stack :

```bash
docker compose down       # conserve les donnees
docker compose down -v    # supprime aussi le volume Postgres (reset complet)
```

#### Variables d'environnement

- `Backend/.env` : variables FastAPI (DB, JWT, GEE, Kobo). Pas d'espaces autour des `=`, sinon Docker Compose ignore la ligne et l'API renvoie 0 soumission Kobo.
- `Frontend_php/.env` : variables Laravel. Les valeurs DB et `TECHFOREST_API_URL` sont surchargees par `docker-compose.yml` pour pointer sur le reseau interne (`db`, `app`).
- Pour appeler la page `/carte`, definir aussi dans `Frontend_php/.env` :

  ```env
  TECHFOREST_API_EMAIL=ton.compte@techforest.ci
  TECHFOREST_API_PASSWORD=motdepasse
  ```

  Ce compte doit exister dans la base FastAPI (cree par `load_geodata` ou via `/api/auth/register`).

### Option alternative : Docker simple (DB externe requise)

Le Dockerfile seul ne contient PAS de base de donnees. Il faut donc fournir une `DATABASE_URL` accessible (Supabase, Postgres distant, ou Postgres local sur l'hote).

Construire l'image :

```bash
docker build -t techforest-app .
```

Lancer en pointant vers une base existante (exemple Supabase, .env deja configure) :

```bash
docker run --rm -p 8000:8000 -p 5173:5173 --env-file Backend/.env techforest-app
```

Si la base tourne sur la machine hote (Windows/Mac), utilisez `host.docker.internal` dans `DATABASE_URL`, par exemple :

```env
DATABASE_URL=postgresql://user:password@host.docker.internal:5432/techforest_db
```

Important : `localhost` a l'interieur du conteneur ne pointe PAS vers votre machine. Sans `--env-file` valide ou DB joignable, vous obtiendrez `psycopg2.OperationalError: connection to server at "localhost" port 5432 failed`.

Arreter l'application :

```bash
Ctrl+C
```

Remarque : en mode Docker, Vite ecoute sur 0.0.0.0 et le proxy frontend redirige /api vers le backend du conteneur.

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

Comptes par defaut crees par le script de chargement :

- Superadmin : superadmin@techforest.com / superadmin123
- Admin : techforestadmin@gmail.com / admin123

A changer imperativement en production.

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

- POST /api/auth/register (rejette les roles privilegies admin / superadmin)
- POST /api/auth/login
- GET /api/auth/me
- PUT /api/auth/me

### Administration utilisateurs (superadmin uniquement)

- GET /api/auth/users
- POST /api/auth/users
- PUT /api/auth/users/{user_id}
- DELETE /api/auth/users/{user_id}

Roles supportes : `superadmin`, `admin`, `editor`, `viewer`. Le superadmin a acces a toutes les routes protegees par roles ; il ne peut ni se rétrograder, ni se desactiver, ni se supprimer lui-meme.

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
