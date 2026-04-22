"""TechFOREST API – Point d'entrée principal."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routes import auth, carto, kpi, media

settings = get_settings()

logging.basicConfig(level=logging.INFO if not settings.DEBUG else logging.DEBUG)
logger = logging.getLogger(__name__)

# ─── Création des tables (PostGIS + tables) ───────────────────
# En production, utiliser Alembic pour les migrations.
init_db()

# ─── Application FastAPI ──────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "API backend pour l'application SIG TechFOREST. "
        "Gère l'authentification, l'exposition de données Google Earth Engine "
        "découpées par zones de forêt, et les indicateurs KPI via KoboToolbox."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(carto.router)
app.include_router(kpi.router)
app.include_router(media.router)


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "app": settings.APP_NAME, "version": "0.1.0"}


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}
