"""contratos reservas y disponibilidad
Revision ID: 0004_tenancy
Revises: 0003_identity
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_tenancy"
down_revision = "0003_identity"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "property_contacts",
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["property_id"], ["properties.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("property_id", "person_id"),
    )
    op.create_table(
        "reservations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=True),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "mode IN ('daily','weekly','monthly','anticretico')",
            name="ck_reservation_mode",
        ),
        sa.CheckConstraint(
            "status IN ('pending','confirmed','cancelled','expired','converted')",
            name="ck_reservation_status",
        ),
        sa.CheckConstraint(
            "(property_id IS NOT NULL AND unit_id IS NULL) OR (property_id IS NULL AND unit_id IS NOT NULL)",
            name="ck_reservation_target",
        ),
        sa.CheckConstraint("end_date >= start_date", name="ck_reservation_dates"),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["property_id"], ["properties.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reservation_expiry", "reservations", ["expires_at"], unique=False
    )
    op.create_index(
        "ix_reservation_property_dates",
        "reservations",
        ["property_id", "start_date", "end_date"],
        unique=False,
    )
    op.create_index(
        "ix_reservation_unit_dates",
        "reservations",
        ["unit_id", "start_date", "end_date"],
        unique=False,
    )
    op.create_table(
        "contracts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=True),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("responsible_person_id", sa.Integer(), nullable=False),
        sa.Column("source_reservation_id", sa.Integer(), nullable=True),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("actual_end_date", sa.Date(), nullable=True),
        sa.Column("price", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("daily_count", sa.String(length=20), nullable=True),
        sa.Column("weekly_partial_allowed", sa.Boolean(), nullable=True),
        sa.Column("monthly_period", sa.String(length=20), nullable=True),
        sa.Column("first_period", sa.String(length=20), nullable=True),
        sa.Column("due_day", sa.Integer(), nullable=True),
        sa.Column("payment_timing", sa.String(length=20), nullable=False),
        sa.Column("due_terms", sa.Text(), nullable=True),
        sa.Column(
            "services_included", sa.Boolean(), server_default="0", nullable=False
        ),
        sa.Column("service_terms", sa.Text(), nullable=True),
        sa.Column("conditions", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "(mode IN ('daily','weekly','monthly') AND price IS NOT NULL AND price > 0) OR (mode IN ('anticretico','mixed') AND price IS NULL)",
            name="ck_contract_price",
        ),
        sa.CheckConstraint(
            "(status = 'finished' AND actual_end_date IS NOT NULL AND actual_end_date >= start_date AND actual_end_date <= end_date) OR (status != 'finished' AND actual_end_date IS NULL)",
            name="ck_contract_actual_end",
        ),
        sa.CheckConstraint(
            "mode != 'daily' OR services_included = 1", name="ck_daily_services"
        ),
        sa.CheckConstraint(
            "mode != 'mixed' OR status IN ('draft','cancelled')", name="ck_mixed_draft"
        ),
        sa.CheckConstraint(
            "mode IN ('daily','weekly','monthly','anticretico','mixed')",
            name="ck_contract_mode",
        ),
        sa.CheckConstraint(
            "status IN ('draft','active','finished','cancelled')",
            name="ck_contract_status",
        ),
        sa.CheckConstraint(
            "(property_id IS NOT NULL AND unit_id IS NULL) OR (property_id IS NULL AND unit_id IS NOT NULL)",
            name="ck_contract_target",
        ),
        sa.CheckConstraint(
            "due_day IS NULL OR (due_day >= 1 AND due_day <= 31)",
            name="ck_contract_due_day",
        ),
        sa.CheckConstraint("end_date >= start_date", name="ck_contract_dates"),
        sa.ForeignKeyConstraint(
            ["property_id"], ["properties.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["responsible_person_id"], ["persons.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["source_reservation_id"], ["reservations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_reservation_id"),
    )
    op.create_index(
        "ix_contract_property_dates",
        "contracts",
        ["property_id", "start_date", "end_date"],
        unique=False,
    )
    op.create_index(
        "ix_contract_unit_dates",
        "contracts",
        ["unit_id", "start_date", "end_date"],
        unique=False,
    )
    op.create_table(
        "contract_occupants",
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("contract_id", "person_id"),
    )
    op.create_table(
        "contract_owners",
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("share", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.CheckConstraint(
            "share IS NULL OR (share > 0 AND share <= 100)",
            name="ck_contract_owner_share",
        ),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("contract_id", "person_id"),
    )


def downgrade():
    op.drop_table("contract_owners")
    op.drop_table("contract_occupants")
    # MySQL utiliza estos índices para las FK: DROP TABLE los retira junto con ellas.
    op.drop_table("contracts")
    op.drop_table("reservations")
    op.drop_table("property_contacts")
