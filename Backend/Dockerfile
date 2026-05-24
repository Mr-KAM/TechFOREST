# syntax=docker/dockerfile:1.7
# =============================================================================
# TechFOREST – Backend uniquement (déploiement indépendant)
# Contexte de build : Backend/
#   docker build -t techforest-backend .
#   docker run --env-file .env -p 8000:8000 techforest-backend
# =============================================================================

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Dépendances système : psycopg2, GeoAlchemy2/Shapely, curl (healthcheck)
# Les paquets de build (gcc, libpq-dev, libgeos-dev, libproj-dev) sont
# installés puis supprimés après pip install pour réduire la taille de l'image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq5 \
        libgeos-c1v5 \
        libproj25 \
        curl \
    && apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
        libgeos-dev \
        libproj-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dépendances Python (couche cachée) --------------------------------
COPY requirements.txt ./
RUN pip install -r requirements.txt \
    && apt-get purge -y --auto-remove gcc libpq-dev libgeos-dev libproj-dev \
    && rm -rf /var/lib/apt/lists/*

# --- Code applicatif ---------------------------------------------------
# Les secrets (.env, clés GEE) ne sont PAS copiés ; ils sont injectés
# via --env-file ou des variables d'environnement au moment du run.
COPY app      ./app
COPY alembic  ./alembic
COPY alembic.ini ./alembic.ini
COPY data     ./data

# --- Entrypoint (migrations + seed + démarrage) ------------------------
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# --- Utilisateur non-root ----------------------------------------------
RUN groupadd --system --gid 1000 app \
    && useradd  --system --uid 1000 --gid app --home /app --shell /usr/sbin/nologin app \
    && chown -R app:app /app \
    && chmod +x /app/docker-entrypoint.sh
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl --fail --silent --show-error http://127.0.0.1:8000/health || exit 1

# Au démarrage du conteneur :
#   1. alembic upgrade head      (migrations DB)
#   2. load_geodata               (PostGIS + zones + comptes par défaut)
#   3. uvicorn                    (API)
# load_geodata est idempotent : il ne re-crée pas les objets déjà existants.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--proxy-headers", \
     "--forwarded-allow-ips=*"]
