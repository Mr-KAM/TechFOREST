"""exclusion permanente des écogardes (tombstone)

Revision ID: 004_ecogarde_exclusion
Revises: 003_ecogarde_enrichissement
Create Date: 2026-06-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_ecogarde_exclusion"
down_revision: Union[str, None] = "003_ecogarde_enrichissement"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ecogardes",
        sa.Column("is_excluded", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("ecogardes", "is_excluded")
