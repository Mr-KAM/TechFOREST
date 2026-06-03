"""TechFOREST API – Point d'entrée principal."""

import logging
from contextlib import asynccontextmanager
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
from app.database import run_migrations
from app.limiter import limiter
from app.routes import auth, carto, ecogardes, kpi, media

settings = get_settings()

logging.basicConfig(level=logging.INFO if not settings.DEBUG else logging.DEBUG)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Applique les migrations Alembic au démarrage puis cède le contrôle."""
    run_migrations()
    yield


# ─── Application FastAPI ──────────────────────────────────────
app = FastAPI(
    lifespan=lifespan,
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

# ─── Rate limiter ─────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ─── Handlers d'exceptions globaux ────────────────────────────
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


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
app.include_router(ecogardes.router)


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}


# ─── Uploads (photos écogardes, etc.) ────────────────────────────
_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_UPLOADS_DIR), name="uploads")

# ─── Frontend statique (build Vite) ────────────────────────────
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
        candidate = _STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC_DIR / "index.html")
else:
    @app.get("/", tags=["Health"])
    def root():
        return {"status": "ok", "app": settings.APP_NAME, "version": "0.1.0"}
