"""table ecogardes — profils des agents de collecte terrain

Revision ID: 002_ecogardes
Revises: 001_initial
Create Date: 2026-06-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_ecogardes"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ecogardes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("nom", sa.String(255), nullable=False),
        sa.Column("prenom", sa.String(255), nullable=False),
        sa.Column("code_kobo", sa.String(255), nullable=False, unique=True),
        sa.Column("foret", sa.String(100), nullable=True),
        sa.Column("telephone", sa.String(50), nullable=True),
        sa.Column("date_recrutement", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ecogardes_code_kobo", "ecogardes", ["code_kobo"])


def downgrade() -> None:
    op.drop_index("ix_ecogardes_code_kobo", table_name="ecogardes")
    op.drop_table("ecogardes")
