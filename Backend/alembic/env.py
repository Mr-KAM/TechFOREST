# Alembic configuration
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import sys
import os

# Ajouter le dossier parent au path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import Base
from app.models import User, ForestZone, GEELayer, Ecogarde  # noqa: F401 – force import
from app.config import get_settings

config = context.config

# Synchroniser l'URL Alembic avec le .env de l'application
# Utiliser DIRECT_URL (connexion directe) pour les migrations, pas le pooler
_settings = get_settings()
_migration_url = _settings.DIRECT_URL or _settings.DATABASE_URL
config.set_main_option("sqlalchemy.url", _migration_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
