import asyncio
import base64
import hashlib
import hmac
import io
import json
import sqlite3
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse

from app_security import load_or_create_secret
from auth import UserResponse, UserRole, get_me
from database import DATA_DIR, get_connection
from order_events import order_event_broker

router = APIRouter()
QR_SECRET_PATH = DATA_DIR / ".qr_secret"


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    PREPARING = "PREPARING"
    READY = "READY"
    DELIVERED = "DELIVERED"


class OrderCreateRequest(BaseModel):
    shop_id: int = Field(gt=0)
    product_id: int = Field(gt=0)
    size: Literal["S", "M", "L"] = "M"
    sugar: int = Field(default=0, ge=0, le=5)
    milk: Literal["NONE", "WHOLE", "OAT", "LACTOSE_FREE"] = "WHOLE"
    extra_shot: bool = False


class OrderStatusRequest(BaseModel):
    status: Literal["ACCEPTED", "PREPARING", "READY", "DELIVERED"]


class QRPayload(BaseModel):
    order_id: UUID
    user_id: UUID
    shop_id: UUID
    created_at: str
    signature: str = Field(pattern=r"^[a-f0-9]{64}$")


class OrderResponse(BaseModel):
    id: int
    public_id: UUID
    user_id: int
    customer_name: str
    customer_phone: str
    shop_id: int
    shop_name: str
    product_id: int
    product_name: str
    size: str
    quantity: int
    customizations: dict[str, Any]
    status: OrderStatus
    created_at: str
    qr_code: QRPayload | None = None
    qr_image_data_url: str | None = None


class OrderStatusResponse(BaseModel):
    status: OrderStatus


class QRVerifyResponse(BaseModel):
    valid: bool
    order_id: UUID
    status: OrderStatus
    message: str


ORDER_SELECT = """
SELECT
    o.id, o.public_id, o.user_id, o.shop_id, s.name AS shop_name,
    u.full_name AS customer_name, u.phone_number AS customer_phone,
    o.product_id, p.name AS product_name, o.size, o.quantity,
    o.customizations, o.status, o.created_at, o.qr_code, o.qr_verified_at,
    u.public_id AS user_public_id, s.public_id AS shop_public_id,
    s.owner_id
FROM orders o
JOIN users u ON u.id = o.user_id
JOIN shops s ON s.id = o.shop_id
JOIN products p ON p.id = o.product_id
"""

NEXT_STATUS = {
    "PENDING": "ACCEPTED",
    "ACCEPTED": "PREPARING",
    "PREPARING": "READY",
    "READY": "DELIVERED",
}


def _qr_secret() -> bytes:
    return load_or_create_secret(QR_SECRET_PATH, "KAHVECELL_QR_SECRET")


def _sign_payload(payload: dict[str, str]) -> str:
    canonical_payload = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hmac.new(_qr_secret(), canonical_payload, hashlib.sha256).hexdigest()


def _make_qr_payload(
    order_id: str,
    user_id: str,
    shop_id: str,
    created_at: str,
) -> tuple[QRPayload, str]:
    unsigned_payload = {
        "order_id": order_id,
        "user_id": user_id,
        "shop_id": shop_id,
        "created_at": created_at,
    }
    payload = {**unsigned_payload, "signature": _sign_payload(unsigned_payload)}
    serialized = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return QRPayload(**payload), serialized


def _qr_image_data_url(serialized_payload: str) -> str:
    image = qrcode.make(serialized_payload)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded_image = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded_image}"


def _order_response(row: sqlite3.Row, include_qr: bool = False) -> OrderResponse:
    status_value = "DELIVERED" if row["status"] == "COMPLETED" else row["status"]
    response = OrderResponse(
        id=row["id"],
        public_id=row["public_id"],
        user_id=row["user_id"],
        customer_name=row["customer_name"],
        customer_phone=row["customer_phone"],
        shop_id=row["shop_id"],
        shop_name=row["shop_name"],
        product_id=row["product_id"],
        product_name=row["product_name"],
        size=row["size"],
        quantity=row["quantity"],
        customizations=json.loads(row["customizations"]),
        status=status_value,
        created_at=row["created_at"],
    )
    if include_qr:
        serialized_payload = row["qr_code"]
        response.qr_code = QRPayload(**json.loads(serialized_payload))
        response.qr_image_data_url = _qr_image_data_url(serialized_payload)
    return response


def _get_order(connection: sqlite3.Connection, order_id: UUID) -> sqlite3.Row:
    order = connection.execute(
        ORDER_SELECT + " WHERE o.public_id = ?",
        (str(order_id),),
    ).fetchone()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sipariş bulunamadı.",
        )
    return order


def _require_shop_access(order: sqlite3.Row, current_user: UserResponse) -> None:
    if current_user.role == UserRole.ADMIN:
        return
    if (
        current_user.role != UserRole.SHOP_OWNER
        or order["owner_id"] != current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu sipariş için dükkân sahibi yetkiniz yok.",
        )


def _require_order_view_access(
    order: sqlite3.Row,
    current_user: UserResponse,
) -> None:
    is_customer = (
        current_user.role == UserRole.CUSTOMER
        and order["user_id"] == current_user.id
    )
    is_shop_owner = (
        current_user.role == UserRole.SHOP_OWNER
        and order["owner_id"] == current_user.id
    )
    if not (is_customer or is_shop_owner or current_user.role == UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu siparişi görüntüleme yetkiniz yok.",
        )


@router.post("/orders", response_model=OrderResponse, tags=["Orders"])
def create_order(
    request: OrderCreateRequest,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> OrderResponse:
    if current_user.role != UserRole.CUSTOMER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sipariş yalnızca müşteri hesabıyla verilebilir.",
        )

    now = datetime.now(timezone.utc)
    created_at = now.isoformat(timespec="seconds")

    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        subscription = connection.execute(
            """
            SELECT * FROM subscriptions
            WHERE user_id = ? AND status = 'ACTIVE'
            ORDER BY id DESC LIMIT 1
            """,
            (current_user.id,),
        ).fetchone()
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Aktif aboneliğiniz yok. Sipariş vermek için bir paket satın alın.",
            )

        expires_at = datetime.fromisoformat(subscription["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Aboneliğinizin süresi dolmuş. Yenileyip tekrar deneyin.",
            )

        remaining_credits = subscription["remaining_credits"]
        if remaining_credits is not None and remaining_credits <= 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu dönem için kahve hakkınız kalmadı.",
            )

        shop = connection.execute(
            "SELECT id, public_id FROM shops WHERE id = ?",
            (request.shop_id,),
        ).fetchone()
        if not shop:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dükkân bulunamadı.",
            )

        product = connection.execute(
            """
            SELECT id FROM products
            WHERE id = ? AND shop_id = ? AND is_available = 1
            """,
            (request.product_id, request.shop_id),
        ).fetchone()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ürün bu dükkânın menüsünde bulunamadı veya satışta değil.",
            )

        user = connection.execute(
            "SELECT public_id FROM users WHERE id = ?",
            (current_user.id,),
        ).fetchone()
        public_order_id = str(uuid4())
        customizations = {
            "sugar": request.sugar,
            "milk": request.milk,
            "extra_shot": request.extra_shot,
        }
        qr_payload, serialized_qr = _make_qr_payload(
            public_order_id,
            user["public_id"],
            shop["public_id"],
            created_at,
        )

        if remaining_credits is not None:
            updated = connection.execute(
                """
                UPDATE subscriptions
                SET remaining_credits = remaining_credits - 1
                WHERE id = ? AND remaining_credits > 0
                """,
                (subscription["id"],),
            )
            if updated.rowcount != 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Bu dönem için kahve hakkınız kalmadı.",
                )

        cursor = connection.execute(
            """
            INSERT INTO orders (
                public_id, user_id, shop_id, product_id, quantity, size,
                customizations, status, qr_code, created_at
            )
            VALUES (?, ?, ?, ?, 1, ?, ?, 'PENDING', ?, ?)
            """,
            (
                public_order_id,
                current_user.id,
                request.shop_id,
                request.product_id,
                request.size,
                json.dumps(customizations, separators=(",", ":")),
                serialized_qr,
                created_at,
            ),
        )
        order = connection.execute(
            ORDER_SELECT + " WHERE o.id = ?",
            (cursor.lastrowid,),
        ).fetchone()

        response = _order_response(order)
        response.qr_code = qr_payload
        response.qr_image_data_url = _qr_image_data_url(serialized_qr)
        return response


@router.get("/orders/history", response_model=list[OrderResponse], tags=["Orders"])
def order_history(
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> list[OrderResponse]:
    if current_user.role not in (UserRole.CUSTOMER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Müşteri sipariş geçmişi için yetkiniz yok.",
        )

    with get_connection() as connection:
        orders = connection.execute(
            ORDER_SELECT + " WHERE o.user_id = ? ORDER BY o.id DESC",
            (current_user.id,),
        ).fetchall()
        return [_order_response(order) for order in orders]


@router.get("/orders/shop", response_model=list[OrderResponse], tags=["Orders"])
def shop_orders(
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> list[OrderResponse]:
    if current_user.role not in (UserRole.SHOP_OWNER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Siparişleri görmek için dükkân sahibi yetkisi gerekir.",
        )

    with get_connection() as connection:
        if current_user.role == UserRole.ADMIN:
            orders = connection.execute(
                ORDER_SELECT + " ORDER BY o.id DESC"
            ).fetchall()
        else:
            orders = connection.execute(
                ORDER_SELECT + " WHERE s.owner_id = ? ORDER BY o.id DESC",
                (current_user.id,),
            ).fetchall()
        return [_order_response(order) for order in orders]


@router.get(
    "/orders/{order_id}/status",
    response_model=OrderStatusResponse,
    tags=["Orders"],
)
def get_order_status(
    order_id: UUID,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> OrderStatusResponse:
    with get_connection() as connection:
        order = _get_order(connection, order_id)
        _require_order_view_access(order, current_user)
        status_value = (
            "DELIVERED" if order["status"] == "COMPLETED" else order["status"]
        )
        return OrderStatusResponse(status=status_value)


@router.get("/orders/{order_id}/events", tags=["Orders"])
async def stream_order_status(
    order_id: UUID,
    request: Request,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> StreamingResponse:
    subscription = order_event_broker.subscribe(str(order_id))
    try:
        with get_connection() as connection:
            order = _get_order(connection, order_id)
            _require_order_view_access(order, current_user)
            initial_status = (
                "DELIVERED" if order["status"] == "COMPLETED" else order["status"]
            )
    except Exception:
        order_event_broker.unsubscribe(subscription)
        raise

    async def event_stream():
        initial_event = {
            "order_id": str(order_id),
            "status": initial_status,
        }
        try:
            yield f"data: {json.dumps(initial_event, separators=(',', ':'))}\n\n"
            while not await request.is_disconnected():
                try:
                    event = await asyncio.wait_for(
                        subscription.queue.get(),
                        timeout=15,
                    )
                except TimeoutError:
                    yield ": keep-alive\n\n"
                else:
                    yield f"data: {json.dumps(event, separators=(',', ':'))}\n\n"
        finally:
            order_event_broker.unsubscribe(subscription)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/orders/{order_id}",
    response_model=OrderResponse,
    tags=["Orders"],
)
def get_order(
    order_id: UUID,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> OrderResponse:
    with get_connection() as connection:
        order = _get_order(connection, order_id)
        _require_order_view_access(order, current_user)
        return _order_response(order, include_qr=True)


@router.patch(
    "/orders/{order_id}/status",
    response_model=OrderResponse,
    tags=["Orders"],
)
def update_order_status(
    order_id: UUID,
    request: OrderStatusRequest,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> OrderResponse:
    with get_connection() as connection:
        order = _get_order(connection, order_id)
        _require_shop_access(order, current_user)

        next_status = NEXT_STATUS.get(order["status"])
        if request.status != next_status:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Sipariş durumu sırayla ilerlemeli. Sonraki durum: {next_status or 'yok'}.",
            )
        if request.status == "DELIVERED" and not order["qr_verified_at"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Teslim etmeden önce QR kodu doğrulayın.",
            )

        database_status = (
            "COMPLETED"
            if request.status == "DELIVERED"
            else request.status
        )
        connection.execute(
            "UPDATE orders SET status = ? WHERE id = ?",
            (database_status, order["id"]),
        )
        updated_order = _get_order(connection, order_id)
        response = _order_response(updated_order)

    order_event_broker.publish(str(order_id), response.status.value)
    return response


@router.post(
    "/orders/{order_id}/verify-qr",
    response_model=QRVerifyResponse,
    tags=["Orders"],
)
def verify_order_qr(
    order_id: UUID,
    payload: QRPayload,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> QRVerifyResponse:
    with get_connection() as connection:
        order = _get_order(connection, order_id)
        _require_shop_access(order, current_user)

        provided_payload = payload.model_dump(mode="json")
        unsigned_payload = {
            key: value
            for key, value in provided_payload.items()
            if key != "signature"
        }
        expected_signature = _sign_payload(unsigned_payload)
        stored_payload = json.loads(order["qr_code"])
        if (
            not hmac.compare_digest(payload.signature, expected_signature)
            or stored_payload != provided_payload
            or str(payload.user_id) != order["user_public_id"]
            or str(payload.shop_id) != order["shop_public_id"]
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="QR kod geçersiz veya siparişle eşleşmiyor.",
            )
        if order["status"] != "READY":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="QR kod yalnızca hazır siparişte doğrulanabilir.",
            )
        if order["qr_verified_at"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu QR kod daha önce doğrulandı.",
            )

        connection.execute(
            "UPDATE orders SET qr_verified_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(timespec="seconds"), order["id"]),
        )
        return QRVerifyResponse(
            valid=True,
            order_id=payload.order_id,
            status=OrderStatus.READY,
            message="QR imzası geçerli ve bu dükkânın siparişiyle eşleşiyor.",
        )
