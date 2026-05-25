"""initial tables - users, forest_zones, gee_layers

Revision ID: 001_initial
Revises: None
Create Date: 2026-04-19
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import geoalchemy2

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostGIS – l'extension doit être installée sur le serveur PostgreSQL.
    # Si vous utilisez Supabase : activez-la depuis Database → Extensions.
    # Si vous utilisez votre propre Postgres : utilisez l'image postgis/postgis
    # ou installez postgresql-XX-postgis-3 sur le serveur.
    from sqlalchemy.exc import NotSupportedError
    try:
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    except NotSupportedError as e:
        raise SystemExit(
            "\n[ERREUR] PostGIS n'est pas installé sur ce serveur PostgreSQL.\n"
            "  → Supabase : activez PostGIS dans Database → Extensions.\n"
            "  → Docker   : utilisez l'image postgis/postgis:16-3.4.\n"
            "  → Bare-metal : apt-get install postgresql-XX-postgis-3\n"
            f"  Détail : {e}"
        ) from e

    # Users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Forest zones (PostGIS)
    op.create_table(
        "forest_zones",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(50), nullable=False, unique=True, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("area_ha", sa.Float(), nullable=True),
        sa.Column(
            "geometry",
            geoalchemy2.Geometry(geometry_type="MULTIPOLYGON", srid=4326),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # GEE Layers
    op.create_table(
        "gee_layers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("layer_type", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("gee_asset_id", sa.String(500), nullable=True),
        sa.Column("date_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tile_url", sa.Text(), nullable=True),
        sa.Column("extra_metadata", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("gee_layers")
    op.drop_table("forest_zones")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS postgis CASCADE")
