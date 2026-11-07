"""utilities
Revision ID: 0005_utilities
Revises: 0004_tenancy
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "0005_utilities"
down_revision = "0004_tenancy"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "utility_types",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="1", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "service_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("type_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=160), nullable=False),
        sa.Column("provider", sa.String(length=160), nullable=False),
        sa.Column("account_number", sa.String(length=100), nullable=True),
        sa.Column("measurement_kind", sa.String(length=20), nullable=False),
        sa.Column("measure_unit", sa.String(length=30), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="1", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "measurement_kind IN ('individual','shared')",
            name="ck_service_account_kind",
        ),
        sa.ForeignKeyConstraint(
            ["property_id"], ["properties.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["type_id"], ["utility_types.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "label", name="uq_service_account_label"),
        sa.UniqueConstraint(
            "property_id",
            "provider",
            "account_number",
            name="uq_service_account_number",
        ),
    )
    op.create_table(
        "utility_configurations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("economic_policy", sa.String(length=20), nullable=False),
        sa.Column("owner_person_id", sa.Integer(), nullable=True),
        sa.Column("provider_payer_id", sa.Integer(), nullable=True),
        sa.Column("reimbursement_person_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "economic_policy IN ('occupant','owner')", name="ck_utility_config_policy"
        ),
        sa.CheckConstraint(
            "method IN ('equal','percentage','occupants','readings','manual')",
            name="ck_utility_config_method",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["service_accounts.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["owner_person_id"], ["persons.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["provider_payer_id"], ["persons.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["reimbursement_person_id"], ["persons.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "account_id", "revision", name="uq_utility_config_revision"
        ),
    )
    op.create_table(
        "utility_meters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("serial", sa.String(length=100), nullable=False),
        sa.Column("installed_on", sa.Date(), nullable=False),
        sa.Column("retired_on", sa.Date(), nullable=True),
        sa.Column("replaces_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint(
            "retired_on IS NULL OR retired_on >= installed_on",
            name="ck_utility_meter_dates",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["service_accounts.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["replaces_id"], ["utility_meters.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id", "serial", name="uq_utility_meter_serial"),
        sa.UniqueConstraint("replaces_id"),
    )
    op.create_table(
        "utility_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["service_accounts.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "meter_readings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meter_id", sa.Integer(), nullable=False),
        sa.Column("recorded_on", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("value >= 0", name="ck_meter_reading_value"),
        sa.ForeignKeyConstraint(
            ["meter_id"], ["utility_meters.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meter_id", "recorded_on", name="uq_meter_reading_date"),
    )
    op.create_table(
        "utility_configuration_units",
        sa.Column("configuration_id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=False),
        sa.Column("percentage", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_utility_config_percentage",
        ),
        sa.ForeignKeyConstraint(
            ["configuration_id"], ["utility_configurations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("configuration_id", "unit_id"),
    )
    op.create_table(
        "utility_receipt_revisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receipt_id", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("external_reference", sa.String(length=120), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("issued_on", sa.Date(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("consumption", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column(
            "fixed_amount",
            sa.Numeric(precision=14, scale=2),
            server_default="0",
            nullable=False,
        ),
        sa.Column("document_reference", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "amount > 0 AND fixed_amount >= 0 AND fixed_amount <= amount",
            name="ck_utility_receipt_amount",
        ),
        sa.CheckConstraint(
            "consumption IS NULL OR consumption >= 0",
            name="ck_utility_receipt_consumption",
        ),
        sa.CheckConstraint(
            "period_end >= period_start", name="ck_utility_receipt_period"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["receipt_id"], ["utility_receipts.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "receipt_id", "revision", name="uq_utility_receipt_revision"
        ),
    )
    op.create_index(
        "ix_utility_receipt_period",
        "utility_receipt_revisions",
        ["period_start", "period_end"],
        unique=False,
    )
    op.create_index(
        "ix_utility_receipt_reference",
        "utility_receipt_revisions",
        ["external_reference"],
        unique=False,
    )
    op.create_table(
        "utility_distributions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receipt_revision_id", sa.Integer(), nullable=False),
        sa.Column("configuration_id", sa.Integer(), nullable=False),
        sa.Column("request_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "evidence",
            sa.Text().with_variant(mysql.MEDIUMTEXT(), "mysql"),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("supersedes_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("confirmed_by", sa.Integer(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "(confirmed_at IS NULL AND confirmed_by IS NULL AND status IN ('calculated','needs_review')) OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND status IN ('confirmed','superseded'))",
            name="ck_utility_distribution_confirmation",
        ),
        sa.CheckConstraint(
            "status IN ('calculated','needs_review','confirmed','superseded')",
            name="ck_utility_distribution_status",
        ),
        sa.ForeignKeyConstraint(
            ["configuration_id"], ["utility_configurations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["confirmed_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["receipt_revision_id"],
            ["utility_receipt_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["supersedes_id"], ["utility_distributions.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_key"),
    )
    op.create_table(
        "utility_allocations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("distribution_id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("weight", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.CheckConstraint("amount >= 0", name="ck_utility_allocation_amount"),
        sa.ForeignKeyConstraint(
            ["distribution_id"], ["utility_distributions.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "distribution_id", "unit_id", name="uq_utility_allocation_unit"
        ),
    )
    op.create_table(
        "utility_current_distributions",
        sa.Column("receipt_id", sa.Integer(), nullable=False),
        sa.Column("distribution_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["distribution_id"], ["utility_distributions.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["receipt_id"], ["utility_receipts.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("receipt_id"),
        sa.UniqueConstraint("distribution_id"),
    )
    op.create_table(
        "utility_responsibilities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("allocation_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=True),
        sa.Column("contract_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.CheckConstraint(
            "contract_id IS NULL OR person_id IS NOT NULL",
            name="ck_utility_responsibility_origin",
        ),
        sa.CheckConstraint("amount >= 0", name="ck_utility_responsibility_amount"),
        sa.ForeignKeyConstraint(
            ["allocation_id"], ["utility_allocations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint(
            "allocation_id",
            "person_id",
            "contract_id",
            name="uq_utility_responsibility_person",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.bulk_insert(
        sa.table(
            "utility_types",
            sa.column("name", sa.String),
            sa.column("is_active", sa.Boolean),
        ),
        [
            {"name": name, "is_active": True}
            for name in [
                "Electricidad",
                "Agua",
                "Internet",
                "Gas",
                "Recolección de basura",
                "Otros servicios",
            ]
        ],
    )


def downgrade():
    op.drop_table("utility_responsibilities")
    op.drop_table("utility_current_distributions")
    op.drop_table("utility_allocations")
    op.drop_table("utility_distributions")
    op.drop_table("utility_receipt_revisions")
    op.drop_table("utility_configuration_units")
    op.drop_table("meter_readings")
    op.drop_table("utility_receipts")
    op.drop_table("utility_meters")
    op.drop_table("utility_configurations")
    op.drop_table("service_accounts")
    op.drop_table("utility_types")
