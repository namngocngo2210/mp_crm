from __future__ import annotations

import secrets
from functools import wraps

from django.contrib.auth.hashers import check_password
from django.http import JsonResponse
from sqlalchemy import select

from .db import get_session
from .models import AuthToken, User


def create_token() -> str:
    return secrets.token_hex(32)


def require_auth(view_func):
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Token "):
            return JsonResponse({"detail": "Unauthorized"}, status=401)
        token_value = auth.replace("Token ", "", 1).strip()
        with get_session() as session:
            token = session.scalar(select(AuthToken).where(AuthToken.token == token_value))
            if not token:
                return JsonResponse({"detail": "Unauthorized"}, status=401)
            user = session.scalar(
                select(User).where(User.id == token.user_id, User.is_active == True, User.deleted_at.is_(None))
            )
            if not user:
                return JsonResponse({"detail": "Unauthorized"}, status=401)
            request.current_user = user
            return view_func(request, *args, **kwargs)

    return wrapped


def login_with_username_password(username: str, password: str):
    with get_session() as session:
        user = session.scalar(
            select(User).where(User.username == username, User.is_active == True, User.deleted_at.is_(None))
        )
        if not user or not check_password(password, user.password_hash):
            return None
        token = AuthToken(token=create_token(), user_id=user.id)
        session.add(token)
        session.flush()
        user_payload = {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "role": user.role,
        }
        return token.token, user_payload
