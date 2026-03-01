# DB Design (Django API + SQLAlchemy Query + SQLite)

## 1. Scope
Thiết kế DB cho các module chính trên UI:
- Customers
- Products (bao gồm Product Specs + Product Print Images trong màn hình chi tiết Product)
- Material Groups
- Items
- Production Plan
- User & Role Management (admin CRUD users, profile, auth)

DB engine: SQLite.
Data access/query layer: SQLAlchemy.

## 2. Naming Convention
- Table: `snake_case`, số nhiều.
- PK: `id` (`BigAutoField`).
- FK: `<entity>_id`.
- Time fields: `created_at`, `updated_at`.
- Soft delete field: `deleted_at` (NULL = active, NOT NULL = deleted).
- Datetime format (response/UI): `dd-mm-yyyy hh:mm:ss`.
- Datetime storage: lưu chuẩn datetime của DB/ORM, format ở serializer/frontend khi trả ra màn hình.

## 2.1 Backend Access Pattern
- Django dùng cho API layer (routing, auth, validation, response).
- SQLAlchemy dùng cho query/transaction với SQLite.
- Khuyến nghị:
  - SQLAlchemy ORM cho CRUD chính.
  - SQLAlchemy Core cho bulk insert/update nếu cần hiệu năng.
  - Dùng transaction rõ ràng ở các flow tạo version ảnh.

## 3. Tables

### 3.0 `users`
Columns:
- `id` (PK)
- `username` (TEXT, unique, not null)
- `password_hash` (TEXT, not null)
- `full_name` (TEXT, null)
- `avatar_url` (TEXT, null)
- `role` (TEXT, not null, default `staff`)  
  Enum: `admin`, `manager`, `staff`
- `is_active` (BOOLEAN, not null, default 1)
- `deleted_at` (DATETIME, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Indexes:
- unique index on `username`
- `idx_users_role` on (`role`)

### 3.1 `customers`
Columns:
- `id` (PK)
- `customer_code` (TEXT, unique, not null)
- `customer_name` (TEXT, not null)
- `address` (TEXT, null)
- `contact_person` (TEXT, null)
- `phone` (TEXT, null)
- `email` (TEXT, null)
- `production_2025` (DECIMAL(14,2), null, default 0)
- `production_2026` (DECIMAL(14,2), null, default 0)
- `in_production` (DECIMAL(14,2), null, default 0)
- `level` (TEXT, null)
- `deleted_at` (DATETIME, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Indexes:
- unique index on `customer_code`
- `idx_customers_name` on (`customer_name`)
- `idx_customers_level` on (`level`)

### 3.2 `products`
Columns:
- `id` (PK)
- `customer_id` (FK -> `customers.id`, not null, ON DELETE RESTRICT)
- `product_code` (TEXT, unique, not null)
- `product_name` (TEXT, not null)
- `swl` (TEXT, null)
- `type` (TEXT, null)
- `sewing_type` (TEXT, null)
- `print` (TEXT, null)  
  Giá trị đề xuất: `yes` / `no`
- `spec_other` (TEXT, null)
- `spec_inner` (TEXT, null)
- `color` (TEXT, null)
- `liner` (TEXT, null)
- `has_print_assets` (BOOLEAN, not null, default 0)
- `deleted_at` (DATETIME, null)
- `top` (TEXT, null)
- `bottom` (TEXT, null)
- `packing` (TEXT, null)
- `other_note` (TEXT, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Indexes:
- unique index on `product_code`
- `idx_products_customer_id` on (`customer_id`)
- `idx_products_name` on (`product_name`)
- `idx_products_type` on (`type`)

### 3.3 `product_specs`
Columns:
- `id` (PK)
- `product_id` (FK -> `products.id`, not null, ON DELETE CASCADE)
- `item_id` (FK -> `items.id`, not null, ON DELETE RESTRICT)
- `material_group_id` (FK -> `material_groups.id`, not null, ON DELETE RESTRICT)
- `line_no` (INTEGER, not null, default 1)
- `spec` (TEXT, null)
- `item_size` (TEXT, null)
- `lami` (TEXT, null)
- `item_color` (TEXT, null)
- `unit_weight_kg` (DECIMAL(12,4), null)
- `qty_m_or_m2` (DECIMAL(14,4), null)
- `pcs_ea` (DECIMAL(12,4), null)
- `wt_kg` (DECIMAL(14,4), null)
- `other_note` (TEXT, null)
- `is_manual_weight` (BOOLEAN, not null, default 1)
- `deleted_at` (DATETIME, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Constraints:
- Unique: (`product_id`, `line_no`)

Indexes:
- `idx_product_specs_product_id` on (`product_id`)
- `idx_product_specs_product_line` on (`product_id`, `line_no`)
- `idx_product_specs_item_id` on (`item_id`)
- `idx_product_specs_material_group_id` on (`material_group_id`)

Business note:
- `qty_m_or_m2`, `wt_kg` là nhập tay, cho phép NULL.
- `item_size`:
  - nếu request truyền trực tiếp thì lưu theo giá trị truyền.
  - nếu request không truyền, backend tự tính theo cấu hình `items` + dữ liệu của `products`:
    - `item_size_mode = fixed`:
      - `item_size_fixed_type = number` -> lấy `item_size_value` (dạng số)
      - `item_size_fixed_type = ab` -> lấy `item_size_value_text` (dạng `A*B`)
    - `item_size_mode = formula`:
      - công thức bắt buộc dạng 2 vế: `(expr1)*(expr2)`
      - kết quả lưu dạng text `A*B` (không nhân ra 1 số)
      - nguồn dữ liệu theo `item_size_source_field`:
        - `spec_inner` hoặc `liner`: parse dạng `A*B*C`
        - `top` hoặc `bottom`: parse dạng `A*B`
- `unit_weight_kg`:
  - nếu request truyền trực tiếp thì lưu theo giá trị truyền.
  - nếu request không truyền, backend tự tính theo cấu hình `material_groups`:
    - `unit_weight_mode = fixed` -> lấy `unit_weight_value`
    - `unit_weight_mode = formula` -> tính từ `spec` theo `unit_weight_formula_code`
      (V1: `bxc_div_10000`, với spec `A*B*C` -> `B*C/10000`)

### 3.4 `items`
Columns:
- `id` (PK)
- `item_name` (TEXT, unique, not null)
- `item_color` (TEXT, null)
- `item_size_mode` (TEXT, not null, default `fixed`)  
  Enum: `fixed`, `formula`
- `item_size_fixed_type` (TEXT, not null, default `number`)  
  Enum: `number`, `ab`
- `item_size_value` (DECIMAL(12,4), null)
- `item_size_value_text` (TEXT, null)  
  dùng cho fixed kiểu `ab`, ví dụ `101*339`
- `item_size_formula_code` (TEXT, null)  
  công thức dạng 2 vế `(expr1)*(expr2)`
- `item_size_source_field` (TEXT, null)  
  Enum: `spec_inner`, `top`, `bottom`, `liner`
- `deleted_at` (DATETIME, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Indexes:
- unique index on `item_name`

### 3.5 `material_groups`
Columns:
- `id` (PK)
- `material_group_name` (TEXT, unique, not null)
- `spec_label` (TEXT, null)
- `has_lami` (BOOLEAN, not null, default 0)
- `use_lami_for_calc` (BOOLEAN, not null, default 0)
- `lami_calc_value` (DECIMAL(12,4), null)
- `pcs_ea_label` (TEXT, null)
- `unit_weight_mode` (TEXT, not null, default `fixed`)  
  Enum: `fixed`, `formula`, `choice`
- `unit_weight_value` (DECIMAL(12,4), null)
- `unit_weight_formula_code` (TEXT, null)  
  Công thức text (biến `A`, `B`, `C`, toán tử `+ - * / ( )`)
- `unit_weight_option_id` (FK -> `unit_weight_options.id`, null, ON DELETE SET NULL)
- `unit_weight_note` (TEXT, null)
- `deleted_at` (DATETIME, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Indexes:
- unique index on `material_group_name`
- index on `unit_weight_option_id`

Business note:
- `spec_label` chuẩn dạng `A*B*C`, trong đó `A` có thể là text hoặc số.
- Khi tính công thức, nếu `A` chứa text + số (ví dụ `Ø8`) thì parser lấy phần số (`8`) để tính.
- `use_lami_for_calc = 1` thì cộng thêm `lami_calc_value` vào kết quả Unit Weight.

### 3.5.1 `unit_weight_options`
Columns:
- `id` (PK)
- `option_group` (TEXT, not null)
- `option_label` (TEXT, not null)
- `unit_weight_value` (DECIMAL(12,4), not null)
- `deleted_at` (DATETIME, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Constraints:
- Unique: (`option_group`, `option_label`)

Indexes:
- `idx_uwo_group_label` on (`option_group`, `option_label`)

### 3.6 `product_print_versions`
Mục đích: lưu mỗi lần upload ảnh cho product như một phiên bản.

Columns:
- `id` (PK)
- `product_id` (FK -> `products.id`, not null, ON DELETE CASCADE)
- `version_no` (INTEGER, not null)
- `upload_note` (TEXT, null)
- `deleted_at` (DATETIME, null)
- `created_by` (TEXT, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Constraints:
- Unique: (`product_id`, `version_no`)
- Check: `version_no > 0`

Indexes:
- `idx_ppv_product_id` on (`product_id`)
- `idx_ppv_product_version` on (`product_id`, `version_no`)

Versioning rule (quan trọng):
- `version_no` không nhập tay.
- Mỗi lần user upload 1 batch ảnh mới cho product:
  - backend lấy `max(version_no)` của product
  - `new_version = max + 1` (nếu chưa có thì = 1)
  - tạo bản ghi `product_print_versions` mới.
- Mỗi version gắn với `product_id`; từ `product_id` truy ra `products.product_code` để quản lý theo từng product code.

### 3.7 `product_print_images`
Mục đích: lưu từng ảnh thuộc một version.

Columns:
- `id` (PK)
- `product_print_version_id` (FK -> `product_print_versions.id`, not null, ON DELETE CASCADE)
- `image_url` (TEXT, not null)
- `file_name` (TEXT, null)
- `mime_type` (TEXT, null)
- `file_size` (INTEGER, null)
- `width_px` (INTEGER, null)
- `height_px` (INTEGER, null)
- `sort_order` (INTEGER, not null, default 1)
- `deleted_at` (DATETIME, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Constraints:
- Unique (khuyến nghị): (`product_print_version_id`, `sort_order`)

Indexes:
- `idx_ppi_version_id` on (`product_print_version_id`)
- `idx_ppi_version_sort` on (`product_print_version_id`, `sort_order`)

### 3.8 `production_plans`
Columns:
- `id` (PK)
- `customer_id` (FK -> `customers.id`, not null, ON DELETE RESTRICT)
- `product_id` (FK -> `products.id`, not null, ON DELETE RESTRICT)
- `lot_no` (TEXT, not null)
- `etd` (DATE, null)
- `eta` (DATE, null)
- `contp_date` (DATE, null)
- `order_qty_pcs` (INTEGER, not null, default 0)
- `spec_inner_snapshot` (TEXT, null)
- `liner_snapshot` (TEXT, null)
- `print_snapshot` (TEXT, null)
- `label` (TEXT, null)
- `sewing_type` (TEXT, null)
- `packing` (TEXT, null)
- `status` (TEXT, not null, default `draft`)
- `update_person` (TEXT, null)
- `deleted_at` (DATETIME, null)
- `created_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Constraints:
- Unique: (`lot_no`, `product_id`)
- Check: `order_qty_pcs >= 0`

Indexes:
- `idx_plans_customer_id` on (`customer_id`)
- `idx_plans_product_id` on (`product_id`)
- `idx_plans_lot_no` on (`lot_no`)
- `idx_plans_status` on (`status`)
- `idx_plans_etd` on (`etd`)

## 4. Relationships
- `users (1) -> (N) auth_tokens`
- `customers (1) -> (N) products`
- `products (1) -> (N) product_specs`
- `items (1) -> (N) product_specs`
- `material_groups (1) -> (N) product_specs`
- `unit_weight_options (1) -> (N) material_groups`
- `products (1) -> (N) product_print_versions`
- `product_print_versions (1) -> (N) product_print_images`
- `customers (1) -> (N) production_plans`
- `products (1) -> (N) production_plans`

App-level validation:
- `production_plans.customer_id` phải khớp `products.customer_id` của product đã chọn.
- Tất cả list query mặc định thêm điều kiện `deleted_at IS NULL`.
- DELETE API dùng soft delete, không hard delete.
- User management chỉ role `admin` được quyền CRUD users và gán role.
- Import Excel customers:
  - Chỉ hỗ trợ file `.xlsx`, sheet `Customers`.
  - Chỉ thêm mới (không update).
  - Reject dòng lỗi theo các rule: trùng `customer_code`, trùng `email`, trùng `phone`.
  - API trả về số bản ghi tạo mới + danh sách dòng lỗi và lý do.
- Import Excel material groups:
  - Chỉ hỗ trợ file `.xlsx`, sheet `Item`.
  - Parse cột `MaterialGroup`, `Spec`, `PCS (EA)` từ mẫu Excel.
  - Upsert theo `material_group_name` (có thì update, chưa có thì tạo mới).
  - Dữ liệu import không có cấu hình unit weight:
    - `unit_weight_mode = fixed`
    - `unit_weight_value = 0`
- Import Excel products:
  - Chỉ hỗ trợ file `.xlsx`, sheet `Products`.
  - Bắt buộc có `CustomerCode`, `Productname`, `Productcode`.
  - Hỗ trợ thêm cột `SewingType` và `Print` (nếu có trong file).
  - Chỉ thêm mới (không update sản phẩm đã có).
  - `top/bottom` được chuẩn hóa: loại prefix `phi/Ø` khi lưu DB.
  - Reject dòng lỗi theo các rule: `CustomerCode` không tồn tại, trùng `Productcode`, thiếu cột bắt buộc.
  - API trả về `created/skipped/failed_count` + danh sách dòng lỗi.
- Import Excel product specs:
  - Chỉ hỗ trợ file `.xlsx`, sheet `Products_S`.
  - API theo product: `POST /api/products/{id}/specs/import-excel`.
  - Mỗi dòng spec phải có `Item` và `MaterialGroup`.
  - `ProductCode` trong file (nếu có) phải khớp sản phẩm đang import.
  - `line_no` unique trong phạm vi 1 product (reject nếu trùng).
  - API trả về `created/skipped/failed_count` + danh sách dòng lỗi.

## 5. Suggested SQLAlchemy Model Skeleton

```python
class ProductPrintVersion(Base):
    __tablename__ = "product_print_versions"
    id = Column(Integer, primary_key=True)
    product_id = Column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    version_no = Column(Integer, nullable=False)
    upload_note = Column(Text, nullable=True)
    created_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("product_id", "version_no", name="uq_product_print_version"),
        Index("idx_ppv_product_version", "product_id", "version_no"),
        CheckConstraint("version_no > 0", name="ck_ppv_version_no_positive"),
    )
```

```python
class ProductPrintImage(Base):
    __tablename__ = "product_print_images"
    id = Column(Integer, primary_key=True)
    product_print_version_id = Column(
        ForeignKey("product_print_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    image_url = Column(Text, nullable=False)
    file_name = Column(String(255), nullable=True)
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    width_px = Column(Integer, nullable=True)
    height_px = Column(Integer, nullable=True)
    sort_order = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("product_print_version_id", "sort_order", name="uq_ppi_version_sort"),
        Index("idx_ppi_version_sort", "product_print_version_id", "sort_order"),
    )
```

```python
# Service pseudo-code: create version from upload batch
def create_print_version_from_upload(session: Session, product_id: int, files: list, user: str):
    with session.begin():
        last = session.execute(
            select(func.max(ProductPrintVersion.version_no)).where(ProductPrintVersion.product_id == product_id)
        ).scalar() or 0
        version = ProductPrintVersion(product_id=product_id, version_no=last + 1, created_by=user)
        session.add(version)
        session.flush()  # lấy version.id

        for idx, f in enumerate(files, start=1):
            url = upload_to_storage(f)
            session.add(ProductPrintImage(
                product_print_version_id=version.id,
                image_url=url,
                file_name=f.filename,
                mime_type=getattr(f, "content_type", None),
                file_size=getattr(f, "size", None),
                sort_order=idx,
            ))
        session.execute(
            update(Product).where(Product.id == product_id).values(has_print_assets=True)
        )
    return version
```

## 6. Import Notes from Excel
- Không dùng import Excel cho print images; print images được tạo bằng upload batch ảnh.
- Khi upload batch ảnh cho 1 product:
  - tạo bản ghi `product_print_versions` mới với `version_no = max + 1`
  - tạo nhiều bản ghi `product_print_images` tương ứng.
