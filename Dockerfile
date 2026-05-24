FROM python:3.12-slim

# PostGIS client libs needed by psycopg2 and GeoAlchemy2
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq-dev gcc libgeos-dev libproj-dev nodejs npm && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend dependencies first (layer cache)
COPY Backend/requirements.txt ./Backend/requirements.txt
RUN pip install --no-cache-dir -r Backend/requirements.txt

# Install frontend dependencies first (layer cache)
COPY Frontend/package*.json ./Frontend/
RUN npm ci --prefix Frontend

# Copy backend source and data
COPY Backend/app ./app
COPY Backend/alembic ./alembic
COPY Backend/alembic.ini .
COPY Backend/data ./data
# NOTE: les credentials GEE (service-account-key-gee-true.json) ne sont PAS
# copies dans l'image. Ils sont montes en volume au runtime via docker-compose
# (voir docker-compose.yml). Cela evite de figer un secret dans l'image et
# contourne les problemes OneDrive (fichiers cloud-only non lisibles par BuildKit).

# Copy frontend source (without host node_modules)
COPY Frontend/index.html ./Frontend/index.html
COPY Frontend/tsconfig.json ./Frontend/tsconfig.json
COPY Frontend/vite.config.ts ./Frontend/vite.config.ts
COPY Frontend/src ./Frontend/src

# Ports exposed by API and Vite frontend
EXPOSE 8000 5173

# Run migrations, then start backend and frontend concurrently
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 & BACK_PID=$!; npm run dev --prefix Frontend -- --host 0.0.0.0 --port 5173 & FRONT_PID=$!; trap 'kill $BACK_PID $FRONT_PID 2>/dev/null' TERM INT; while kill -0 $BACK_PID 2>/dev/null && kill -0 $FRONT_PID 2>/dev/null; do sleep 1; done; kill $BACK_PID $FRONT_PID 2>/dev/null; wait $BACK_PID $FRONT_PID 2>/dev/null"]
