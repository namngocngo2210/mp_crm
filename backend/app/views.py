from __future__ import annotations

import ast
import json
import os
import re
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from sqlalchemy import func, select, update

from .auth import login_with_username_password, require_auth
from .db import get_session
from .models import (
    Customer,
    Item,
    MaterialGroup,
    UnitWeightOption,
    Product,
    ProductPrintImage,
    ProductPrintVersion,
    ProductSpec,
    ProductionPlan,
    User,
    AuthToken,
)
from .utils import fmt_date, fmt_datetime, parse_date, to_num


def _body(request: HttpRequest):
    if not request.body:
        return {}
    return json.loads(request.body.decode("utf-8"))


def _str_or_none(v):
    if v is None:
        return None
    text = str(v).strip()
    return text if text else None


def _num_or_zero(v):
    if v is None:
        return 0
    if isinstance(v, str):
        raw = v.strip()
        if not raw:
            return 0
        raw = raw.replace(",", "")
        try:
            return float(raw)
        except ValueError:
            return 0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0


def _norm_text(v: str | None) -> str:
    return (v or "").strip().lower()


def _norm_phone(v: str | None) -> str:
    return "".join((v or "").split()).lower()


def _upper_or_none(v):
    text = _str_or_none(v)
    return text.upper() if text else None


SPEC_ABC_PATTERN = re.compile(r"^\s*[^*]+\s*\*\s*\d+(?:\.\d+)?\s*\*\s*\d+(?:\.\d+)?\s*$")
FORMULA_ALLOWED_PATTERN = re.compile(r"^[A-Za-z0-9_+\-*/().\s]+$")
A_NUMBER_PATTERN = re.compile(r"[-+]?\d+(?:\.\d+)?")
PHI_TO_DIAMETER_PATTERN = re.compile(r"phi(?=\s*\d)|\bphi\b", re.IGNORECASE)


def _normalize_phi_text(v):
    text = _str_or_none(v)
    if text is None:
        return None
    normalized = text.replace("Φ", "Ø").replace("ø", "Ø")
    normalized = PHI_TO_DIAMETER_PATTERN.sub("Ø", normalized)
    normalized = re.sub(r"Ø\s+(?=\d)", "Ø", normalized)
    return normalized


def _normalize_diameter_value(v):
    text = _str_or_none(v)
    if text is None:
        return None
    return re.sub(r"^\s*(?:phi|ø|Ø)\s*", "", text, flags=re.IGNORECASE)


def _normalize_spec_abc(v):
    text = _str_or_none(v)
    if text is None:
        return None
    if not SPEC_ABC_PATTERN.match(text):
        return None
    parts = [p.strip() for p in text.split("*")]
    parts[0] = _normalize_phi_text(parts[0]) or parts[0]
    return "*".join(parts)


def _normalize_number_text(v):
    text = _str_or_none(v)
    if text is None:
        return None
    normalized = text.replace(",", "")
    try:
        float(normalized)
        return normalized
    except (TypeError, ValueError):
        return None


def _parse_spec_abc(v: str | None):
    text = _str_or_none(v)
    if not text or not SPEC_ABC_PATTERN.match(text):
        return None
    parts = [p.strip() for p in text.split("*")]
    if len(parts) != 3:
        return None
    a_match = A_NUMBER_PATTERN.search(parts[0] or "")
    if a_match:
        try:
            a_num = float(a_match.group(0))
        except (TypeError, ValueError):
            a_num = None
    else:
        a_num = None
    try:
        b = float(parts[1])
        c = float(parts[2])
    except (TypeError, ValueError):
        return None
    return {"a_text": parts[0], "a_num": a_num, "b": b, "c": c}


def _validate_formula_expr(expr: str | None) -> str | None:
    text = _str_or_none(expr)
    if text is None:
        return None
    if not FORMULA_ALLOWED_PATTERN.match(text):
        return None
    try:
        node = ast.parse(text, mode="eval")
    except Exception:
        return None

    allowed_nodes = (
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Name,
        ast.Load,
        ast.Constant,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.USub,
        ast.UAdd,
    )
    for child in ast.walk(node):
        if not isinstance(child, allowed_nodes):
            return None
        if isinstance(child, ast.Name) and child.id.upper() not in {"A", "B", "C"}:
            return None
        if isinstance(child, ast.Constant) and not isinstance(child.value, (int, float)):
            return None
    return text


def _evaluate_formula_expr(expr: str, vars_map: dict[str, float]):
    parsed = ast.parse(expr, mode="eval")

    def eval_node(node):
        if isinstance(node, ast.Expression):
            return eval_node(node.body)
        if isinstance(node, ast.Constant):
            return float(node.value)
        if isinstance(node, ast.Name):
            key = node.id.upper()
            if key not in vars_map:
                raise ValueError("Unknown variable")
            return float(vars_map[key])
        if isinstance(node, ast.UnaryOp):
            v = eval_node(node.operand)
            if isinstance(node.op, ast.USub):
                return -v
            if isinstance(node.op, ast.UAdd):
                return v
            raise ValueError("Unsupported unary op")
        if isinstance(node, ast.BinOp):
            left = eval_node(node.left)
            right = eval_node(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                if right == 0:
                    raise ZeroDivisionError("division by zero")
                return left / right
            raise ValueError("Unsupported bin op")
        raise ValueError("Unsupported expression")

    return eval_node(parsed)


def _compute_unit_weight(
    mode: str | None,
    fixed_value,
    formula_expr: str | None,
    spec_value: str | None,
    choice_value=None,
    use_lami_for_calc: bool = False,
    lami_calc_value=None,
):
    normalized_mode = (mode or "fixed").strip().lower()
    result = None
    if normalized_mode == "fixed":
        if fixed_value is None:
            return None
        try:
            result = float(fixed_value)
        except (TypeError, ValueError):
            return None

    elif normalized_mode == "choice":
        if choice_value is None:
            return None
        try:
            result = float(choice_value)
        except (TypeError, ValueError):
            return None

    elif normalized_mode != "formula":
        return None
    else:
        expr = _validate_formula_expr(formula_expr)
        if not expr:
            return None
        parsed = _parse_spec_abc(spec_value)
        if not parsed:
            return None
        vars_map = {
            "B": parsed["b"],
            "C": parsed["c"],
        }
        if parsed["a_num"] is not None:
            vars_map["A"] = parsed["a_num"]
        try:
            result = float(_evaluate_formula_expr(expr, vars_map))
        except Exception:
            return None

    if use_lami_for_calc:
        try:
            lami_value = float(lami_calc_value)
        except (TypeError, ValueError):
            return None
        result = result + lami_value
    return result


def _xlsx_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    path = "xl/sharedStrings.xml"
    if path not in zf.namelist():
        return []
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ET.fromstring(zf.read(path))
    out: list[str] = []
    for si in root.findall("a:si", ns):
        out.append("".join(t.text or "" for t in si.findall(".//a:t", ns)))
    return out


def _xlsx_sheet_rows(file_path: str, sheet_name: str) -> list[list[str | None]]:
    ns = {
        "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
    }
    with zipfile.ZipFile(file_path) as zf:
        wb = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels.findall("{http://schemas.openxmlformats.org/package/2006/relationships}Relationship")
        }
        shared_strings = _xlsx_shared_strings(zf)

        target = None
        for sh in wb.findall("a:sheets/a:sheet", ns):
            if sh.attrib.get("name") == sheet_name:
                rid = sh.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
                rel_target = rel_map[rid]
                target = rel_target if rel_target.startswith("xl/") else f"xl/{rel_target.lstrip('/')}"
                break
        if not target:
            raise ValueError(f"Không tìm thấy sheet '{sheet_name}'")

        ws = ET.fromstring(zf.read(target))
        rows: list[list[str | None]] = []
        for row in ws.findall("a:sheetData/a:row", ns):
            cells: dict[int, str | None] = {}
            max_col = 0
            for cell in row.findall("a:c", ns):
                ref = cell.attrib.get("r", "")
                col_letters = "".join(ch for ch in ref if ch.isalpha())
                col_index = 0
                for ch in col_letters:
                    col_index = col_index * 26 + (ord(ch.upper()) - ord("A") + 1)
                if col_index <= 0:
                    continue
                max_col = max(max_col, col_index)

                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    is_node = cell.find("a:is", ns)
                    value = "".join(t.text or "" for t in is_node.findall(".//a:t", ns)) if is_node is not None else None
                else:
                    v = cell.find("a:v", ns)
                    value = v.text if v is not None else None
                    if cell_type == "s" and value is not None and value.isdigit():
                        idx = int(value)
                        value = shared_strings[idx] if 0 <= idx < len(shared_strings) else value
                cells[col_index] = value

            if max_col == 0:
                rows.append([])
                continue
            rows.append([cells.get(i) for i in range(1, max_col + 1)])
        return rows


def _ok(data, status=200):
    return JsonResponse(data, status=status, safe=False)


def _now() -> datetime:
    return datetime.now()


def _active(model):
    return model.deleted_at.is_(None)


def _is_admin(user: User) -> bool:
    return user.role == "admin"


def _forbidden():
    return _ok({"detail": "Bạn không có quyền thực hiện thao tác này"}, 403)


def serialize_user(u: User):
    return {
        "id": u.id,
        "username": u.username,
        "full_name": u.full_name,
        "avatar_url": u.avatar_url,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": fmt_datetime(u.created_at),
        "updated_at": fmt_datetime(u.updated_at),
    }


def serialize_customer(c: Customer):
    return {
        "id": c.id,
        "customer_code": c.customer_code,
        "customer_name": c.customer_name,
        "address": c.address,
        "contact_person": c.contact_person,
        "phone": c.phone,
        "email": c.email,
        "production_2025": to_num(c.production_2025),
        "production_2026": to_num(c.production_2026),
        "in_production": to_num(c.in_production),
        "level": c.level,
        "created_at": fmt_datetime(c.created_at),
        "updated_at": fmt_datetime(c.updated_at),
    }


def serialize_product(p: Product):
    return {
        "id": p.id,
        "customer_id": p.customer_id,
        "product_code": p.product_code,
        "product_name": p.product_name,
        "swl": p.swl,
        "type": p.type,
        "sewing_type": p.sewing_type,
        "print": p.print,
        "spec_other": p.spec_other,
        "spec_inner": p.spec_inner,
        "color": p.color,
        "liner": p.liner,
        "has_print_assets": p.has_print_assets,
        "top": p.top,
        "bottom": p.bottom,
        "packing": p.packing,
        "other_note": p.other_note,
        "created_at": fmt_datetime(p.created_at),
        "updated_at": fmt_datetime(p.updated_at),
    }


def serialize_item(i: Item):
    return {
        "id": i.id,
        "item_name": i.item_name,
        "item_color": i.item_color,
        "created_at": fmt_datetime(i.created_at),
        "updated_at": fmt_datetime(i.updated_at),
    }


def serialize_spec(s: ProductSpec):
    return {
        "id": s.id,
        "product_id": s.product_id,
        "item_id": s.item_id,
        "material_group_id": s.material_group_id,
        "line_no": s.line_no,
        "item_name": s.item.item_name if s.item else None,
        "material_group": s.material_group.material_group_name if s.material_group else None,
        "spec": s.spec,
        "item_size": s.item_size,
        "lami": s.lami,
        "item_color": s.item_color,
        "unit_weight_kg": to_num(s.unit_weight_kg),
        "qty_m_or_m2": to_num(s.qty_m_or_m2),
        "pcs_ea": to_num(s.pcs_ea),
        "wt_kg": to_num(s.wt_kg),
        "other_note": s.other_note,
        "is_manual_weight": s.is_manual_weight,
        "created_at": fmt_datetime(s.created_at),
        "updated_at": fmt_datetime(s.updated_at),
    }


def _get_or_create_item(session, item_name: str | None) -> Item | None:
    name = _str_or_none(item_name)
    if not name:
        return None
    item = session.scalar(select(Item).where(Item.item_name == name))
    if item:
        if item.deleted_at:
            item.deleted_at = None
            session.add(item)
        return item
    item = Item(item_name=name)
    session.add(item)
    session.flush()
    return item


def _get_or_create_material_group(session, name: str | None) -> MaterialGroup | None:
    mg_name = _str_or_none(name)
    if not mg_name:
        return None
    mg = session.scalar(select(MaterialGroup).where(MaterialGroup.material_group_name == mg_name))
    if mg:
        if mg.deleted_at:
            mg.deleted_at = None
            session.add(mg)
        return mg
    mg = MaterialGroup(material_group_name=mg_name)
    session.add(mg)
    session.flush()
    return mg


def serialize_plan(p: ProductionPlan):
    return {
        "id": p.id,
        "customer_id": p.customer_id,
        "product_id": p.product_id,
        "lot_no": p.lot_no,
        "etd": fmt_date(p.etd),
        "eta": fmt_date(p.eta),
        "contp_date": fmt_date(p.contp_date),
        "order_qty_pcs": p.order_qty_pcs,
        "spec_inner_snapshot": p.spec_inner_snapshot,
        "liner_snapshot": p.liner_snapshot,
        "print_snapshot": p.print_snapshot,
        "label": p.label,
        "sewing_type": p.sewing_type,
        "packing": p.packing,
        "status": p.status,
        "update_person": p.update_person,
        "created_at": fmt_datetime(p.created_at),
        "updated_at": fmt_datetime(p.updated_at),
    }


def serialize_version(v: ProductPrintVersion):
    return {
        "id": v.id,
        "product_id": v.product_id,
        "version_no": v.version_no,
        "upload_note": v.upload_note,
        "created_by": v.created_by,
        "created_at": fmt_datetime(v.created_at),
        "updated_at": fmt_datetime(v.updated_at),
    }


def serialize_image(i: ProductPrintImage):
    return {
        "id": i.id,
        "product_print_version_id": i.product_print_version_id,
        "image_url": i.image_url,
        "file_name": i.file_name,
        "mime_type": i.mime_type,
        "file_size": i.file_size,
        "width_px": i.width_px,
        "height_px": i.height_px,
        "sort_order": i.sort_order,
        "created_at": fmt_datetime(i.created_at),
        "updated_at": fmt_datetime(i.updated_at),
    }


def serialize_material_group(mg: MaterialGroup):
    effective_unit_weight_value = (
        mg.unit_weight_option.unit_weight_value
        if mg.unit_weight_mode == "choice" and mg.unit_weight_option is not None
        else mg.unit_weight_value
    )
    computed_unit_weight = _compute_unit_weight(
        mg.unit_weight_mode,
        mg.unit_weight_value,
        mg.unit_weight_formula_code,
        mg.spec_label,
        mg.unit_weight_option.unit_weight_value if mg.unit_weight_option is not None else None,
        mg.use_lami_for_calc,
        mg.lami_calc_value,
    )
    return {
        "id": mg.id,
        "material_group_name": mg.material_group_name,
        "spec_label": mg.spec_label,
        "has_lami": mg.has_lami,
        "use_lami_for_calc": mg.use_lami_for_calc,
        "lami_calc_value": to_num(mg.lami_calc_value),
        "pcs_ea_label": mg.pcs_ea_label,
        "unit_weight_mode": mg.unit_weight_mode,
        "unit_weight_value": to_num(effective_unit_weight_value),
        "unit_weight_formula_code": mg.unit_weight_formula_code,
        "unit_weight_formula": mg.unit_weight_formula_code,
        "unit_weight_option_id": mg.unit_weight_option_id,
        "unit_weight_option_label": mg.unit_weight_option.option_label if mg.unit_weight_option else None,
        "unit_weight_option_group": mg.unit_weight_option.option_group if mg.unit_weight_option else None,
        "unit_weight_computed": to_num(computed_unit_weight),
        "unit_weight_note": mg.unit_weight_note,
        "created_at": fmt_datetime(mg.created_at),
        "updated_at": fmt_datetime(mg.updated_at),
    }


def serialize_unit_weight_option(item: UnitWeightOption):
    return {
        "id": item.id,
        "option_group": item.option_group,
        "option_label": item.option_label,
        "unit_weight_value": to_num(item.unit_weight_value),
        "created_at": fmt_datetime(item.created_at),
        "updated_at": fmt_datetime(item.updated_at),
    }


def soft_delete_customer(session, customer_id: int):
    ts = _now()
    product_ids = session.scalars(
        select(Product.id).where(Product.customer_id == customer_id, _active(Product))
    ).all()

    if product_ids:
        version_ids = session.scalars(
            select(ProductPrintVersion.id).where(ProductPrintVersion.product_id.in_(product_ids), _active(ProductPrintVersion))
        ).all()
        if version_ids:
            session.execute(
                update(ProductPrintImage)
                .where(ProductPrintImage.product_print_version_id.in_(version_ids), _active(ProductPrintImage))
                .values(deleted_at=ts)
            )
            session.execute(
                update(ProductPrintVersion)
                .where(ProductPrintVersion.id.in_(version_ids), _active(ProductPrintVersion))
                .values(deleted_at=ts)
            )

        session.execute(
            update(ProductSpec).where(ProductSpec.product_id.in_(product_ids), _active(ProductSpec)).values(deleted_at=ts)
        )
        session.execute(update(Product).where(Product.id.in_(product_ids), _active(Product)).values(deleted_at=ts))
        session.execute(
            update(ProductionPlan)
            .where(ProductionPlan.product_id.in_(product_ids), _active(ProductionPlan))
            .values(deleted_at=ts)
        )

    session.execute(
        update(ProductionPlan)
        .where(ProductionPlan.customer_id == customer_id, _active(ProductionPlan))
        .values(deleted_at=ts)
    )
    session.execute(update(Customer).where(Customer.id == customer_id).values(deleted_at=ts))


def soft_delete_product(session, product_id: int):
    ts = _now()
    version_ids = session.scalars(
        select(ProductPrintVersion.id).where(ProductPrintVersion.product_id == product_id, _active(ProductPrintVersion))
    ).all()
    if version_ids:
        session.execute(
            update(ProductPrintImage)
            .where(ProductPrintImage.product_print_version_id.in_(version_ids), _active(ProductPrintImage))
            .values(deleted_at=ts)
        )
        session.execute(
            update(ProductPrintVersion)
            .where(ProductPrintVersion.id.in_(version_ids), _active(ProductPrintVersion))
            .values(deleted_at=ts)
        )

    session.execute(update(ProductSpec).where(ProductSpec.product_id == product_id, _active(ProductSpec)).values(deleted_at=ts))
    session.execute(
        update(ProductionPlan).where(ProductionPlan.product_id == product_id, _active(ProductionPlan)).values(deleted_at=ts)
    )
    session.execute(update(Product).where(Product.id == product_id).values(deleted_at=ts))


def soft_delete_print_version(session, version_id: int):
    ts = _now()
    session.execute(
        update(ProductPrintImage)
        .where(ProductPrintImage.product_print_version_id == version_id, _active(ProductPrintImage))
        .values(deleted_at=ts)
    )
    session.execute(update(ProductPrintVersion).where(ProductPrintVersion.id == version_id).values(deleted_at=ts))


@csrf_exempt
def health(_request: HttpRequest):
    return _ok({"status": "ok"})


@csrf_exempt
def login(request: HttpRequest):
    if request.method != "POST":
        return _ok({"detail": "Method not allowed"}, 405)
    body = _body(request)
    username = (body.get("username") or "").strip()
    password = (body.get("password") or "").strip()
    result = login_with_username_password(username, password)
    if not result:
        return _ok({"detail": "Tên đăng nhập hoặc mật khẩu không đúng"}, 401)
    token, user = result
    return _ok({"token": token, "user": user})


@csrf_exempt
@require_auth
def me(request: HttpRequest):
    if request.method != "GET":
        return _ok({"detail": "Method not allowed"}, 405)
    u = request.current_user
    return _ok(serialize_user(u))


@csrf_exempt
@require_auth
def me_update(request: HttpRequest):
    if request.method != "PUT":
        return _ok({"detail": "Method not allowed"}, 405)
    body = _body(request)
    with get_session() as session:
        item = session.scalar(select(User).where(User.id == request.current_user.id, _active(User)))
        if not item:
            return _ok({"detail": "Not found"}, 404)
        if "full_name" in body:
            item.full_name = body.get("full_name")
        if "avatar_url" in body:
            item.avatar_url = body.get("avatar_url")
        if "role" in body:
            if not _is_admin(request.current_user):
                return _forbidden()
            if body.get("role") not in {"admin", "manager", "staff"}:
                return _ok({"detail": "Role không hợp lệ"}, 400)
            item.role = body.get("role")
        session.add(item)
        session.flush()
        return _ok(serialize_user(item))


@csrf_exempt
@require_auth
def change_password(request: HttpRequest):
    if request.method != "PUT":
        return _ok({"detail": "Method not allowed"}, 405)
    body = _body(request)
    current_password = (body.get("current_password") or "").strip()
    new_password = (body.get("new_password") or "").strip()
    if len(new_password) < 6:
        return _ok({"detail": "Mật khẩu mới tối thiểu 6 ký tự"}, 400)
    with get_session() as session:
        item = session.scalar(select(User).where(User.id == request.current_user.id, _active(User)))
        if not item:
            return _ok({"detail": "Not found"}, 404)
        if not check_password(current_password, item.password_hash):
            return _ok({"detail": "Mật khẩu hiện tại không đúng"}, 400)
        item.password_hash = make_password(new_password)
        session.add(item)
        session.flush()
        return _ok({"success": True})


@csrf_exempt
@require_auth
def logout(request: HttpRequest):
    if request.method != "POST":
        return _ok({"detail": "Method not allowed"}, 405)
    auth = request.headers.get("Authorization", "")
    token_value = auth.replace("Token ", "", 1).strip() if auth.startswith("Token ") else ""
    if not token_value:
        return _ok({"success": True})
    with get_session() as session:
        token = session.scalar(select(AuthToken).where(AuthToken.token == token_value))
        if token:
            session.delete(token)
    return _ok({"success": True})


@csrf_exempt
@require_auth
def users(request: HttpRequest):
    if not _is_admin(request.current_user):
        return _forbidden()
    with get_session() as session:
        if request.method == "GET":
            search = (request.GET.get("search") or "").strip()
            q = select(User).where(_active(User))
            if search:
                like = f"%{search}%"
                q = q.where((User.username.ilike(like)) | (User.full_name.ilike(like)))
            rows = session.scalars(q.order_by(User.id.desc())).all()
            return _ok([serialize_user(r) for r in rows])
        if request.method == "POST":
            body = _body(request)
            username = (body.get("username") or "").strip()
            password = (body.get("password") or "").strip()
            role = (body.get("role") or "staff").strip()
            if not username or not password:
                return _ok({"detail": "Thiếu username/password"}, 400)
            if role not in {"admin", "manager", "staff"}:
                return _ok({"detail": "Role không hợp lệ"}, 400)
            exists = session.scalar(select(User).where(User.username == username, _active(User)))
            if exists:
                return _ok({"detail": "Username đã tồn tại"}, 400)
            item = User(
                username=username,
                password_hash=make_password(password),
                full_name=body.get("full_name"),
                avatar_url=body.get("avatar_url"),
                role=role,
                is_active=bool(body.get("is_active", True)),
            )
            session.add(item)
            session.flush()
            return _ok(serialize_user(item), 201)
    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def user_detail(request: HttpRequest, user_id: int):
    if not _is_admin(request.current_user):
        return _forbidden()
    with get_session() as session:
        item = session.scalar(select(User).where(User.id == user_id, _active(User)))
        if not item:
            return _ok({"detail": "Not found"}, 404)
        if request.method == "GET":
            return _ok(serialize_user(item))
        if request.method == "PUT":
            body = _body(request)
            if "username" in body:
                username = (body.get("username") or "").strip()
                if not username:
                    return _ok({"detail": "Username không hợp lệ"}, 400)
                dup = session.scalar(select(User).where(User.username == username, User.id != item.id, _active(User)))
                if dup:
                    return _ok({"detail": "Username đã tồn tại"}, 400)
                item.username = username
            if "password" in body and body.get("password"):
                item.password_hash = make_password(body.get("password"))
            if "full_name" in body:
                item.full_name = body.get("full_name")
            if "avatar_url" in body:
                item.avatar_url = body.get("avatar_url")
            if "role" in body:
                role = body.get("role")
                if role not in {"admin", "manager", "staff"}:
                    return _ok({"detail": "Role không hợp lệ"}, 400)
                item.role = role
            if "is_active" in body:
                item.is_active = bool(body.get("is_active"))
            session.add(item)
            session.flush()
            return _ok(serialize_user(item))
        if request.method == "DELETE":
            if item.username == "admin":
                return _ok({"detail": "Không thể xóa tài khoản admin mặc định"}, 400)
            item.deleted_at = _now()
            item.is_active = False
            session.add(item)
            tokens = session.scalars(select(AuthToken).where(AuthToken.user_id == item.id)).all()
            for tk in tokens:
                session.delete(tk)
            session.flush()
            return _ok({"success": True})
    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def customers(request: HttpRequest):
    with get_session() as session:
        if request.method == "GET":
            search = (request.GET.get("search") or "").strip()
            q = select(Customer).where(_active(Customer))
            if search:
                like = f"%{search}%"
                q = q.where(
                    (Customer.customer_code.ilike(like))
                    | (Customer.customer_name.ilike(like))
                    | (Customer.phone.ilike(like))
                    | (Customer.email.ilike(like))
                )
            rows = session.scalars(q.order_by(Customer.id.desc())).all()
            return _ok([serialize_customer(r) for r in rows])

        if request.method == "POST":
            body = _body(request)
            item = Customer(
                customer_code=body["customer_code"],
                customer_name=body["customer_name"],
                address=body.get("address"),
                contact_person=body.get("contact_person"),
                phone=body.get("phone"),
                email=body.get("email"),
                production_2025=body.get("production_2025") or 0,
                production_2026=body.get("production_2026") or 0,
                in_production=body.get("in_production") or 0,
                level=body.get("level"),
            )
            session.add(item)
            session.flush()
            return _ok(serialize_customer(item), 201)

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def customers_import_excel(request: HttpRequest):
    if request.method != "POST":
        return _ok({"detail": "Method not allowed"}, 405)

    excel_file = request.FILES.get("file")
    if not excel_file:
        return _ok({"detail": "Thiếu file Excel"}, 400)
    if not excel_file.name.lower().endswith(".xlsx"):
        return _ok({"detail": "Chỉ hỗ trợ file .xlsx"}, 400)

    tmp_dir = Path(settings.MEDIA_ROOT) / "tmp_import"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{uuid.uuid4().hex}.xlsx"
    with tmp_path.open("wb+") as dst:
        for chunk in excel_file.chunks():
            dst.write(chunk)

    try:
        rows = _xlsx_sheet_rows(str(tmp_path), "Customers")
    except ValueError as ex:
        tmp_path.unlink(missing_ok=True)
        return _ok({"detail": str(ex)}, 400)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        return _ok({"detail": "Không đọc được file Excel"}, 400)
    finally:
        tmp_path.unlink(missing_ok=True)

    if not rows:
        return _ok({"detail": "Sheet Customers không có dữ liệu"}, 400)

    headers = [(_str_or_none(v) or "") for v in rows[0]]
    idx = {h.strip().lower(): i for i, h in enumerate(headers) if h}
    required = {"customercode", "customername"}
    if not required.issubset(set(idx.keys())):
        return _ok({"detail": "Thiếu cột bắt buộc CustomerCode/CustomerName"}, 400)

    def val(row_values: list[str | None], key: str):
        pos = idx.get(key)
        if pos is None or pos >= len(row_values):
            return None
        return row_values[pos]

    created = 0
    skipped = 0
    failed: list[dict] = []

    with get_session() as session:
        existing_rows = session.execute(select(Customer.customer_code, Customer.email, Customer.phone, Customer.deleted_at)).all()
        existing_codes = {_norm_text(r[0]) for r in existing_rows if r[0]}
        existing_emails = {_norm_text(r[1]) for r in existing_rows if r[1] and r[3] is None}
        existing_phones = {_norm_phone(r[2]) for r in existing_rows if r[2] and r[3] is None}

        seen_codes: set[str] = set()
        seen_emails: set[str] = set()
        seen_phones: set[str] = set()

        for line_no, row in enumerate(rows[1:], start=2):
            code = _str_or_none(val(row, "customercode"))
            name = _str_or_none(val(row, "customername"))
            email = _str_or_none(val(row, "email"))
            phone = _str_or_none(val(row, "phone"))

            if not code and not name:
                skipped += 1
                continue
            reasons: list[str] = []
            if not code:
                reasons.append("Thiếu mã khách hàng")
            if not name:
                reasons.append("Thiếu tên khách hàng")

            code_key = _norm_text(code)
            email_key = _norm_text(email)
            phone_key = _norm_phone(phone)

            if code_key and (code_key in existing_codes or code_key in seen_codes):
                reasons.append("Trùng mã khách hàng")
            if email_key and (email_key in existing_emails or email_key in seen_emails):
                reasons.append("Trùng email")
            if phone_key and (phone_key in existing_phones or phone_key in seen_phones):
                reasons.append("Trùng số điện thoại")

            if reasons:
                failed.append(
                    {
                        "row": line_no,
                        "customer_code": code,
                        "customer_name": name,
                        "reasons": reasons,
                    }
                )
                continue

            payload = {
                "customer_code": code,
                "customer_name": name,
                "address": _str_or_none(val(row, "address")),
                "contact_person": _str_or_none(val(row, "contactperson")),
                "phone": phone,
                "email": email,
                "production_2025": _num_or_zero(val(row, "production_2025")),
                "production_2026": _num_or_zero(val(row, "production_2026")),
                "in_production": _num_or_zero(val(row, "in_production")),
                "level": _str_or_none(val(row, "level")),
            }
            session.add(Customer(**payload))
            created += 1
            seen_codes.add(code_key)
            if email_key:
                seen_emails.add(email_key)
            if phone_key:
                seen_phones.add(phone_key)

        session.flush()

    return _ok(
        {
            "success": True,
            "created": created,
            "skipped": skipped,
            "failed_count": len(failed),
            "failed": failed[:200],
        }
    )


@csrf_exempt
@require_auth
def customer_detail(request: HttpRequest, item_id: int):
    with get_session() as session:
        item = session.scalar(select(Customer).where(Customer.id == item_id, _active(Customer)))
        if not item:
            return _ok({"detail": "Not found"}, 404)

        if request.method == "GET":
            return _ok(serialize_customer(item))

        if request.method == "PUT":
            body = _body(request)
            for f in [
                "customer_code",
                "customer_name",
                "address",
                "contact_person",
                "phone",
                "email",
                "production_2025",
                "production_2026",
                "in_production",
                "level",
            ]:
                if f in body:
                    setattr(item, f, body[f])
            session.add(item)
            session.flush()
            return _ok(serialize_customer(item))

        if request.method == "DELETE":
            soft_delete_customer(session, item.id)
            return _ok({"success": True})

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def unit_weight_options(request: HttpRequest):
    with get_session() as session:
        if request.method == "GET":
            rows = session.scalars(
                select(UnitWeightOption)
                .where(_active(UnitWeightOption))
                .order_by(UnitWeightOption.option_group.asc(), UnitWeightOption.option_label.asc())
            ).all()
            return _ok([serialize_unit_weight_option(r) for r in rows])

        if request.method == "POST":
            body = _body(request)
            option_group = _str_or_none(body.get("option_group"))
            option_label = _str_or_none(body.get("option_label"))
            value_text = _normalize_number_text(body.get("unit_weight_value"))
            if not option_group:
                return _ok({"detail": "Thiếu option_group"}, 400)
            if not option_label:
                return _ok({"detail": "Thiếu option_label"}, 400)
            if value_text is None:
                return _ok({"detail": "unit_weight_value phải là số"}, 400)

            existing = session.scalar(
                select(UnitWeightOption).where(
                    UnitWeightOption.option_group == option_group,
                    UnitWeightOption.option_label == option_label,
                )
            )
            if existing and existing.deleted_at is None:
                return _ok({"detail": "Option đã tồn tại"}, 400)
            if existing and existing.deleted_at is not None:
                existing.deleted_at = None
                existing.unit_weight_value = value_text
                session.add(existing)
                session.flush()
                return _ok(serialize_unit_weight_option(existing))

            row = UnitWeightOption(
                option_group=option_group,
                option_label=option_label,
                unit_weight_value=value_text,
            )
            session.add(row)
            session.flush()
            return _ok(serialize_unit_weight_option(row), 201)

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def unit_weight_option_detail(request: HttpRequest, item_id: int):
    with get_session() as session:
        row = session.scalar(select(UnitWeightOption).where(UnitWeightOption.id == item_id, _active(UnitWeightOption)))
        if not row:
            return _ok({"detail": "Not found"}, 404)

        if request.method == "PUT":
            body = _body(request)
            option_group = _str_or_none(body.get("option_group"))
            option_label = _str_or_none(body.get("option_label"))
            value_text = _normalize_number_text(body.get("unit_weight_value"))
            if not option_group:
                return _ok({"detail": "Thiếu option_group"}, 400)
            if not option_label:
                return _ok({"detail": "Thiếu option_label"}, 400)
            if value_text is None:
                return _ok({"detail": "unit_weight_value phải là số"}, 400)

            dup = session.scalar(
                select(UnitWeightOption).where(
                    UnitWeightOption.option_group == option_group,
                    UnitWeightOption.option_label == option_label,
                    UnitWeightOption.id != row.id,
                    _active(UnitWeightOption),
                )
            )
            if dup:
                return _ok({"detail": "Option đã tồn tại"}, 400)

            row.option_group = option_group
            row.option_label = option_label
            row.unit_weight_value = value_text
            session.add(row)
            session.flush()
            return _ok(serialize_unit_weight_option(row))

        if request.method == "DELETE":
            in_use = session.scalar(
                select(func.count())
                .select_from(MaterialGroup)
                .where(MaterialGroup.unit_weight_option_id == row.id, _active(MaterialGroup))
            )
            if in_use and int(in_use) > 0:
                return _ok({"detail": "Option đang được sử dụng trong Material Group"}, 400)
            row.deleted_at = _now()
            session.add(row)
            session.flush()
            return _ok({"success": True})

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def material_groups(request: HttpRequest):
    with get_session() as session:
        if request.method == "GET":
            rows = session.scalars(
                select(MaterialGroup).where(_active(MaterialGroup)).order_by(MaterialGroup.material_group_name.asc())
            ).all()
            return _ok([serialize_material_group(r) for r in rows])

        if request.method == "POST":
            body = _body(request)
            name = _str_or_none(body.get("material_group_name"))
            if not name:
                return _ok({"detail": "Thiếu tên material group"}, 400)
            raw_spec = _str_or_none(body.get("spec_label"))
            raw_pcs = _str_or_none(body.get("pcs_ea_label"))
            spec_label = _normalize_spec_abc(raw_spec)
            pcs_ea_label = _normalize_number_text(raw_pcs)
            if raw_spec and not spec_label:
                return _ok({"detail": "Spec phải đúng định dạng A*B*C (A là text hoặc số, B và C là số)"}, 400)
            if raw_pcs and pcs_ea_label is None:
                return _ok({"detail": "PCS (EA) phải là số"}, 400)
            has_lami = bool(body.get("has_lami"))
            use_lami_for_calc = bool(body.get("use_lami_for_calc")) and has_lami
            lami_calc_value = _str_or_none(body.get("lami_calc_value"))
            if use_lami_for_calc:
                lami_calc_value = _normalize_number_text(lami_calc_value)
                if lami_calc_value is None:
                    return _ok({"detail": "Lami calc value phải là số"}, 400)
            else:
                lami_calc_value = None
            unit_weight_mode = (_str_or_none(body.get("unit_weight_mode")) or "fixed").lower()
            raw_unit_weight = _str_or_none(body.get("unit_weight_value"))
            unit_weight_value = _normalize_number_text(raw_unit_weight) if raw_unit_weight is not None else None
            unit_weight_formula_code = _str_or_none(body.get("unit_weight_formula")) or _str_or_none(
                body.get("unit_weight_formula_code")
            )
            unit_weight_option_id = body.get("unit_weight_option_id")
            unit_weight_note = _str_or_none(body.get("unit_weight_note"))
            if unit_weight_mode not in {"fixed", "formula", "choice"}:
                return _ok({"detail": "unit_weight_mode không hợp lệ"}, 400)
            if unit_weight_mode == "fixed":
                if raw_unit_weight is None or unit_weight_value is None:
                    return _ok({"detail": "Unit Weight (fixed) phải là số"}, 400)
                unit_weight_formula_code = None
                unit_weight_option_id = None
            elif unit_weight_mode == "choice":
                if not unit_weight_option_id:
                    return _ok({"detail": "Thiếu unit_weight_option_id"}, 400)
                option = session.scalar(select(UnitWeightOption).where(UnitWeightOption.id == int(unit_weight_option_id), _active(UnitWeightOption)))
                if not option:
                    return _ok({"detail": "unit_weight_option_id không hợp lệ"}, 400)
                unit_weight_value = None
                unit_weight_formula_code = None
                unit_weight_option_id = option.id
            else:
                unit_weight_formula_code = _validate_formula_expr(unit_weight_formula_code)
                if not unit_weight_formula_code:
                    return _ok({"detail": "Công thức Unit Weight không hợp lệ. Chỉ dùng A/B/C, số và + - * / ( )"}, 400)
                unit_weight_value = None
                unit_weight_option_id = None
            payload = {
                "spec_label": spec_label,
                "has_lami": has_lami,
                "use_lami_for_calc": use_lami_for_calc,
                "lami_calc_value": lami_calc_value,
                "pcs_ea_label": pcs_ea_label,
                "unit_weight_mode": unit_weight_mode,
                "unit_weight_value": unit_weight_value,
                "unit_weight_formula_code": unit_weight_formula_code,
                "unit_weight_option_id": unit_weight_option_id,
                "unit_weight_note": unit_weight_note,
            }
            existing = session.scalar(select(MaterialGroup).where(MaterialGroup.material_group_name == name))
            if existing and existing.deleted_at is None:
                return _ok({"detail": "Material group đã tồn tại"}, 400)
            if existing and existing.deleted_at is not None:
                existing.deleted_at = None
                existing.spec_label = payload["spec_label"]
                existing.has_lami = payload["has_lami"]
                existing.use_lami_for_calc = payload["use_lami_for_calc"]
                existing.lami_calc_value = payload["lami_calc_value"]
                existing.pcs_ea_label = payload["pcs_ea_label"]
                existing.unit_weight_mode = payload["unit_weight_mode"]
                existing.unit_weight_value = payload["unit_weight_value"]
                existing.unit_weight_formula_code = payload["unit_weight_formula_code"]
                existing.unit_weight_option_id = payload["unit_weight_option_id"]
                existing.unit_weight_note = payload["unit_weight_note"]
                session.add(existing)
                session.flush()
                return _ok(serialize_material_group(existing))

            item = MaterialGroup(
                material_group_name=name,
                spec_label=payload["spec_label"],
                has_lami=payload["has_lami"],
                use_lami_for_calc=payload["use_lami_for_calc"],
                lami_calc_value=payload["lami_calc_value"],
                pcs_ea_label=payload["pcs_ea_label"],
                unit_weight_mode=payload["unit_weight_mode"],
                unit_weight_value=payload["unit_weight_value"],
                unit_weight_formula_code=payload["unit_weight_formula_code"],
                unit_weight_option_id=payload["unit_weight_option_id"],
                unit_weight_note=payload["unit_weight_note"],
            )
            session.add(item)
            session.flush()
            return _ok(serialize_material_group(item), 201)

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def material_group_detail(request: HttpRequest, item_id: int):
    with get_session() as session:
        item = session.scalar(select(MaterialGroup).where(MaterialGroup.id == item_id, _active(MaterialGroup)))
        if not item:
            return _ok({"detail": "Not found"}, 404)

        if request.method == "PUT":
            body = _body(request)
            name = _str_or_none(body.get("material_group_name"))
            if not name:
                return _ok({"detail": "Thiếu tên material group"}, 400)
            raw_spec = _str_or_none(body.get("spec_label"))
            raw_pcs = _str_or_none(body.get("pcs_ea_label"))
            spec_label = _normalize_spec_abc(raw_spec)
            pcs_ea_label = _normalize_number_text(raw_pcs)
            if raw_spec and not spec_label:
                return _ok({"detail": "Spec phải đúng định dạng A*B*C (A là text hoặc số, B và C là số)"}, 400)
            if raw_pcs and pcs_ea_label is None:
                return _ok({"detail": "PCS (EA) phải là số"}, 400)
            has_lami = bool(body.get("has_lami"))
            use_lami_for_calc = bool(body.get("use_lami_for_calc")) and has_lami
            lami_calc_value = _str_or_none(body.get("lami_calc_value"))
            if use_lami_for_calc:
                lami_calc_value = _normalize_number_text(lami_calc_value)
                if lami_calc_value is None:
                    return _ok({"detail": "Lami calc value phải là số"}, 400)
            else:
                lami_calc_value = None
            unit_weight_mode = (_str_or_none(body.get("unit_weight_mode")) or "fixed").lower()
            raw_unit_weight = _str_or_none(body.get("unit_weight_value"))
            unit_weight_value = _normalize_number_text(raw_unit_weight) if raw_unit_weight is not None else None
            unit_weight_formula_code = _str_or_none(body.get("unit_weight_formula")) or _str_or_none(
                body.get("unit_weight_formula_code")
            )
            unit_weight_option_id = body.get("unit_weight_option_id")
            unit_weight_note = _str_or_none(body.get("unit_weight_note"))
            if unit_weight_mode not in {"fixed", "formula", "choice"}:
                return _ok({"detail": "unit_weight_mode không hợp lệ"}, 400)
            if unit_weight_mode == "fixed":
                if raw_unit_weight is None or unit_weight_value is None:
                    return _ok({"detail": "Unit Weight (fixed) phải là số"}, 400)
                unit_weight_formula_code = None
                unit_weight_option_id = None
            elif unit_weight_mode == "choice":
                if not unit_weight_option_id:
                    return _ok({"detail": "Thiếu unit_weight_option_id"}, 400)
                option = session.scalar(select(UnitWeightOption).where(UnitWeightOption.id == int(unit_weight_option_id), _active(UnitWeightOption)))
                if not option:
                    return _ok({"detail": "unit_weight_option_id không hợp lệ"}, 400)
                unit_weight_value = None
                unit_weight_formula_code = None
                unit_weight_option_id = option.id
            else:
                unit_weight_formula_code = _validate_formula_expr(unit_weight_formula_code)
                if not unit_weight_formula_code:
                    return _ok({"detail": "Công thức Unit Weight không hợp lệ. Chỉ dùng A/B/C, số và + - * / ( )"}, 400)
                unit_weight_value = None
                unit_weight_option_id = None

            dup = session.scalar(
                select(MaterialGroup).where(
                    MaterialGroup.material_group_name == name,
                    MaterialGroup.id != item.id,
                    _active(MaterialGroup),
                )
            )
            if dup:
                return _ok({"detail": "Material group đã tồn tại"}, 400)

            item.material_group_name = name
            item.spec_label = spec_label
            item.has_lami = has_lami
            item.use_lami_for_calc = use_lami_for_calc
            item.lami_calc_value = lami_calc_value
            item.pcs_ea_label = pcs_ea_label
            item.unit_weight_mode = unit_weight_mode
            item.unit_weight_value = unit_weight_value
            item.unit_weight_formula_code = unit_weight_formula_code
            item.unit_weight_option_id = unit_weight_option_id
            item.unit_weight_note = unit_weight_note
            session.add(item)
            session.flush()
            return _ok(serialize_material_group(item))

        if request.method == "DELETE":
            in_use = session.scalar(
                select(func.count())
                .select_from(ProductSpec)
                .where(ProductSpec.material_group_id == item.id, _active(ProductSpec))
            )
            if in_use and int(in_use) > 0:
                return _ok({"detail": "Material group đang được sử dụng trong Product Specs"}, 400)
            item.deleted_at = _now()
            session.add(item)
            session.flush()
            return _ok({"success": True})

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def items(request: HttpRequest):
    with get_session() as session:
        if request.method == "GET":
            search = (request.GET.get("search") or "").strip()
            q = select(Item).where(_active(Item))
            if search:
                like = f"%{search}%"
                q = q.where(Item.item_name.ilike(like))
            rows = session.scalars(q.order_by(Item.item_name.asc())).all()
            return _ok([serialize_item(r) for r in rows])

        if request.method == "POST":
            body = _body(request)
            item_name = _str_or_none(body.get("item_name"))
            item_color = _str_or_none(body.get("item_color"))
            if not item_name:
                return _ok({"detail": "Thiếu item_name"}, 400)
            existing = session.scalar(select(Item).where(Item.item_name == item_name))
            if existing and existing.deleted_at is None:
                return _ok({"detail": "Item đã tồn tại"}, 400)
            if existing and existing.deleted_at is not None:
                existing.deleted_at = None
                existing.item_color = item_color
                session.add(existing)
                session.flush()
                return _ok(serialize_item(existing))
            obj = Item(item_name=item_name, item_color=item_color)
            session.add(obj)
            session.flush()
            return _ok(serialize_item(obj), 201)
    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def item_detail(request: HttpRequest, item_id: int):
    with get_session() as session:
        item = session.scalar(select(Item).where(Item.id == item_id, _active(Item)))
        if not item:
            return _ok({"detail": "Not found"}, 404)
        if request.method == "PUT":
            body = _body(request)
            item_name = _str_or_none(body.get("item_name"))
            item_color = _str_or_none(body.get("item_color"))
            if not item_name:
                return _ok({"detail": "Thiếu item_name"}, 400)
            dup = session.scalar(select(Item).where(Item.item_name == item_name, Item.id != item.id, _active(Item)))
            if dup:
                return _ok({"detail": "Item đã tồn tại"}, 400)
            item.item_name = item_name
            item.item_color = item_color
            session.add(item)
            session.flush()
            return _ok(serialize_item(item))
        if request.method == "DELETE":
            item.deleted_at = _now()
            session.add(item)
            session.flush()
            return _ok({"success": True})
    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def material_groups_import_excel(request: HttpRequest):
    if request.method != "POST":
        return _ok({"detail": "Method not allowed"}, 405)
    excel_file = request.FILES.get("file")
    if not excel_file:
        return _ok({"detail": "Thiếu file Excel"}, 400)
    if not excel_file.name.lower().endswith(".xlsx"):
        return _ok({"detail": "Chỉ hỗ trợ file .xlsx"}, 400)

    tmp_dir = Path(settings.MEDIA_ROOT) / "tmp_import"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{uuid.uuid4().hex}.xlsx"
    with tmp_path.open("wb+") as dst:
        for chunk in excel_file.chunks():
            dst.write(chunk)

    try:
        rows = _xlsx_sheet_rows(str(tmp_path), "Item")
    except Exception:
        tmp_path.unlink(missing_ok=True)
        return _ok({"detail": "Không đọc được sheet Item"}, 400)
    finally:
        tmp_path.unlink(missing_ok=True)

    created = 0
    updated = 0
    skipped = 0
    with get_session() as session:
        for row in rows[1:]:
            if len(row) < 10:
                skipped += 1
                continue
            mg_name = _str_or_none(row[9] if len(row) > 9 else None)
            if not mg_name:
                skipped += 1
                continue
            spec_label = _str_or_none(row[10] if len(row) > 10 else None)
            pcs_ea_label = _str_or_none(row[16] if len(row) > 16 else None)

            existing = session.scalar(select(MaterialGroup).where(MaterialGroup.material_group_name == mg_name))
            if existing:
                existing.deleted_at = None
                existing.spec_label = spec_label
                existing.pcs_ea_label = pcs_ea_label
                if not existing.unit_weight_mode:
                    existing.unit_weight_mode = "fixed"
                if existing.unit_weight_mode == "fixed" and existing.unit_weight_value is None:
                    existing.unit_weight_value = 0
                session.add(existing)
                updated += 1
            else:
                session.add(
                    MaterialGroup(
                        material_group_name=mg_name,
                        spec_label=spec_label,
                        pcs_ea_label=pcs_ea_label,
                        unit_weight_mode="fixed",
                        unit_weight_value=0,
                    )
                )
                created += 1
        session.flush()

    return _ok({"success": True, "created": created, "updated": updated, "skipped": skipped})


@csrf_exempt
@require_auth
def products(request: HttpRequest):
    with get_session() as session:
        if request.method == "GET":
            search = (request.GET.get("search") or "").strip()
            q = select(Product).where(_active(Product))
            if search:
                like = f"%{search}%"
                q = q.where((Product.product_code.ilike(like)) | (Product.product_name.ilike(like)))
            customer_id = request.GET.get("customer_id")
            if customer_id:
                q = q.where(Product.customer_id == int(customer_id))
            rows = session.scalars(q.order_by(Product.id.desc())).all()
            return _ok([serialize_product(r) for r in rows])

        if request.method == "POST":
            body = _body(request)
            customer = session.scalar(select(Customer).where(Customer.id == body["customer_id"], _active(Customer)))
            if not customer:
                return _ok({"detail": "Customer không tồn tại hoặc đã xóa"}, 400)
            item = Product(
                customer_id=body["customer_id"],
                product_code=body["product_code"],
                product_name=body["product_name"],
                swl=body.get("swl"),
                type=_upper_or_none(body.get("type")),
                sewing_type=_upper_or_none(body.get("sewing_type")),
                print=_norm_text(body.get("print")),
                spec_other=body.get("spec_other"),
                spec_inner=body.get("spec_inner"),
                color=body.get("color"),
                liner=body.get("liner"),
                top=_normalize_diameter_value(body.get("top")),
                bottom=_normalize_diameter_value(body.get("bottom")),
                packing=body.get("packing"),
                other_note=body.get("other_note"),
            )
            session.add(item)
            session.flush()
            return _ok(serialize_product(item), 201)

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def products_import_excel(request: HttpRequest):
    if request.method != "POST":
        return _ok({"detail": "Method not allowed"}, 405)

    excel_file = request.FILES.get("file")
    if not excel_file:
        return _ok({"detail": "Thiếu file Excel"}, 400)
    if not excel_file.name.lower().endswith(".xlsx"):
        return _ok({"detail": "Chỉ hỗ trợ file .xlsx"}, 400)

    tmp_dir = Path(settings.MEDIA_ROOT) / "tmp_import"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{uuid.uuid4().hex}.xlsx"
    with tmp_path.open("wb+") as dst:
        for chunk in excel_file.chunks():
            dst.write(chunk)

    try:
        rows = _xlsx_sheet_rows(str(tmp_path), "Products")
    except Exception:
        tmp_path.unlink(missing_ok=True)
        return _ok({"detail": "Không đọc được sheet Products"}, 400)
    finally:
        tmp_path.unlink(missing_ok=True)

    if not rows:
        return _ok({"detail": "Sheet Products không có dữ liệu"}, 400)

    headers = [(_str_or_none(v) or "") for v in rows[0]]
    idx = {h.strip().lower(): i for i, h in enumerate(headers) if h}
    required = {"customercode", "productname", "productcode"}
    if not required.issubset(set(idx.keys())):
        return _ok({"detail": "Thiếu cột bắt buộc CustomerCode/Productname/Productcode"}, 400)

    def val(row_values: list[str | None], key: str):
        pos = idx.get(key)
        if pos is None or pos >= len(row_values):
            return None
        return row_values[pos]

    created = 0
    skipped = 0
    failed: list[dict] = []
    with get_session() as session:
        customers = session.scalars(select(Customer).where(_active(Customer))).all()
        customer_map = {_norm_text(c.customer_code): c for c in customers}
        existing_codes = {
            _norm_text(code)
            for code in session.scalars(select(Product.product_code).where(_active(Product))).all()
            if code
        }
        seen_codes: set[str] = set()

        for line_no, row in enumerate(rows[1:], start=2):
            customer_code = _str_or_none(val(row, "customercode"))
            product_name = _str_or_none(val(row, "productname"))
            product_code = _str_or_none(val(row, "productcode"))

            if not customer_code and not product_name and not product_code:
                skipped += 1
                continue

            reasons: list[str] = []
            if not customer_code:
                reasons.append("Thiếu mã khách hàng")
            if not product_name:
                reasons.append("Thiếu tên sản phẩm")
            if not product_code:
                reasons.append("Thiếu mã sản phẩm")

            customer = customer_map.get(_norm_text(customer_code))
            if customer_code and not customer:
                reasons.append("Không tìm thấy CustomerCode")

            code_key = _norm_text(product_code)
            if code_key and (code_key in existing_codes or code_key in seen_codes):
                reasons.append("Trùng mã sản phẩm")

            if reasons:
                failed.append(
                    {
                        "row": line_no,
                        "customer_code": customer_code,
                        "product_code": product_code,
                        "product_name": product_name,
                        "reasons": reasons,
                    }
                )
                continue

            session.add(
                Product(
                    customer_id=customer.id,
                    product_code=product_code,
                    product_name=product_name,
                    swl=_str_or_none(val(row, "s.w.l")),
                    type=_upper_or_none(val(row, "type")),
                    sewing_type=_upper_or_none(val(row, "sewingtype")),
                    print=_norm_text(val(row, "print")),
                    spec_other=_str_or_none(val(row, "specother")),
                    spec_inner=_str_or_none(val(row, "specinner")),
                    color=_str_or_none(val(row, "color")),
                    liner=_str_or_none(val(row, "liner")),
                    top=_normalize_diameter_value(val(row, "top")),
                    bottom=_normalize_diameter_value(val(row, "bottom")),
                    packing=_str_or_none(val(row, "packing")),
                    other_note=_str_or_none(val(row, "other")),
                )
            )
            created += 1
            seen_codes.add(code_key)

        session.flush()

    return _ok(
        {
            "success": True,
            "created": created,
            "skipped": skipped,
            "failed_count": len(failed),
            "failed": failed[:200],
        }
    )


@csrf_exempt
@require_auth
def product_specs_import_excel(request: HttpRequest, product_id: int):
    if request.method != "POST":
        return _ok({"detail": "Method not allowed"}, 405)

    excel_file = request.FILES.get("file")
    if not excel_file:
        return _ok({"detail": "Thiếu file Excel"}, 400)
    if not excel_file.name.lower().endswith(".xlsx"):
        return _ok({"detail": "Chỉ hỗ trợ file .xlsx"}, 400)

    tmp_dir = Path(settings.MEDIA_ROOT) / "tmp_import"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{uuid.uuid4().hex}.xlsx"
    with tmp_path.open("wb+") as dst:
        for chunk in excel_file.chunks():
            dst.write(chunk)

    rows = None
    try:
        for sheet_name in ["Products_S", "Product_Specs", "Product Specs", "Products S"]:
            try:
                rows = _xlsx_sheet_rows(str(tmp_path), sheet_name)
                break
            except ValueError:
                continue
    except Exception:
        tmp_path.unlink(missing_ok=True)
        return _ok({"detail": "Không đọc được file Excel"}, 400)
    finally:
        tmp_path.unlink(missing_ok=True)

    if rows is None:
        return _ok({"detail": "Không tìm thấy sheet Products_S"}, 400)
    if not rows:
        return _ok({"detail": "Sheet Products_S không có dữ liệu"}, 400)

    def norm_header(v: str | None) -> str:
        raw = _str_or_none(v) or ""
        return "".join(ch for ch in raw.lower() if ch.isalnum())

    headers = [norm_header(v) for v in rows[0]]
    idx = {h: i for i, h in enumerate(headers) if h}

    aliases = {
        "product_code": ["productcode"],
        "line_no": ["lineno", "line", "no"],
        "item_name": ["itemname", "item"],
        "material_group": ["materialgroup", "materialgroupname"],
        "spec": ["spec"],
        "item_size": ["itemsize"],
        "lami": ["lami"],
        "item_color": ["itemcolor"],
        "unit_weight_kg": ["unitweightkg", "unitweight"],
        "qty_m_or_m2": ["qtymorm2", "qty"],
        "pcs_ea": ["pcsea", "pcs"],
        "wt_kg": ["wtkg", "wt"],
        "other_note": ["other", "othernote"],
    }

    def header_index(name: str) -> int | None:
        for key in aliases[name]:
            if key in idx:
                return idx[key]
        return None

    if header_index("item_name") is None or header_index("material_group") is None:
        return _ok({"detail": "Thiếu cột bắt buộc Item/MaterialGroup"}, 400)

    def val(row_values: list[str | None], name: str):
        pos = header_index(name)
        if pos is None or pos >= len(row_values):
            return None
        return row_values[pos]

    def num_or_none(v):
        raw = _str_or_none(v)
        if raw is None:
            return None
        try:
            return float(raw.replace(",", ""))
        except ValueError:
            return None

    with get_session() as session:
        product = session.scalar(select(Product).where(Product.id == product_id, _active(Product)))
        if not product:
            return _ok({"detail": "Product không tồn tại hoặc đã xóa"}, 404)

        max_line_no = session.scalar(
            select(func.max(ProductSpec.line_no)).where(ProductSpec.product_id == product_id, _active(ProductSpec))
        ) or 0
        existing_line_nos = set(
            session.scalars(
                select(ProductSpec.line_no).where(ProductSpec.product_id == product_id, _active(ProductSpec))
            ).all()
        )

        created = 0
        skipped = 0
        failed: list[dict] = []
        seen_line_nos: set[int] = set()

        for line_no, row in enumerate(rows[1:], start=2):
            product_code = _str_or_none(val(row, "product_code"))
            item_name = _str_or_none(val(row, "item_name"))
            material_group_name = _str_or_none(val(row, "material_group"))
            line_value = _str_or_none(val(row, "line_no"))

            if not product_code and not item_name and not material_group_name and not line_value:
                skipped += 1
                continue

            reasons: list[str] = []

            if product_code and _norm_text(product_code) != _norm_text(product.product_code):
                reasons.append("ProductCode không khớp sản phẩm đang chọn")
            if not item_name:
                reasons.append("Thiếu Item")
            if not material_group_name:
                reasons.append("Thiếu MaterialGroup")

            if line_value:
                try:
                    spec_line_no = int(float(line_value))
                    if spec_line_no <= 0:
                        reasons.append("LineNo phải lớn hơn 0")
                except ValueError:
                    spec_line_no = None
                    reasons.append("LineNo không hợp lệ")
            else:
                max_line_no += 1
                spec_line_no = max_line_no

            if spec_line_no and (spec_line_no in existing_line_nos or spec_line_no in seen_line_nos):
                reasons.append("Trùng LineNo trong sản phẩm")

            unit_weight_kg = num_or_none(val(row, "unit_weight_kg"))
            qty_m_or_m2 = num_or_none(val(row, "qty_m_or_m2"))
            pcs_ea = num_or_none(val(row, "pcs_ea"))
            wt_kg = num_or_none(val(row, "wt_kg"))

            if _str_or_none(val(row, "unit_weight_kg")) and unit_weight_kg is None:
                reasons.append("Unit Weight(kg) không hợp lệ")
            if _str_or_none(val(row, "qty_m_or_m2")) and qty_m_or_m2 is None:
                reasons.append("Q'ty(m or m2) không hợp lệ")
            if _str_or_none(val(row, "pcs_ea")) and pcs_ea is None:
                reasons.append("PCS(EA) không hợp lệ")
            if _str_or_none(val(row, "wt_kg")) and wt_kg is None:
                reasons.append("WT (kg) không hợp lệ")

            if reasons:
                failed.append(
                    {
                        "row": line_no,
                        "product_code": product_code or product.product_code,
                        "line_no": spec_line_no,
                        "item_name": item_name,
                        "material_group": material_group_name,
                        "reasons": reasons,
                    }
                )
                continue

            item = _get_or_create_item(session, item_name)
            material_group = _get_or_create_material_group(session, material_group_name)
            if not item or not material_group or not spec_line_no:
                failed.append(
                    {
                        "row": line_no,
                        "product_code": product_code or product.product_code,
                        "line_no": spec_line_no,
                        "item_name": item_name,
                        "material_group": material_group_name,
                        "reasons": ["Không tạo được Item hoặc MaterialGroup"],
                    }
                )
                continue

            session.add(
                ProductSpec(
                    product_id=product_id,
                    item_id=item.id,
                    material_group_id=material_group.id,
                    line_no=spec_line_no,
                    spec=_str_or_none(val(row, "spec")),
                    item_size=_str_or_none(val(row, "item_size")),
                    lami=_str_or_none(val(row, "lami")),
                    item_color=_str_or_none(val(row, "item_color")),
                    unit_weight_kg=unit_weight_kg,
                    qty_m_or_m2=qty_m_or_m2,
                    pcs_ea=pcs_ea,
                    wt_kg=wt_kg,
                    other_note=_str_or_none(val(row, "other_note")),
                    is_manual_weight=True,
                )
            )
            created += 1
            seen_line_nos.add(spec_line_no)

        session.flush()

    return _ok(
        {
            "success": True,
            "created": created,
            "skipped": skipped,
            "failed_count": len(failed),
            "failed": failed[:200],
        }
    )


@csrf_exempt
@require_auth
def product_detail(request: HttpRequest, item_id: int):
    with get_session() as session:
        item = session.scalar(select(Product).where(Product.id == item_id, _active(Product)))
        if not item:
            return _ok({"detail": "Not found"}, 404)

        if request.method == "GET":
            return _ok(serialize_product(item))

        if request.method == "PUT":
            body = _body(request)
            if "customer_id" in body:
                customer = session.scalar(select(Customer).where(Customer.id == body["customer_id"], _active(Customer)))
                if not customer:
                    return _ok({"detail": "Customer không tồn tại hoặc đã xóa"}, 400)
            for f in [
                "customer_id",
                "product_code",
                "product_name",
                "swl",
                "type",
                "sewing_type",
                "print",
                "spec_other",
                "spec_inner",
                "color",
                "liner",
                "top",
                "bottom",
                "packing",
                "other_note",
            ]:
                if f in body:
                    if f in {"type", "sewing_type"}:
                        setattr(item, f, _upper_or_none(body[f]))
                    elif f == "print":
                        setattr(item, f, _norm_text(body[f]))
                    elif f in {"top", "bottom"}:
                        setattr(item, f, _normalize_diameter_value(body[f]))
                    else:
                        setattr(item, f, body[f])
            session.add(item)
            session.flush()
            return _ok(serialize_product(item))

        if request.method == "DELETE":
            soft_delete_product(session, item.id)
            return _ok({"success": True})

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def product_specs(request: HttpRequest, product_id: int):
    with get_session() as session:
        product = session.scalar(select(Product).where(Product.id == product_id, _active(Product)))
        if not product:
            return _ok({"detail": "Product không tồn tại hoặc đã xóa"}, 404)

        if request.method == "GET":
            rows = session.scalars(
                select(ProductSpec)
                .where(ProductSpec.product_id == product_id, _active(ProductSpec))
                .order_by(ProductSpec.line_no.asc())
            ).all()
            return _ok([serialize_spec(r) for r in rows])

        if request.method == "POST":
            body = _body(request)
            item_id = body.get("item_id")
            material_group_id = body.get("material_group_id")

            item = None
            if item_id:
                item = session.scalar(select(Item).where(Item.id == int(item_id), _active(Item)))
            if not item:
                item = _get_or_create_item(session, body.get("item_name"))
            if not item:
                return _ok({"detail": "Thiếu item hoặc item không hợp lệ"}, 400)

            material_group = None
            if material_group_id:
                material_group = session.scalar(
                    select(MaterialGroup).where(MaterialGroup.id == int(material_group_id), _active(MaterialGroup))
                )
            if not material_group:
                material_group = _get_or_create_material_group(session, body.get("material_group"))
            if not material_group:
                return _ok({"detail": "Thiếu material group hoặc material group không hợp lệ"}, 400)

            raw_item_color = _str_or_none(body.get("item_color"))
            if raw_item_color in {"-", "--"}:
                raw_item_color = None

            item = ProductSpec(
                product_id=product_id,
                item_id=item.id,
                material_group_id=material_group.id,
                line_no=body.get("line_no") or 1,
                spec=body.get("spec") or material_group.spec_label,
                item_size=body.get("item_size"),
                lami=body.get("lami") or ("Yes" if material_group.has_lami else None),
                item_color=raw_item_color or item.item_color or product.color,
                unit_weight_kg=body.get("unit_weight_kg")
                if body.get("unit_weight_kg") is not None
                else _compute_unit_weight(
                    material_group.unit_weight_mode,
                    material_group.unit_weight_value,
                    material_group.unit_weight_formula_code,
                    body.get("spec") or material_group.spec_label,
                    material_group.unit_weight_option.unit_weight_value if material_group.unit_weight_option else None,
                    material_group.use_lami_for_calc,
                    material_group.lami_calc_value,
                ),
                qty_m_or_m2=body.get("qty_m_or_m2"),
                pcs_ea=body.get("pcs_ea"),
                wt_kg=body.get("wt_kg"),
                other_note=body.get("other_note"),
            )
            session.add(item)
            session.flush()
            return _ok(serialize_spec(item), 201)

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def product_spec_detail(request: HttpRequest, spec_id: int):
    with get_session() as session:
        item = session.scalar(select(ProductSpec).where(ProductSpec.id == spec_id, _active(ProductSpec)))
        if not item:
            return _ok({"detail": "Not found"}, 404)

        if request.method == "PUT":
            body = _body(request)
            recompute_weight = False
            next_material_group: MaterialGroup | None = None
            if "item_id" in body or "item_name" in body:
                next_item = None
                if body.get("item_id"):
                    next_item = session.scalar(select(Item).where(Item.id == int(body.get("item_id")), _active(Item)))
                if not next_item and "item_name" in body:
                    next_item = _get_or_create_item(session, body.get("item_name"))
                if not next_item:
                    return _ok({"detail": "item không hợp lệ"}, 400)
                item.item_id = next_item.id

            if "material_group_id" in body or "material_group" in body:
                next_mg = None
                if body.get("material_group_id"):
                    next_mg = session.scalar(
                        select(MaterialGroup).where(MaterialGroup.id == int(body.get("material_group_id")), _active(MaterialGroup))
                    )
                if not next_mg and "material_group" in body:
                    next_mg = _get_or_create_material_group(session, body.get("material_group"))
                if not next_mg:
                    return _ok({"detail": "material group không hợp lệ"}, 400)
                item.material_group_id = next_mg.id
                next_material_group = next_mg
                recompute_weight = True

            for f in [
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
            ]:
                if f in body:
                    setattr(item, f, body[f])
                    if f == "spec":
                        recompute_weight = True

            if recompute_weight and "unit_weight_kg" not in body:
                if next_material_group is None:
                    next_material_group = session.scalar(
                        select(MaterialGroup).where(MaterialGroup.id == item.material_group_id, _active(MaterialGroup))
                    )
                if next_material_group is not None:
                    choice_value = (
                        next_material_group.unit_weight_option.unit_weight_value
                        if next_material_group.unit_weight_option is not None
                        else None
                    )
                    item.unit_weight_kg = _compute_unit_weight(
                        next_material_group.unit_weight_mode,
                        next_material_group.unit_weight_value,
                        next_material_group.unit_weight_formula_code,
                        item.spec,
                        choice_value,
                        next_material_group.use_lami_for_calc,
                        next_material_group.lami_calc_value,
                    )
            session.add(item)
            session.flush()
            return _ok(serialize_spec(item))

        if request.method == "DELETE":
            item.deleted_at = _now()
            session.add(item)
            session.flush()
            return _ok({"success": True})

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def product_print_versions(request: HttpRequest, product_id: int):
    with get_session() as session:
        if request.method != "GET":
            return _ok({"detail": "Method not allowed"}, 405)
        product = session.scalar(select(Product).where(Product.id == product_id, _active(Product)))
        if not product:
            return _ok({"detail": "Product không tồn tại hoặc đã xóa"}, 404)

        rows = session.scalars(
            select(ProductPrintVersion)
            .where(ProductPrintVersion.product_id == product_id, _active(ProductPrintVersion))
            .order_by(ProductPrintVersion.version_no.desc())
        ).all()
        out = []
        for r in rows:
            count = session.scalar(
                select(func.count(ProductPrintImage.id)).where(
                    ProductPrintImage.product_print_version_id == r.id,
                    _active(ProductPrintImage),
                )
            )
            item = serialize_version(r)
            item["image_count"] = count
            out.append(item)
        return _ok(out)


@csrf_exempt
@require_auth
def product_print_upload(request: HttpRequest, product_id: int):
    if request.method != "POST":
        return _ok({"detail": "Method not allowed"}, 405)

    files = request.FILES.getlist("images")
    if not files:
        return _ok({"detail": "Không có ảnh upload"}, 400)

    upload_note = request.POST.get("upload_note")
    current_user = request.current_user

    with get_session() as session:
        product = session.scalar(select(Product).where(Product.id == product_id, _active(Product)))
        if not product:
            return _ok({"detail": "Product không tồn tại hoặc đã xóa"}, 404)

        last = session.scalar(
            select(func.max(ProductPrintVersion.version_no)).where(ProductPrintVersion.product_id == product_id, _active(ProductPrintVersion))
        ) or 0
        version = ProductPrintVersion(
            product_id=product_id,
            version_no=last + 1,
            upload_note=upload_note,
            created_by=current_user.username,
        )
        session.add(version)
        session.flush()

        target_dir = Path(settings.MEDIA_ROOT) / "print_images" / str(product_id) / str(version.version_no)
        target_dir.mkdir(parents=True, exist_ok=True)

        for i, f in enumerate(files, start=1):
            ext = Path(f.name).suffix.lower()
            file_name = f"{i:03d}_{uuid.uuid4().hex}{ext}"
            abs_path = target_dir / file_name
            with abs_path.open("wb+") as dst:
                for chunk in f.chunks():
                    dst.write(chunk)
            rel_path = os.path.relpath(abs_path, settings.MEDIA_ROOT)
            image_url = request.build_absolute_uri(settings.MEDIA_URL + rel_path.replace("\\", "/"))
            img = ProductPrintImage(
                product_print_version_id=version.id,
                image_url=image_url,
                file_name=f.name,
                mime_type=f.content_type,
                file_size=f.size,
                sort_order=i,
            )
            session.add(img)

        session.execute(update(Product).where(Product.id == product_id).values(has_print_assets=True))
        session.flush()
        return _ok(serialize_version(version), 201)


@csrf_exempt
@require_auth
def print_version_detail(request: HttpRequest, version_id: int):
    with get_session() as session:
        version = session.scalar(select(ProductPrintVersion).where(ProductPrintVersion.id == version_id, _active(ProductPrintVersion)))
        if not version:
            return _ok({"detail": "Not found"}, 404)

        if request.method == "GET":
            images = session.scalars(
                select(ProductPrintImage)
                .where(ProductPrintImage.product_print_version_id == version_id, _active(ProductPrintImage))
                .order_by(ProductPrintImage.sort_order.asc())
            ).all()
            return _ok({"version": serialize_version(version), "images": [serialize_image(i) for i in images]})

        if request.method == "DELETE":
            soft_delete_print_version(session, version_id)
            return _ok({"success": True})

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def production_plans(request: HttpRequest):
    with get_session() as session:
        if request.method == "GET":
            search = (request.GET.get("search") or "").strip()
            q = select(ProductionPlan).where(_active(ProductionPlan))
            if search:
                q = q.where(ProductionPlan.lot_no.ilike(f"%{search}%"))
            rows = session.scalars(q.order_by(ProductionPlan.id.desc())).all()
            return _ok([serialize_plan(r) for r in rows])

        if request.method == "POST":
            body = _body(request)
            customer = session.scalar(select(Customer).where(Customer.id == body["customer_id"], _active(Customer)))
            p = session.scalar(select(Product).where(Product.id == body["product_id"], _active(Product)))
            if not customer or not p or p.customer_id != int(body["customer_id"]):
                return _ok({"detail": "Product không thuộc Customer đã chọn"}, 400)
            item = ProductionPlan(
                customer_id=body["customer_id"],
                product_id=body["product_id"],
                lot_no=body["lot_no"],
                etd=parse_date(body.get("etd")),
                eta=parse_date(body.get("eta")),
                contp_date=parse_date(body.get("contp_date")),
                order_qty_pcs=body.get("order_qty_pcs") or 0,
                spec_inner_snapshot=body.get("spec_inner_snapshot"),
                liner_snapshot=body.get("liner_snapshot"),
                print_snapshot=body.get("print_snapshot"),
                label=body.get("label"),
                sewing_type=body.get("sewing_type"),
                packing=body.get("packing"),
                status=body.get("status") or "draft",
                update_person=body.get("update_person"),
            )
            session.add(item)
            session.flush()
            return _ok(serialize_plan(item), 201)

    return _ok({"detail": "Method not allowed"}, 405)


@csrf_exempt
@require_auth
def production_plan_detail(request: HttpRequest, item_id: int):
    with get_session() as session:
        item = session.scalar(select(ProductionPlan).where(ProductionPlan.id == item_id, _active(ProductionPlan)))
        if not item:
            return _ok({"detail": "Not found"}, 404)

        if request.method == "PUT":
            body = _body(request)
            for f in [
                "customer_id",
                "product_id",
                "lot_no",
                "order_qty_pcs",
                "spec_inner_snapshot",
                "liner_snapshot",
                "print_snapshot",
                "label",
                "sewing_type",
                "packing",
                "status",
                "update_person",
            ]:
                if f in body:
                    setattr(item, f, body[f])
            if "etd" in body:
                item.etd = parse_date(body.get("etd"))
            if "eta" in body:
                item.eta = parse_date(body.get("eta"))
            if "contp_date" in body:
                item.contp_date = parse_date(body.get("contp_date"))

            customer = session.scalar(select(Customer).where(Customer.id == item.customer_id, _active(Customer)))
            p = session.scalar(select(Product).where(Product.id == item.product_id, _active(Product)))
            if not customer or not p or p.customer_id != int(item.customer_id):
                return _ok({"detail": "Product không thuộc Customer đã chọn"}, 400)

            session.add(item)
            session.flush()
            return _ok(serialize_plan(item))

        if request.method == "DELETE":
            item.deleted_at = _now()
            session.add(item)
            session.flush()
            return _ok({"success": True})

    return _ok({"detail": "Method not allowed"}, 405)
