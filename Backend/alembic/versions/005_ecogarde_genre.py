"""ajout du genre sur les écogardes

Revision ID: 005_ecogarde_genre
Revises: 004_ecogarde_exclusion
Create Date: 2026-06-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_ecogarde_genre"
down_revision: Union[str, None] = "004_ecogarde_exclusion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE ecogardes ADD COLUMN IF NOT EXISTS genre VARCHAR(10)")


def downgrade() -> None:
    op.drop_column("ecogardes", "genre")
