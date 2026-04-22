FROM python:3.12-slim

# PostGIS client libs needed by psycopg2 and GeoAlchemy2
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq-dev gcc libgeos-dev libproj-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer cache)
COPY Backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source and data
COPY Backend/app ./app
COPY Backend/alembic ./alembic
COPY Backend/alembic.ini .
COPY Backend/data ./data
COPY Backend/service-account-key-gee-true.json ./service-account-key-gee-true.json

# Port exposed by uvicorn
EXPOSE 8000

# Run migrations then start the API
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
