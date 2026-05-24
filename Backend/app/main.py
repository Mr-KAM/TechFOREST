"""TechFOREST API – Point d'entrée principal."""

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.limiter import limiter
from app.routes import auth, carto, kpi, media

settings = get_settings()

logging.basicConfig(level=logging.INFO if not settings.DEBUG else logging.DEBUG)
logger = logging.getLogger(__name__)

# ─── Rate limiter (partagé entre tous les routers) ────────────────
# Importé depuis app.limiter pour éviter une double instanciation.

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

# Attacher le limiter et son handler 429 à l'app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ─── Handlers d'exceptions globaux ────────────────────────────
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Uniformise le format JSON de toutes les erreurs HTTP (404, 403, 401…)."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """422 Unprocessable Entity – retourne les erreurs de validation Pydantic."""
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Capture toute exception non gérée, log le détail en interne, renvoie
    un message générique au client (jamais de stack trace en production)."""
    logger.error(
        "Unhandled exception on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
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


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}


# ─── Frontend statique (build Vite) ────────────────────────────
# En production, l'image Docker copie le build dans /app/static.
# En dev local, ce repertoire peut ne pas exister : on ne monte rien.
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if _STATIC_DIR.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=_STATIC_DIR / "assets"),
        name="assets",
    )

    @app.get("/", include_in_schema=False)
    def _spa_root():
        return FileResponse(_STATIC_DIR / "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa_fallback(full_path: str):
        # Laisse passer les routes API connues; sinon renvoie l'index.html (SPA).
        candidate = _STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC_DIR / "index.html")
else:
    @app.get("/", tags=["Health"])
    def root():
        return {"status": "ok", "app": settings.APP_NAME, "version": "0.1.0"}
