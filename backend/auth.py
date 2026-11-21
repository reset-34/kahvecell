import hashlib
import hmac
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Annotated, Any
from uuid import uuid4

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app_security import hash_password, load_or_create_secret, verify_password
from database import DATA_DIR, get_connection

OTP_CODE = "1234"
ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 30
JWT_SECRET_PATH = DATA_DIR / ".jwt_secret"

router = APIRouter()
bearer_scheme = HTTPBearer(auto_error=False)


class UserRole(str, Enum):
    CUSTOMER = "CUSTOMER"
    SHOP_OWNER = "SHOP_OWNER"
    ADMIN = "ADMIN"


class RegisterRequest(BaseModel):
    phone_number: str = Field(min_length=10, max_length=20)
    full_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    email: str | None = Field(default=None, max_length=255)


class LoginRequest(BaseModel):
    phone_number: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=1, max_length=128)


class VerifyOtpRequest(BaseModel):
    phone_number: str = Field(min_length=10, max_length=20)
    otp_code: str = Field(pattern=r"^\d{4}$")


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class RoleUpdateRequest(BaseModel):
    role: UserRole


class UserResponse(BaseModel):
    id: int
    phone_number: str
    full_name: str
    role: UserRole


class RegisterResponse(BaseModel):
    message: str
    phone_number: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


def _normalize_phone_number(phone_number: str) -> str:
    if not re.fullmatch(r"[+0-9\s().-]+", phone_number):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Telefon numarası geçerli bir biçimde olmalıdır.",
        )

    digits = re.sub(r"\D", "", phone_number)
    if digits.startswith("0090") and len(digits) == 14:
        digits = "0" + digits[4:]
    elif digits.startswith("90") and len(digits) == 12:
        digits = "0" + digits[2:]
    elif digits.startswith("5") and len(digits) == 10:
        digits = "0" + digits

    if not re.fullmatch(r"05\d{9}", digits):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Türkiye GSM numarası 05 ile başlamalı ve 11 rakam olmalıdır.",
        )
    return digits


def _jwt_secret() -> str:
    return load_or_create_secret(JWT_SECRET_PATH, "KAHVECELL_JWT_SECRET").decode(
        "utf-8"
    )


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _create_token(
    user_id: int,
    role: str,
    token_type: str,
    expires_at: datetime,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": expires_at,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def _issue_token_pair(connection: sqlite3.Connection, user: sqlite3.Row) -> TokenResponse:
    now = datetime.now(timezone.utc)
    access_expires_at = now + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    refresh_expires_at = now + timedelta(days=REFRESH_TOKEN_DAYS)
    access_token = _create_token(
        user["id"], user["role"], "access", access_expires_at
    )
    refresh_token = _create_token(
        user["id"], user["role"], "refresh", refresh_expires_at
    )
    connection.execute(
        """
        INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
        VALUES (?, ?, ?)
        """,
        (user["id"], _token_hash(refresh_token), refresh_expires_at.isoformat()),
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_MINUTES * 60,
        user=UserResponse(
            id=user["id"],
            phone_number=user["phone_number"],
            full_name=user["full_name"],
            role=user["role"],
        ),
    )


def _decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            _jwt_secret(),
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "type", "role", "jti"]},
        )
    except jwt.InvalidTokenError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token geçersiz veya süresi dolmuş.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    if payload["type"] != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bu işlem için uygun token türü değil.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


@router.post("/register", response_model=RegisterResponse)
def register(request: RegisterRequest) -> RegisterResponse:
    phone_number = _normalize_phone_number(request.phone_number)
    full_name = request.full_name.strip()
    if len(full_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ad soyad en az 2 karakter olmalıdır.",
        )
    password_hash = hash_password(request.password)

    try:
        with get_connection() as connection:
            user = connection.execute(
                "SELECT id, is_verified FROM users WHERE phone_number = ?",
                (phone_number,),
            ).fetchone()
            if user and user["is_verified"]:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Bu telefon numarası zaten kayıtlı. Giriş için OTP doğrulayın.",
                )

            if user:
                connection.execute(
                    """
                    UPDATE users
                    SET full_name = ?, email = ?, password_hash = ?
                    WHERE id = ?
                    """,
                    (full_name, request.email, password_hash, user["id"]),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO users
                        (public_id, phone_number, full_name, email, password_hash, role)
                    VALUES (?, ?, ?, ?, ?, 'CUSTOMER')
                    """,
                    (
                        str(uuid4()),
                        phone_number,
                        full_name,
                        request.email,
                        password_hash,
                    ),
                )
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu e-posta adresi zaten kullanılıyor.",
        ) from error

    return RegisterResponse(
        message="SMS OTP simülasyonu hazır. Doğrulama kodu: 1234.",
        phone_number=phone_number,
    )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest) -> TokenResponse:
    phone_number = _normalize_phone_number(request.phone_number)
    with get_connection() as connection:
        user = connection.execute(
            "SELECT * FROM users WHERE phone_number = ?",
            (phone_number,),
        ).fetchone()
        if (
            not user
            or not user["password_hash"]
            or not verify_password(request.password, user["password_hash"])
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Telefon numarası veya şifre hatalı.",
            )
        if not user["is_verified"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Giriş yapmadan önce telefon numaranızı OTP koduyla doğrulayın.",
            )
        return _issue_token_pair(connection, user)


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(request: VerifyOtpRequest) -> TokenResponse:
    phone_number = _normalize_phone_number(request.phone_number)
    if not hmac.compare_digest(request.otp_code, OTP_CODE):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP kodu hatalı.",
        )

    with get_connection() as connection:
        user = connection.execute(
            "SELECT * FROM users WHERE phone_number = ?",
            (phone_number,),
        ).fetchone()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Kullanıcı bulunamadı. Önce kayıt olun.",
            )

        connection.execute(
            "UPDATE users SET is_verified = 1 WHERE id = ?",
            (user["id"],),
        )
        return _issue_token_pair(connection, user)


@router.post("/refresh", response_model=TokenResponse)
def refresh_tokens(request: RefreshRequest) -> TokenResponse:
    payload = _decode_token(request.refresh_token, "refresh")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token geçersiz.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as connection:
        session = connection.execute(
            """
            SELECT id FROM auth_sessions
            WHERE user_id = ? AND refresh_token_hash = ? AND revoked_at IS NULL
            """,
            (user_id, _token_hash(request.refresh_token)),
        ).fetchone()
        user = connection.execute(
            "SELECT * FROM users WHERE id = ? AND is_verified = 1",
            (user_id,),
        ).fetchone()
        if not session or not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token geçersiz veya daha önce kullanılmış.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        connection.execute(
            "UPDATE auth_sessions SET revoked_at = ? WHERE id = ?",
            (now, session["id"]),
        )
        return _issue_token_pair(connection, user)


@router.get("/me", response_model=UserResponse)
def get_me(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> UserResponse:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer access token gerekli.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _decode_token(credentials.credentials, "access")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token geçersiz.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    with get_connection() as connection:
        user = connection.execute(
            "SELECT id, phone_number, full_name, role FROM users "
            "WHERE id = ? AND is_verified = 1",
            (user_id,),
        ).fetchone()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Kullanıcı bulunamadı veya doğrulanmamış.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return UserResponse(**dict(user))


def require_roles(*allowed_roles: UserRole):
    def role_guard(
        current_user: Annotated[UserResponse, Depends(get_me)],
    ) -> UserResponse:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu işlem için gerekli kullanıcı rolü yok.",
            )
        return current_user

    return role_guard


@router.get("/users", response_model=list[UserResponse])
def list_users(
    admin: Annotated[UserResponse, Depends(require_roles(UserRole.ADMIN))],
) -> list[UserResponse]:
    with get_connection() as connection:
        users = connection.execute(
            "SELECT id, phone_number, full_name, role FROM users ORDER BY id"
        ).fetchall()
        return [UserResponse(**dict(user)) for user in users]


@router.patch("/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    request: RoleUpdateRequest,
    admin: Annotated[UserResponse, Depends(require_roles(UserRole.ADMIN))],
) -> UserResponse:
    with get_connection() as connection:
        user = connection.execute(
            "SELECT id, phone_number, full_name, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Kullanıcı bulunamadı.",
            )

        if (
            user_id == admin.id
            and user["role"] == UserRole.ADMIN.value
            and request.role != UserRole.ADMIN
        ):
            admin_count = connection.execute(
                "SELECT COUNT(*) FROM users WHERE role = 'ADMIN'"
            ).fetchone()[0]
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Sistemdeki son Admin hesabı kendi rolünü düşüremez.",
                )

        connection.execute(
            "UPDATE users SET role = ? WHERE id = ?",
            (request.role.value, user_id),
        )
        updated_user = dict(user)
        updated_user["role"] = request.role.value
        return UserResponse(**updated_user)
