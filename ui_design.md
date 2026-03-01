# UI Design (React TS + shadcn/ui + lucide-react)

## 1. Tech Stack & Principles
- FE: React + TypeScript
- UI library: `shadcn/ui`
- Icons: `lucide-react`
- Data: Django REST API
- i18n FE: hỗ trợ `Tiếng Việt` và `English`, mặc định `Tiếng Việt`.
- Toàn bộ text UI dùng key i18n: label, placeholder, tab/menu, toast, cột bảng.

Thiết kế tổng quan:
- Theme: Light theme.
- UI dạng `Top Navbar + Sidebar`.
- Sidebar chứa menu chính:
  - `Customers`
  - `Products`
  - `Material Group` (dropdown)
    - `Material Group`
    - `Unit Weight cố định`
  - `Item`
  - `Production Plan`
- Trong `Products`, phần print dùng upload ảnh theo version.
- `Q'ty(m or m2)`, `WT (kg)` là nhập tay.
- `Unit Weight(kg)` có thể lấy từ cấu hình `Material Group` (fixed/formula/choice) ở flow thêm Product Spec.

## 2. Information Architecture
Top-level navigation:
1. Customers
2. Products
3. Material Group
4. Item
5. Production Plan

Trong `Products > Sản phẩm`, màn hình chi tiết mở bằng **page riêng** `/products/:id`:
1. Khu vực thông tin sản phẩm ở phía trên (text readonly).
2. Khu vực phía dưới chia layout `3/4 - 1/4`:
3. Bên trái `3/4`: Product Specs.
4. Bên phải `1/4`: Print Images.

## 3. App Layout
- Header full-width: top navbar + user menu.
- Sidebar bên trái full-height, logo ở trên cùng sidebar.
- Main content bên phải: mỗi module có toolbar, bảng dữ liệu, pagination.
- Component chính: `Sidebar`, `Table`, `Modal`, `Form`, `Confirm Modal`, `Toast`.
- Content layout full-width (không giới hạn max-width), tối ưu cho màn hình lớn.

Login screen:
- Màn hình đăng nhập riêng trước khi vào app.
- Bố cục centered card, nền gradient sáng, có logo thương hiệu.
- Trường: `Username`, `Password`.
- Nút chính: `Đăng nhập`.
- Hiển thị lỗi đăng nhập ngay dưới form nếu sai thông tin.

User menu (thay cho nút đăng xuất):
- Hiển thị avatar + tên user ở góc phải header.
- Bên trái avatar/username có 2 nút cờ để đổi ngôn ngữ:
  - `🇻🇳` (vi)
  - `🇺🇸` (en)
- Click mở dropdown gồm:
  - `Tài khoản`: xem/cập nhật thông tin tài khoản, đổi mật khẩu, avatar, role (role chỉ admin có quyền sửa).
  - `Quản lí người dùng`: màn CRUD users (admin only).
  - `Đăng xuất`.

## 4. Tab Details

### 4.1 Customers
Toolbar:
- Search realtime theo `customer_code/customer_name/phone/email` (không cần nút `Tìm`, debounce ngắn).
- Nút `+ Thêm khách hàng`
- Nút `Upload Excel` nằm bên phải nút `+ Thêm khách hàng`.
- Form thêm/sửa mở bằng modal.
- Tạo/cập nhật thành công thì tự động đóng modal.
- Trạng thái rỗng bảng: hiển thị `Chưa có dữ liệu`.

Upload Excel (Customers):
- Upload file `.xlsx` theo sheet `Customers`.
- Kết quả hiển thị:
  - Số lượng thêm mới.
  - Số lượng lỗi.
  - Bảng chi tiết dòng lỗi: `Row`, `Customer Code`, `Customer Name`, `Reason`.
- Lý do lỗi chính: `Trùng mã khách hàng`, `Trùng email`, `Trùng số điện thoại`.

Table columns:
- Code, Name, Contact Person, Phone, Email, Production 2025, Production 2026, In Production, Level, Updated At, Actions
- `Actions` gồm 2 nút: `Sửa`, `Xóa` (nằm cuối bảng).

Form fields:
- code, name, address, contact_person, phone, email, production_2025, production_2026, in_production, level
- Mỗi field có label hiển thị phía trên input.
- Placeholder được lấy từ i18n (`vi/en`).

Validation:
- code required + unique
- email format (nếu có)
- production fields >= 0

### 4.2 Products > Sản phẩm
Toolbar:
- Search realtime theo `product_code/product_name` (không nút `Tìm`).
- Nút `+ Thêm sản phẩm`.
- Nút `Xóa đã chọn` (bulk delete theo checkbox).
- Form thêm/sửa dùng modal.
- Trạng thái rỗng bảng: hiển thị `Chưa có dữ liệu`.

Table columns:
- Product Code, Product Name, Customer, Type, SWL, Color, Liner, Has Print Assets, Updated At, Actions
- `Actions` gồm 3 nút: `Chi tiết`, `Sửa`, `Xóa` (nằm cuối bảng).

Product Detail (mở từ nút `Chi tiết`, hiển thị bằng page riêng):
- URL: `/products/:id`
- Bố cục:
  - Phần trên: thông tin sản phẩm readonly (text-only, không phải input disabled).
  - Phần dưới chia `3/4 - 1/4`.
  - Trái `3/4`: Product Specs.
  - Phải `1/4`: Print Images.

Product Specs (cột trái `3/4`):
 - List columns:
  - checkbox chọn dòng
  - item (map từ bảng `items`)
  - material_group (map từ bảng `material_groups`)
  - spec
  - lami
  - item_color
  - unit_weight_kg
  - qty_m_or_m2 (manual)
  - pcs_ea
  - wt_kg (manual)
 - Actions:
  - `Thêm Product Spec` (modal lớn)
  - `Xóa đã chọn` cho danh sách spec
- Có nút `Thêm Product Spec`.
- Quan hệ dữ liệu:
  - 1 spec thuộc đúng 1 item và 1 material group.
 - Rule Item Color:
   - ưu tiên `item.item_color`
   - nếu item không có màu thì dùng `product.color`.
 - Rule Item Size:
   - nếu nhập tay trong form thêm spec -> dùng giá trị nhập tay.
   - nếu để trống -> backend tự tính theo cấu hình `item`:
     - mode `fixed`:
       - fixed type `number` -> trả số
       - fixed type `A*B` -> trả text `A*B`
     - mode `formula`:
       - công thức bắt buộc dạng `(expr1)*(expr2)`
       - kết quả luôn là text `A*B` (ví dụ `101*339`)
       - nguồn dữ liệu lấy theo source field của item:
         - `spec_inner`, `liner` kỳ vọng dạng `A*B*C`
         - `top`, `bottom` kỳ vọng dạng `A*B`
 - Rule Unit Weight trong modal thêm spec:
   - mode `fixed` -> lấy `unit_weight_value`
   - mode `choice` -> lấy `unit_weight_options.unit_weight_value`
   - mode `formula` -> tính từ `spec` dạng `A*B*C` theo công thức text (`A/B/C`)
   - nếu bật `use_lami_for_calc` -> cộng thêm `lami_calc_value`

### 4.3 Products > Material Group
- Nằm trong dropdown `Material Group` ở sidebar.
- Có bảng danh sách + search + pagination.
- Có checkbox chọn dòng + nút `Xóa đã chọn`.
- Có form thêm material group (modal).
- Cấu hình thêm:
  - `has_lami` (checkbox)
  - `use_lami_for_calc` (checkbox nằm ngay dưới `has_lami`)
  - `lami_calc_value` (chỉ hiện khi bật `use_lami_for_calc`)
  - `Unit Weight Mode`: `Giá trị cố định` / `Tính theo công thức` / `Chọn theo danh sách`
  - `Unit Weight (fixed)` hoặc `Unit Weight Formula` hoặc danh sách radio `Unit Weight cố định`
  - Có preview công thức theo `spec` mẫu

Danh sách Material Group:
- Cột: Material Group, Spec, Lami, Lami Calc Value, PCS (EA), Công thức, Giá trị fixed, Giá trị cố định, Unit Weight(kg), Actions
- Cột lami hiển thị icon trạng thái (xanh/đỏ).
- Số thập phân hiển thị tối đa 5 chữ số sau dấu phẩy và tự bỏ số 0 dư cuối.

### 4.4 Products > Unit Weight cố định
- Nằm trong dropdown `Material Group` ở sidebar.
- CRUD đầy đủ cho danh sách option: `option_group`, `option_label`, `unit_weight_value`.
- Có filter theo nhóm + pagination + soft delete.

### 4.5 Products > Item
- Module riêng trong sidebar cấp 1.
- CRUD item đầy đủ:
  - Danh sách item
  - Thêm item
  - Sửa item
  - Xóa item (soft delete)
- Có search realtime + pagination.
- Có checkbox chọn dòng + nút `Xóa đã chọn`.
- Form Item Size:
  - `Item Size Mode`: `fixed` / `formula`
  - nếu `fixed`:
    - `Fixed Type`: `number` hoặc `A*B`
    - `Item Size (fixed)` nhập theo fixed type
  - nếu `formula`:
    - chọn `Source Field`: `spec_inner` / `top` / `bottom` / `liner`
    - hiển thị description định dạng theo source:
      - `spec_inner`, `liner`: `A*B*C`
      - `top`, `bottom`: `A*B`
    - nhập công thức dạng `(expr1)*(expr2)`
    - có preview source + preview kết quả tương tự Material Group

Print Images (cột phải `1/4`)
Mục tiêu:
- Mỗi lần upload 1 batch ảnh sẽ tạo `version` mới tự động.

Layout:
- Nếu chưa có ảnh: hiển thị dropzone `Drop hoặc Click to Upload`.
- Nếu đã có ảnh: chỉ hiển thị gallery ảnh.
- Không hiển thị danh sách version/số ảnh trên UI.

Upload flow:
1. User kéo thả ảnh vào dropzone hoặc click dropzone để chọn file.
2. FE tự gửi API upload batch ngay sau khi chọn file.
3. Backend tự tính `version_no = max + 1`
4. UI reload gallery ảnh.

Rules:
- Không cho nhập tay version_no
- Có thể giới hạn định dạng: jpg/png/webp
- Có thể giới hạn max file size

Delete behavior:
- Xóa 1 ảnh trong version (tùy chọn phase 2)
- Xóa cả version (xóa toàn bộ ảnh thuộc version)

### 4.6 Production Plan
Toolbar:
- Search realtime theo `lot_no` (không nút `Tìm`).
- Nút `+ Thêm kế hoạch sản xuất`.
- Nút `Xóa đã chọn`.
- Form thêm/sửa dùng modal.
- Trạng thái rỗng bảng: hiển thị `Chưa có dữ liệu`.

Table columns:
- LOT, Customer, Product, ETD, ETA, ContP Date, Order Qty (PCS), Status, Update Person, Updated At, Actions
- `Actions` gồm 2 nút: `Sửa`, `Xóa` (nằm cuối bảng).
- Có cột checkbox để chọn nhiều và xóa hàng loạt.

Form fields:
- customer, product, lot_no, etd, eta, contp_date, order_qty_pcs, spec_inner_snapshot, liner_snapshot, print_snapshot, label, sewing_type, packing, status, update_person
- Dropdown chọn `customer` và `product` dùng Select2 (searchable).
- Form thêm kế hoạch có label cho từng input/select, placeholder dùng i18n.

Validation:
- `lot_no + product` unique
- `order_qty_pcs >= 0`
- product phải thuộc customer

### 4.7 User Management (admin)
Mục tiêu: admin tạo user mới và phân quyền role.

Table columns:
- Username, Full Name, Role, Updated At, Actions
- `Actions`: `Sửa`, `Xóa` (soft delete)

Form tạo user:
- username, password, full_name, avatar_url, role
- Form có label cho từng input/select, placeholder dùng i18n.
- Form thêm/sửa dùng modal.
- Search realtime theo username/full_name (không nút `Tìm`).
- Trạng thái rỗng bảng: hiển thị `Chưa có dữ liệu`.
- Có cột checkbox + nút `Xóa đã chọn`.

Validation:
- username unique
- role thuộc `admin/manager/staff`
- chỉ admin được truy cập module này

## 5. Component Mapping (shadcn/ui)
- Navigation: `Top Navbar`, `Sidebar`, `Dropdown menu`
- Data: `Table`, `Badge`, `Pagination` (custom)
- Forms: `Form`, `Input`, `Textarea`, `Select`, `Button`
- Upload UI: `Input type=file`, `Card`, `ScrollArea`
- Overlay: `Dialog` / `Sheet`
- Confirm: `AlertDialog`
- Notifications: `Toast`

## 6. Icon Mapping (lucide-react)
- Add: `Plus`
- Edit: `Pencil`
- Delete: `Trash2`
- View: `Eye`
- Search: `Search`
- Filter: `Filter`
- Upload: `Upload`
- Open external: `ExternalLink`
- Save: `Save`

## 7. API Contracts (Suggested)

Customers:
- `GET /api/customers?search=`
- `POST /api/customers`
- `PUT /api/customers/{id}`
- `DELETE /api/customers/{id}`
- `POST /api/customers/import-excel` (multipart, field `file`)

Material Groups:
- `GET /api/material-groups`
- `POST /api/material-groups`
- `POST /api/material-groups/import-excel` (multipart, field `file`)

Unit Weight Options:
- `GET /api/unit-weight-options?search=&group=`
- `POST /api/unit-weight-options`
- `PUT /api/unit-weight-options/{id}`
- `DELETE /api/unit-weight-options/{id}`

Items:
- `GET /api/items?search=`
- `POST /api/items`
- `PUT /api/items/{id}`
- `DELETE /api/items/{id}`

Products:
- `GET /api/products?search=&customer_id=`
- `POST /api/products`
- `POST /api/products/import-excel` (multipart, field `file`)
- `GET /api/products/{id}`
- `PUT /api/products/{id}`
- `DELETE /api/products/{id}`

Product Specs:
- `GET /api/products/{id}/specs`
- `POST /api/products/{id}/specs`
- `POST /api/products/{id}/specs/import-excel` (multipart, field `file`)
- `PUT /api/product-specs/{spec_id}`
- `DELETE /api/product-specs/{spec_id}`

Print Images (version by upload batch):
- `GET /api/products/{id}/print-versions`
- `POST /api/products/{id}/print-versions/upload` (multipart, nhiều ảnh)
- `GET /api/print-versions/{version_id}`
- `DELETE /api/print-versions/{version_id}`
- `DELETE /api/print-images/{image_id}` (optional phase 2)

Production Plans:
- `GET /api/production-plans?search=`
- `POST /api/production-plans`
- `PUT /api/production-plans/{id}`
- `DELETE /api/production-plans/{id}`

## 8. UX Rules
- Tất cả bảng danh sách có pagination ở cuối bảng.
- Mặc định `10` dòng/trang, tối đa `10`.
- Có selector số dòng hiển thị (`5` hoặc `10`).
- Delete luôn có confirm dialog.
- Có bulk delete:
  - checkbox từng dòng
  - checkbox chọn tất cả trong trang hiện tại
  - nút `Xóa đã chọn`
  - confirm modal trước khi xóa.
- Upload lỗi hiển thị rõ file nào lỗi + lý do.
- Sau upload print images thành công, reload danh sách version.
- Search chạy realtime khi gõ, có debounce ngắn để giảm số request.
- Khi danh sách rỗng, hiển thị `Chưa có dữ liệu`.
- Tạm ẩn trên UI các chức năng upload Excel (trừ upload ảnh print), backend endpoint vẫn giữ.
- Chuẩn hóa ký tự vật liệu: nhập `phi` có thể được chuẩn hóa thành `Ø` khi hiển thị.
- Chuẩn hóa text tiếng Việt có dấu cho toàn bộ UI:
  - Tab: `Khách hàng`, `Sản phẩm`, `Kế hoạch sản xuất`
  - Nút: `Thêm mới`, `Lưu`, `Hủy`, `Xóa`, `Tải lên`
  - Thông báo: `Tạo thành công`, `Cập nhật thành công`, `Xóa thành công`, `Có lỗi xảy ra`
- Toast alert theo trạng thái:
  - `success`: nền xanh lá nhạt, chữ xanh đậm.
  - `error`: nền đỏ nhạt, chữ đỏ đậm.
- Tất cả thao tác `Xóa` là soft delete; dữ liệu bị xóa sẽ không hiển thị trong danh sách mặc định.
- Header có 2 nút cờ `🇻🇳/🇺🇸` bên trái avatar để đổi ngôn ngữ realtime.

## 9. Language & Column Naming Rules
- DB field name: `snake_case`.
- UI hiển thị theo ngôn ngữ đang chọn:
  - `vi`: label/cột tiếng Việt.
  - `en`: label/cột tiếng Anh.
- Quy tắc mapping: `Excel Column -> DB Field -> UI Label (i18n)`.
- Ví dụ:
  - `CustomerCode -> customer_code -> Mã khách hàng / Customer Code`
  - `Productcode -> product_code -> Mã sản phẩm / Product Code`
  - `Update_date -> updated_at -> Cập nhật lúc / Updated At`

## 10. Localization
- FE tách text qua dictionary i18n (`vi/en`), không hardcode text trong component.
- Format hiển thị:
  - Ngày: `dd-mm-yyyy`
  - Ngày giờ (`created_at`, `updated_at`/`update_date`): `dd-mm-yyyy hh:mm:ss`
  - Số lượng/số thập phân: định dạng theo locale `vi-VN`.

## 11. Out of Scope (Current Phase)
- Auto-calc weight fields.
- Chỉnh sửa ảnh (crop/rotate).
- Workflow approval/phân quyền nâng cao.
