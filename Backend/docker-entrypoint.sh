#!/bin/sh
# =============================================================================
# TechFOREST – Entrypoint du conteneur Backend
# Exécuté à chaque démarrage du conteneur avant uvicorn.
# =============================================================================
set -e

echo ">>> [1/3] Migrations Alembic..."
alembic upgrade head

echo ">>> [2/3] Initialisation des données (PostGIS, zones, comptes par défaut)..."
python -m app.scripts.load_geodata

echo ">>> [3/3] Démarrage de l'API (workers=${UVICORN_WORKERS:-2})..."
exec "$@"
