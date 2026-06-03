"""enrichissement écogardes — email et photo

Revision ID: 003_ecogarde_enrichissement
Revises: 002_ecogardes
Create Date: 2026-06-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_ecogarde_enrichissement"
down_revision: Union[str, None] = "002_ecogardes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ecogardes", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("ecogardes", sa.Column("photo_filename", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("ecogardes", "photo_filename")
    op.drop_column("ecogardes", "email")
