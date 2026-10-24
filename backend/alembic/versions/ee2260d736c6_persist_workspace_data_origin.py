"""Persist workspace data origin

Revision ID: ee2260d736c6
Revises: b1b6d5df8d63
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'ee2260d736c6'
down_revision: Union[str, Sequence[str], None] = 'b1b6d5df8d63'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    with op.batch_alter_table('application_settings') as batch:
        batch.add_column(sa.Column('workspace_mode', sa.String(length=10), server_default='demo', nullable=False))
        batch.create_check_constraint('workspace_mode_valid', "workspace_mode IN ('demo', 'real')")

def downgrade() -> None:
    checks = {item['name'] for item in sa.inspect(op.get_bind()).get_check_constraints('application_settings')}
    with op.batch_alter_table('application_settings') as batch:
        if 'workspace_mode_valid' in checks:
            batch.drop_constraint('workspace_mode_valid', type_='check')
        batch.drop_column('workspace_mode')
