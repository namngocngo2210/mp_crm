from __future__ import annotations

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="staff", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User")


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    address: Mapped[str | None] = mapped_column(Text)
    contact_person: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    production_2025: Mapped[float | None] = mapped_column(Numeric(14, 2), default=0)
    production_2026: Mapped[float | None] = mapped_column(Numeric(14, 2), default=0)
    in_production: Mapped[float | None] = mapped_column(Numeric(14, 2), default=0)
    level: Mapped[str | None] = mapped_column(String(20), index=True)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    product_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    swl: Mapped[str | None] = mapped_column(String(100))
    type: Mapped[str | None] = mapped_column(String(100), index=True)
    sewing_type: Mapped[str | None] = mapped_column(String(100))
    print: Mapped[str | None] = mapped_column(String(10))
    spec_other: Mapped[str | None] = mapped_column(Text)
    spec_inner: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(100))
    liner: Mapped[str | None] = mapped_column(String(255))
    has_print_assets: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    top: Mapped[str | None] = mapped_column(String(100))
    bottom: Mapped[str | None] = mapped_column(String(100))
    packing: Mapped[str | None] = mapped_column(String(100))
    other_note: Mapped[str | None] = mapped_column(Text)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    customer = relationship("Customer")


class ProductType(Base):
    __tablename__ = "product_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_type_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    material_id: Mapped[int | None] = mapped_column(ForeignKey("materials.id", ondelete="SET NULL"), index=True)
    item_size_source_field: Mapped[str | None] = mapped_column(String(20))
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    material = relationship("Material")


class ItemProductType(Base):
    __tablename__ = "item_product_types"

    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), primary_key=True)
    product_type_id: Mapped[int] = mapped_column(ForeignKey("product_types.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class ItemTypeFormula(Base):
    __tablename__ = "item_type_formulas"

    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), primary_key=True)
    product_type_id: Mapped[int] = mapped_column(ForeignKey("product_types.id", ondelete="CASCADE"), primary_key=True)
    formula: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RawMaterialPrice(Base):
    __tablename__ = "raw_material_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    material_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(30), nullable=False, default="kg")
    unit_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class ProcessingPrice(Base):
    __tablename__ = "processing_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    process_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class MaterialCategory(Base):
    __tablename__ = "material_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    material_category_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    spec_format: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    format_value: Mapped[str | None] = mapped_column("format", String(255))
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    material_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    material_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("material_categories.id", ondelete="SET NULL"), index=True
    )
    formula: Mapped[str | None] = mapped_column(String(255))
    spec: Mapped[str | None] = mapped_column(String(255))
    lami: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    material_category = relationship("MaterialCategory")


class MaterialGroup(Base):
    __tablename__ = "material_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    material_group_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    spec_label: Mapped[str | None] = mapped_column(String(100))
    has_lami: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    use_lami_for_calc: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    lami_calc_value: Mapped[float | None] = mapped_column(Numeric(12, 4))
    pcs_ea_label: Mapped[str | None] = mapped_column(String(100))
    unit_weight_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="fixed")
    unit_weight_value: Mapped[float | None] = mapped_column(Numeric(12, 4))
    unit_weight_formula_code: Mapped[str | None] = mapped_column(String(50))
    unit_weight_option_id: Mapped[int | None] = mapped_column(ForeignKey("unit_weight_options.id", ondelete="SET NULL"), index=True)
    unit_weight_note: Mapped[str | None] = mapped_column(Text)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    unit_weight_option = relationship("UnitWeightOption")


class UnitWeightOption(Base):
    __tablename__ = "unit_weight_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    option_group: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    option_label: Mapped[str] = mapped_column(String(100), nullable=False)
    unit_weight_value: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("option_group", "option_label", name="uq_uwo_group_label"),
        Index("idx_uwo_group_label", "option_group", "option_label"),
    )


class FixedWeightTable(Base):
    __tablename__ = "fixed_weight_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    material_id: Mapped[int | None] = mapped_column(
        ForeignKey("materials.id", ondelete="SET NULL"), nullable=True, index=True
    )
    size_label: Mapped[str] = mapped_column(String(100), nullable=False)
    unit_weight_value: Mapped[float] = mapped_column(Numeric(12, 5), nullable=False, default=0)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    material = relationship("Material")

    __table_args__ = (
        UniqueConstraint("material_id", "size_label", name="uq_fwt_material_size"),
        Index("idx_fwt_material_size", "material_id", "size_label"),
    )


class ProductSpec(Base):
    __tablename__ = "product_specs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    material_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("material_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    spec: Mapped[str | None] = mapped_column(String(255))
    item_size: Mapped[str | None] = mapped_column(String(100))
    lami: Mapped[str | None] = mapped_column(String(100))
    item_color: Mapped[str | None] = mapped_column(String(100))
    unit_weight_kg: Mapped[float | None] = mapped_column(Numeric(12, 4))
    qty_m_or_m2: Mapped[float | None] = mapped_column(Numeric(14, 4))
    pcs_ea: Mapped[float | None] = mapped_column(Numeric(12, 4))
    wt_kg: Mapped[float | None] = mapped_column(Numeric(14, 4))
    other_note: Mapped[str | None] = mapped_column(Text)
    is_manual_weight: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("product_id", "line_no", name="uq_productspec_product_line"),
        Index("idx_ps_product_line", "product_id", "line_no"),
    )

    item = relationship("Item")
    material_group = relationship("MaterialGroup")


class ProductPrintVersion(Base):
    __tablename__ = "product_print_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    upload_note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(150))
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("product_id", "version_no", name="uq_product_print_version"),
        CheckConstraint("version_no > 0", name="ck_ppv_version_no_positive"),
        Index("idx_ppv_product_version", "product_id", "version_no"),
    )


class ProductPrintImage(Base):
    __tablename__ = "product_print_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_print_version_id: Mapped[int] = mapped_column(
        ForeignKey("product_print_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(100))
    file_size: Mapped[int | None] = mapped_column(Integer)
    width_px: Mapped[int | None] = mapped_column(Integer)
    height_px: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("product_print_version_id", "sort_order", name="uq_ppi_version_sort"),
        Index("idx_ppi_version_sort", "product_print_version_id", "sort_order"),
    )


class ProductionPlan(Base):
    __tablename__ = "production_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    lot_no: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    etd: Mapped[str | None] = mapped_column(Date)
    eta: Mapped[str | None] = mapped_column(Date)
    contp_date: Mapped[str | None] = mapped_column(Date)
    order_qty_pcs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    spec_inner_snapshot: Mapped[str | None] = mapped_column(Text)
    liner_snapshot: Mapped[str | None] = mapped_column(Text)
    print_snapshot: Mapped[str | None] = mapped_column(Text)
    label: Mapped[str | None] = mapped_column(String(255))
    sewing_type: Mapped[str | None] = mapped_column(String(100))
    packing: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    update_person: Mapped[str | None] = mapped_column(String(150))
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("lot_no", "product_id", name="uq_plan_lot_product"),
        CheckConstraint("order_qty_pcs >= 0", name="ck_order_qty_nonnegative"),
        Index("idx_plan_etd", "etd"),
    )


class Quotation(Base):
    __tablename__ = "quotations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    has_lami: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    lami_unit_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0.429)
    level_code: Mapped[str | None] = mapped_column(String(10), index=True)
    level_factor: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=1)
    size_value: Mapped[str | None] = mapped_column(String(255))
    total_weight_kg: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    pe_weight_kg: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    pp_weight_kg: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    amount_weight: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    amount_lami: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    amount_color: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    amount_extra: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    subtotal: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    row_payload: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    deleted_at: Mapped[str | None] = mapped_column(DateTime)
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_quotation_customer_product", "customer_id", "product_id"),
        Index("idx_quotation_total", "total"),
    )
