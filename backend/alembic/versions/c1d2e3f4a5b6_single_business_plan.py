"""Single Business plan priced per location.

Adds paid-location counts to subscriptions and invoices and allows plan 'business'.
Running trials move to Business with 3 locations; paid legacy Starter/Pro records stay as they are.
"""
from alembic import op
import sqlalchemy as sa

revision = "c1d2e3f4a5b6"
down_revision = "b9c0d1e2f3a4"
branch_labels = depends_on = None


def upgrade():
    with op.batch_alter_table("subscriptions") as b:
        b.add_column(sa.Column("locations", sa.Integer(), nullable=False, server_default="1"))
        b.drop_constraint("subscription_plan_valid", type_="check")
        b.create_check_constraint("subscription_plan_valid", "plan IN ('free','starter','pro','business')")
    with op.batch_alter_table("billing_invoices") as b:
        b.add_column(sa.Column("locations", sa.Integer(), nullable=False, server_default="1"))
        b.drop_constraint("invoice_plan_valid", type_="check")
        b.create_check_constraint("invoice_plan_valid", "plan IN ('starter','pro','business')")
        b.create_check_constraint("invoice_locations_valid", "locations BETWEEN 1 AND 50")
    subs = sa.table("subscriptions", sa.column("plan", sa.String), sa.column("is_trial", sa.Boolean),
                    sa.column("locations", sa.Integer))
    op.execute(subs.update().where(subs.c.is_trial.is_(True)).values(plan="business", locations=3))


def downgrade():
    subs = sa.table("subscriptions", sa.column("plan", sa.String))
    op.execute(subs.update().where(subs.c.plan == "business").values(plan="starter"))
    invoices = sa.table("billing_invoices", sa.column("plan", sa.String))
    op.execute(invoices.update().where(invoices.c.plan == "business").values(plan="starter"))
    with op.batch_alter_table("billing_invoices") as b:
        b.drop_constraint("invoice_locations_valid", type_="check")
        b.drop_constraint("invoice_plan_valid", type_="check")
        b.create_check_constraint("invoice_plan_valid", "plan IN ('starter','pro')")
        b.drop_column("locations")
    with op.batch_alter_table("subscriptions") as b:
        b.drop_constraint("subscription_plan_valid", type_="check")
        b.create_check_constraint("subscription_plan_valid", "plan IN ('free','starter','pro')")
        b.drop_column("locations")
