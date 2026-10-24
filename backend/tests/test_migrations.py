import os
from pathlib import Path
import subprocess
import sys

from sqlalchemy import create_engine, inspect


def test_fresh_migrations_and_reversible_schema(tmp_path):
    """Exercise shipped Alembic scripts, not just ORM create_all used in unit fixtures."""
    database_url = f"sqlite:///{tmp_path / 'migration.db'}"
    environment = {**os.environ, "DATABASE_URL": database_url, "WORKSPACE_MODE": "demo"}
    backend = Path(__file__).resolve().parents[1]
    for arguments in (("upgrade", "head"), ("check",), ("downgrade", "base"), ("upgrade", "head")):
        result = subprocess.run([sys.executable, "-m", "alembic", *arguments], cwd=backend, env=environment, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
    engine = create_engine(database_url)
    schema = inspect(engine)
    assert {"bakeries", "products", "orders", "order_items", "inventory_snapshots", "forecasts", "application_settings"}.issubset(schema.get_table_names())
    assert any(check["name"] == "workspace_mode_valid" for check in schema.get_check_constraints("application_settings"))
    engine.dispose()
