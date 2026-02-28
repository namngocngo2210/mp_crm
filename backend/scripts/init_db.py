#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
from django.contrib.auth.hashers import make_password
from sqlalchemy import select, text


django.setup()

from app.db import Base, engine, get_session
from app.models import Item, UnitWeightOption, User


DEFAULT_ITEMS = [
    "Thân dài",
    "Thân ngắn",
    "Thân ống",
    "Thân trước sau",
    "Thân mặt cạnh",
    "Thân quây",
    "Miệng xả tròn",
    "Đáy xả tròn",
    "Miệng xả chéo",
    "Đáy xả chéo",
    "Bocang",
    "Đáp đai",
    "Tucong M",
    "Tucong Đ",
    "TCM",
    "TCĐ",
    "Tapchi",
    "Tấm chống bẩn",
    "POCKET",
    "LINER",
    "Chạc M",
    "Chạc Đ",
    "Tape M",
    "Tape Đ",
    "Chạc",
    "Chạc nâng",
    "Đai nâng",
    "Đai bo thân",
    "Đai bo miệng",
    "Đai bo đáy",
    "Đai ngang",
    "Đai",
    "Tấm chống phình",
    "Mếch",
    "Dây chống xì",
    "Nhám",
    "P.V.C",
    "Chỉ may",
    "Label",
]

DEFAULT_UNIT_WEIGHT_OPTIONS = [
    ("Spec chạc", "3mm", 0.007),
    ("Spec chạc", "5mm", 0.013),
    ("Spec chạc", "8mm", 0.056),
    ("Spec chạc", "10mm", 0.06),
    ("Spec chạc", "11mm", 0.063),
    ("Spec chạc", "12mm", 0.065),
    ("Spec chạc", "14mm", 0.085),
    ("Spec đai", "50mm 25gr", 0.025),
    ("Spec đai", "50mm 30gr", 0.03),
    ("Spec đai", "50mm 36gr", 0.036),
    ("Spec đai", "70mm 45gr", 0.045),
    ("Spec đai", "70mm 48gr", 0.048),
    ("Spec đai", "70mm 50gr", 0.05),
    ("Spec đai", "10mm 60gr", 0.06),
]


def ensure_soft_delete_columns() -> None:
    tables = [
        "users",
        "customers",
        "products",
        "items",
        "material_groups",
        "unit_weight_options",
        "product_specs",
        "product_print_versions",
        "product_print_images",
        "production_plans",
    ]
    with engine.begin() as conn:
        for table in tables:
            cols = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            col_names = {row[1] for row in cols}
            if "deleted_at" not in col_names:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN deleted_at DATETIME"))
                print(f"Added deleted_at to {table}")
        user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()}
        if "role" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'staff'"))
            print("Added role to users")
        if "avatar_url" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url TEXT"))
            print("Added avatar_url to users")


def ensure_product_specs_relations() -> None:
    with engine.begin() as conn:
        ps_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(product_specs)")).fetchall()}
        if "item_id" not in ps_cols:
            conn.execute(text("ALTER TABLE product_specs ADD COLUMN item_id INTEGER"))
            print("Added item_id to product_specs")
        if "material_group_id" not in ps_cols:
            conn.execute(text("ALTER TABLE product_specs ADD COLUMN material_group_id INTEGER"))
            print("Added material_group_id to product_specs")

        # backfill item/material group from legacy text columns (old schema only)
        if "item_name" in ps_cols:
            conn.execute(
                text(
                    """
                    INSERT INTO items (item_name, created_at, updated_at)
                    SELECT DISTINCT TRIM(item_name), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    FROM product_specs
                    WHERE item_name IS NOT NULL AND TRIM(item_name) <> ''
                      AND TRIM(item_name) NOT IN (SELECT item_name FROM items)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE product_specs
                    SET item_id = (
                        SELECT i.id FROM items i WHERE i.item_name = TRIM(product_specs.item_name) LIMIT 1
                    )
                    WHERE item_id IS NULL AND item_name IS NOT NULL AND TRIM(item_name) <> ''
                    """
                )
            )

        if "material_group" in ps_cols:
            conn.execute(
                text(
                    """
                    INSERT INTO material_groups (material_group_name, created_at, updated_at)
                    SELECT DISTINCT TRIM(material_group), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    FROM product_specs
                    WHERE material_group IS NOT NULL AND TRIM(material_group) <> ''
                      AND TRIM(material_group) NOT IN (SELECT material_group_name FROM material_groups)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE product_specs
                    SET material_group_id = (
                        SELECT mg.id FROM material_groups mg
                        WHERE mg.material_group_name = TRIM(product_specs.material_group) LIMIT 1
                    )
                    WHERE material_group_id IS NULL
                      AND material_group IS NOT NULL AND TRIM(material_group) <> ''
                    """
                )
            )


def ensure_product_specs_schema() -> None:
    expected_cols = {
        "id",
        "product_id",
        "item_id",
        "material_group_id",
        "line_no",
        "spec",
        "item_size",
        "lami",
        "item_color",
        "unit_weight_kg",
        "qty_m_or_m2",
        "pcs_ea",
        "wt_kg",
        "other_note",
        "is_manual_weight",
        "deleted_at",
        "created_at",
        "updated_at",
    }
    with engine.begin() as conn:
        ps_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(product_specs)")).fetchall()}
        if ps_cols == expected_cols:
            return

        # fallback records so rebuilt rows always satisfy NOT NULL FK columns
        conn.execute(
            text(
                """
                INSERT INTO items (item_name, created_at, updated_at)
                SELECT '__MIGRATION_ITEM__', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_name = '__MIGRATION_ITEM__')
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO material_groups (material_group_name, created_at, updated_at)
                SELECT '__MIGRATION_MG__', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                WHERE NOT EXISTS (SELECT 1 FROM material_groups WHERE material_group_name = '__MIGRATION_MG__')
                """
            )
        )

        select_item_id = """
            COALESCE(
                item_id,
                (SELECT i.id FROM items i
                 WHERE 'item_name' IN (SELECT name FROM pragma_table_info('product_specs'))
                   AND i.item_name = TRIM(product_specs.item_name)
                 LIMIT 1),
                (SELECT i2.id FROM items i2 WHERE i2.item_name = '__MIGRATION_ITEM__' LIMIT 1)
            )
        """
        select_mg_id = """
            COALESCE(
                material_group_id,
                (SELECT mg.id FROM material_groups mg
                 WHERE 'material_group' IN (SELECT name FROM pragma_table_info('product_specs'))
                   AND mg.material_group_name = TRIM(product_specs.material_group)
                 LIMIT 1),
                (SELECT mg2.id FROM material_groups mg2 WHERE mg2.material_group_name = '__MIGRATION_MG__' LIMIT 1)
            )
        """

        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(
            text(
                """
                CREATE TABLE product_specs_new (
                    id INTEGER NOT NULL PRIMARY KEY,
                    product_id INTEGER NOT NULL,
                    item_id INTEGER NOT NULL,
                    material_group_id INTEGER NOT NULL,
                    line_no INTEGER NOT NULL DEFAULT 1,
                    spec VARCHAR(255),
                    item_size VARCHAR(100),
                    lami VARCHAR(100),
                    item_color VARCHAR(100),
                    unit_weight_kg NUMERIC(12, 4),
                    qty_m_or_m2 NUMERIC(14, 4),
                    pcs_ea NUMERIC(12, 4),
                    wt_kg NUMERIC(14, 4),
                    other_note TEXT,
                    is_manual_weight BOOLEAN NOT NULL DEFAULT 1,
                    deleted_at DATETIME,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_productspec_product_line UNIQUE (product_id, line_no),
                    FOREIGN KEY(product_id) REFERENCES products (id) ON DELETE CASCADE,
                    FOREIGN KEY(item_id) REFERENCES items (id) ON DELETE RESTRICT,
                    FOREIGN KEY(material_group_id) REFERENCES material_groups (id) ON DELETE RESTRICT
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                INSERT INTO product_specs_new
                (id, product_id, item_id, material_group_id, line_no, spec, item_size, lami, item_color,
                 unit_weight_kg, qty_m_or_m2, pcs_ea, wt_kg, other_note, is_manual_weight, deleted_at, created_at, updated_at)
                SELECT
                    id,
                    product_id,
                    {select_item_id} AS item_id,
                    {select_mg_id} AS material_group_id,
                    COALESCE(line_no, 1) AS line_no,
                    spec,
                    item_size,
                    lami,
                    item_color,
                    unit_weight_kg,
                    qty_m_or_m2,
                    pcs_ea,
                    wt_kg,
                    other_note,
                    COALESCE(is_manual_weight, 1) AS is_manual_weight,
                    deleted_at,
                    COALESCE(created_at, CURRENT_TIMESTAMP) AS created_at,
                    COALESCE(updated_at, CURRENT_TIMESTAMP) AS updated_at
                FROM product_specs
                """
            )
        )
        conn.execute(text("DROP TABLE product_specs"))
        conn.execute(text("ALTER TABLE product_specs_new RENAME TO product_specs"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ps_product_line ON product_specs (product_id, line_no)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_specs_product_id ON product_specs (product_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_specs_item_id ON product_specs (item_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_product_specs_material_group_id ON product_specs (material_group_id)"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        print("Rebuilt product_specs schema to modern FK-based columns (item_id/material_group_id)")


def ensure_material_group_schema() -> None:
    expected_cols = {
        "id",
        "material_group_name",
        "spec_label",
        "has_lami",
        "use_lami_for_calc",
        "lami_calc_value",
        "pcs_ea_label",
        "unit_weight_mode",
        "unit_weight_value",
        "unit_weight_formula_code",
        "unit_weight_option_id",
        "unit_weight_note",
        "deleted_at",
        "created_at",
        "updated_at",
    }
    with engine.begin() as conn:
        mg_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(material_groups)")).fetchall()}
        if mg_cols == expected_cols:
            return

        select_parts = [
            "id",
            "material_group_name",
            "spec_label" if "spec_label" in mg_cols else "NULL AS spec_label",
            "COALESCE(has_lami, 0) AS has_lami" if "has_lami" in mg_cols else "0 AS has_lami",
            "COALESCE(use_lami_for_calc, 0) AS use_lami_for_calc" if "use_lami_for_calc" in mg_cols else "0 AS use_lami_for_calc",
            "lami_calc_value" if "lami_calc_value" in mg_cols else "NULL AS lami_calc_value",
            "pcs_ea_label" if "pcs_ea_label" in mg_cols else "NULL AS pcs_ea_label",
            "COALESCE(unit_weight_mode, 'fixed') AS unit_weight_mode" if "unit_weight_mode" in mg_cols else "'fixed' AS unit_weight_mode",
            "unit_weight_value" if "unit_weight_value" in mg_cols else "NULL AS unit_weight_value",
            "unit_weight_formula_code" if "unit_weight_formula_code" in mg_cols else "NULL AS unit_weight_formula_code",
            "unit_weight_option_id" if "unit_weight_option_id" in mg_cols else "NULL AS unit_weight_option_id",
            "unit_weight_note" if "unit_weight_note" in mg_cols else "NULL AS unit_weight_note",
            "deleted_at" if "deleted_at" in mg_cols else "NULL AS deleted_at",
            "created_at" if "created_at" in mg_cols else "CURRENT_TIMESTAMP AS created_at",
            "updated_at" if "updated_at" in mg_cols else "CURRENT_TIMESTAMP AS updated_at",
        ]
        select_sql = ", ".join(select_parts)

        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(
            text(
                """
                CREATE TABLE material_groups_new (
                    id INTEGER NOT NULL PRIMARY KEY,
                    material_group_name VARCHAR(100) NOT NULL UNIQUE,
                    spec_label VARCHAR(100),
                    has_lami BOOLEAN NOT NULL DEFAULT 0,
                    use_lami_for_calc BOOLEAN NOT NULL DEFAULT 0,
                    lami_calc_value NUMERIC(12,4),
                    pcs_ea_label VARCHAR(100),
                    unit_weight_mode VARCHAR(20) NOT NULL DEFAULT 'fixed',
                    unit_weight_value NUMERIC(12,4),
                    unit_weight_formula_code VARCHAR(50),
                    unit_weight_option_id INTEGER,
                    unit_weight_note TEXT,
                    deleted_at DATETIME,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(unit_weight_option_id) REFERENCES unit_weight_options (id) ON DELETE SET NULL
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                INSERT INTO material_groups_new
                (id, material_group_name, spec_label, has_lami, use_lami_for_calc, lami_calc_value, pcs_ea_label, unit_weight_mode, unit_weight_value, unit_weight_formula_code, unit_weight_option_id, unit_weight_note, deleted_at, created_at, updated_at)
                SELECT {select_sql}
                FROM material_groups
                """
            )
        )
        conn.execute(text("DROP TABLE material_groups"))
        conn.execute(text("ALTER TABLE material_groups_new RENAME TO material_groups"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_material_groups_material_group_name ON material_groups (material_group_name)"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        print("Rebuilt material_groups schema with unit_weight config fields")


def ensure_product_columns() -> None:
    cols_to_add = {
        "sewing_type": "VARCHAR(100)",
        "print": "VARCHAR(10)",
    }
    with engine.begin() as conn:
        product_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(products)")).fetchall()}
        for col, ddl in cols_to_add.items():
            if col not in product_cols:
                conn.execute(text(f"ALTER TABLE products ADD COLUMN {col} {ddl}"))
                print(f"Added {col} to products")


def ensure_item_columns() -> None:
    cols_to_add = {
        "item_color": "VARCHAR(100)",
    }
    with engine.begin() as conn:
        item_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(items)")).fetchall()}
        for col, ddl in cols_to_add.items():
            if col not in item_cols:
                conn.execute(text(f"ALTER TABLE items ADD COLUMN {col} {ddl}"))
                print(f"Added {col} to items")


def main() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_soft_delete_columns()
    ensure_product_specs_relations()
    ensure_product_specs_schema()
    ensure_material_group_schema()
    ensure_product_columns()
    ensure_item_columns()
    with get_session() as session:
        admin = session.scalar(select(User).where(User.username == "admin"))
        if not admin:
            session.add(
                User(
                    username="admin",
                    password_hash=make_password("123456"),
                    full_name="Administrator",
                    is_active=True,
                    role="admin",
                )
            )
            print("Created default admin user: admin / 123456")
        else:
            if admin.role != "admin":
                admin.role = "admin"
                session.add(admin)
            print("Admin user already exists: admin / 123456")

        existing_items = {name for name in session.scalars(select(Item.item_name)).all() if name}
        for name in DEFAULT_ITEMS:
            if name not in existing_items:
                session.add(Item(item_name=name))
        print("Ensured default items list")

        existing_options = {
            (group, label)
            for group, label in session.execute(
                text("SELECT option_group, option_label FROM unit_weight_options WHERE deleted_at IS NULL")
            ).all()
        }
        for group, label, value in DEFAULT_UNIT_WEIGHT_OPTIONS:
            if (group, label) not in existing_options:
                session.add(UnitWeightOption(option_group=group, option_label=label, unit_weight_value=value))
        print("Ensured default unit weight options list")


if __name__ == "__main__":
    main()
