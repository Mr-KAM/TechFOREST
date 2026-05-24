# syntax=docker/dockerfile:1.7
# =============================================================================
# TechFOREST - Image de production multi-stage
# - Stage 1 (frontend-builder) : build statique Vite/React
# - Stage 2 (backend)          : runtime FastAPI servant l'API + les assets
# - Migrations Alembic         : executees via une commande dediee (voir
#                                docker-compose.yml service `migrate`)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 : Build du frontend React/Vite
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Cache des dependances (npm ci sur package*.json uniquement)
COPY Frontend/package.json Frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Sources et build de production
COPY Frontend/ ./
RUN npm run build


# -----------------------------------------------------------------------------
# Stage 2 : Runtime backend FastAPI (sert aussi /assets statiques)
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Dependances systeme pour psycopg2 / GeoAlchemy2 / Shapely + curl (healthcheck)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq5 \
        libgeos-c1v5 \
        libproj25 \
        curl \
    && apt-get install -y --no-install-recommends --mark-auto \
        gcc \
        libpq-dev \
        libgeos-dev \
        libproj-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installer d'abord les deps Python (couche cachee)
COPY Backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt \
    && apt-get purge -y --auto-remove gcc libpq-dev libgeos-dev libproj-dev

# Code applicatif (les secrets et .env NE sont PAS copies; voir .dockerignore)
COPY Backend/app ./app
COPY Backend/alembic ./alembic
COPY Backend/alembic.ini ./alembic.ini
COPY Backend/data ./data

# Frontend deja build, depose dans un repertoire statique servi par FastAPI
COPY --from=frontend-builder /frontend/dist ./static

# Utilisateur non-root
RUN groupadd --system --gid 1000 app \
    && useradd  --system --uid 1000 --gid app --home /app --shell /usr/sbin/nologin app \
    && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl --fail --silent --show-error http://127.0.0.1:8000/health || exit 1

# Pas de migration ici : on lance UNIQUEMENT l'API. Les migrations sont
# executees par un job dedie (voir docker-compose.yml).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
