# TechFOREST – Backend API

API FastAPI Python pour l'application SIG TechFOREST.

## Architecture

```
Backend/
├── app/
│   ├── main.py            # Point d'entrée FastAPI
│   ├── config.py           # Configuration (pydantic-settings + .env)
│   ├── database.py         # SQLAlchemy engine & session
│   ├── security.py         # JWT, hachage de mots de passe
│   ├── models/
│   │   ├── user.py         # Modèle utilisateur
│   │   └── forest.py       # ForestZone, GEELayer (PostGIS)
│   ├── schemas/
│   │   ├── auth.py         # Pydantic : auth, user
│   │   ├── forest.py       # Pydantic : zones, couches GEE
│   │   └── kpi.py          # Pydantic : KoboToolbox KPIs
│   ├── routes/
│   │   ├── auth.py         # /api/auth/*  (register, login, me)
│   │   ├── carto.py        # /api/carto/* (zones, GEE clip)
│   │   └── kpi.py          # /api/kpi/*   (KoboToolbox)
│   └── services/
│       ├── gee_service.py  # Google Earth Engine (NDVI, perte, gain, couvert)
│       └── kobo_service.py # Client KoboToolbox API
├── alembic/                # Migrations de base de données
├── requirements.txt
├── alembic.ini
└── .env.example
```

## Prérequis

- Python 3.11+
- PostgreSQL + PostGIS
- Compte de service Google Earth Engine
- Token API KoboToolbox

## Installation

```bash
cd Backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/macOS

pip install -r requirements.txt

# Copier et configurer le fichier d'environnement
cp .env.example .env
# Éditer .env avec vos paramètres
```

## Lancement

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Documentation interactive : http://localhost:8000/docs

## Endpoints principaux

| Section          | Méthode | Route                              | Description                              |
|------------------|---------|------------------------------------|------------------------------------------|
| **Auth**         | POST    | `/api/auth/register`               | Créer un compte                          |
|                  | POST    | `/api/auth/login`                  | Connexion (JWT)                          |
|                  | GET     | `/api/auth/me`                     | Profil utilisateur                       |
| **Cartographie** | GET     | `/api/carto/zones`                 | Lister les zones de forêt                |
|                  | POST    | `/api/carto/zones`                 | Créer une zone (GeoJSON)                 |
|                  | POST    | `/api/carto/gee/clip`              | Découper couche GEE par zone             |
| **KPI**          | GET     | `/api/kpi/forms`                   | Lister formulaires KoboToolbox           |
|                  | GET     | `/api/kpi/forms/{uid}/submissions` | Soumissions d'un formulaire              |
|                  | GET     | `/api/kpi/forms/{uid}/dashboard`   | Tableau de bord KPI auto-calculé         |

## Couches GEE disponibles

- `tree_cover` : Couverture forestière (Hansen 2023)
- `forest_loss` : Perte de forêt par année
- `forest_gain` : Gain de forêt
- `ndvi` : NDVI Sentinel-2 (composite médian)