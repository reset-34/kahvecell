import re
import sqlite3
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import UserResponse, get_me
from database import get_connection

router = APIRouter()

SUCCESS_CARD = "4242424242424242"
DECLINED_CARD = "4000000000000002"


class PlanType(str, Enum):
    STARTER = "STARTER"
    PREMIUM = "PREMIUM"
    UNLIMITED = "UNLIMITED"


PLANS: dict[PlanType, dict[str, Any]] = {
    PlanType.STARTER: {
        "name": "Starter",
        "price_cents": 8999,
        "coffee_credits": 10,
        "guest_credits": 0,
        "priority_order": False,
    },
    PlanType.PREMIUM: {
        "name": "Premium",
        "price_cents": 14999,
        "coffee_credits": 20,
        "guest_credits": 2,
        "priority_order": False,
    },
    PlanType.UNLIMITED: {
        "name": "Unlimited",
        "price_cents": 24999,
        "coffee_credits": None,
        "guest_credits": 5,
        "priority_order": True,
    },
}


class PlanResponse(BaseModel):
    plan_type: PlanType
    name: str
    monthly_price: float
    coffee_credits: int | None
    guest_credits: int
    priority_order: bool
    eligible_shops: str = "Tüm anlaşmalı dükkânlar"


class SubscriptionPurchaseRequest(BaseModel):
    plan_type: PlanType
    card_number: str = Field(min_length=16, max_length=23)


class PaymentProcessRequest(BaseModel):
    subscription_plan: PlanType
    card_token: str = Field(min_length=16, max_length=23)


class SubscriptionUpdateRequest(SubscriptionPurchaseRequest):
    pass


class SubscriptionRenewRequest(BaseModel):
    card_number: str = Field(min_length=16, max_length=23)


class SubscriptionResponse(BaseModel):
    id: int
    user_id: int
    plan_type: PlanType
    remaining_credits: int | None
    status: str
    started_at: str
    expires_at: str


class PurchaseResponse(BaseModel):
    success: bool
    transaction_id: str
    amount: float
    timestamp: str
    message: str
    subscription: SubscriptionResponse | None


class PaymentHistoryItem(BaseModel):
    transaction_id: str
    plan_type: PlanType
    amount: float
    status: str
    failure_reason: str | None
    created_at: str


def _plan_response(plan_type: PlanType) -> PlanResponse:
    plan = PLANS[plan_type]
    return PlanResponse(
        plan_type=plan_type,
        name=plan["name"],
        monthly_price=plan["price_cents"] / 100,
        coffee_credits=plan["coffee_credits"],
        guest_credits=plan["guest_credits"],
        priority_order=plan["priority_order"],
    )


def _subscription_response(row: sqlite3.Row | None) -> SubscriptionResponse | None:
    if row is None:
        return None
    return SubscriptionResponse(
        id=row["id"],
        user_id=row["user_id"],
        plan_type=row["plan_type"],
        remaining_credits=row["remaining_credits"],
        status=row["status"],
        started_at=row["started_at"],
        expires_at=row["expires_at"],
    )


def _active_subscription(
    connection: sqlite3.Connection,
    user_id: int,
) -> sqlite3.Row | None:
    return connection.execute(
        """
        SELECT * FROM subscriptions
        WHERE user_id = ? AND status = 'ACTIVE'
        ORDER BY id DESC LIMIT 1
        """,
        (user_id,),
    ).fetchone()


def _normalize_card_number(card_number: str) -> str:
    if not re.fullmatch(r"[0-9 -]+", card_number):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Kart numarası yalnızca rakam, boşluk ve tire içerebilir.",
        )
    normalized = card_number.replace(" ", "").replace("-", "")
    if not re.fullmatch(r"\d{16}", normalized):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Kart numarası 16 rakam olmalıdır.",
        )
    return normalized


def _process_payment(
    connection: sqlite3.Connection,
    user_id: int,
    plan_type: PlanType,
    card_number: str,
    existing_subscription: sqlite3.Row | None = None,
) -> PurchaseResponse:
    normalized_card = _normalize_card_number(card_number)
    plan = PLANS[plan_type]
    approved = normalized_card == SUCCESS_CARD
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    transaction_id = f"PAY-{uuid4().hex}"
    subscription_id = (
        existing_subscription["id"] if existing_subscription else None
    )

    if approved:
        expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(
            timespec="seconds"
        )
        if existing_subscription:
            subscription_id = existing_subscription["id"]
            connection.execute(
                """
                UPDATE subscriptions
                SET plan_type = ?, remaining_credits = ?, started_at = ?, expires_at = ?
                WHERE id = ?
                """,
                (
                    plan_type.value,
                    plan["coffee_credits"],
                    timestamp,
                    expires_at,
                    subscription_id,
                ),
            )
        else:
            cursor = connection.execute(
                """
                INSERT INTO subscriptions (
                    user_id, plan_type, remaining_credits, status, started_at, expires_at
                )
                VALUES (?, ?, ?, 'ACTIVE', ?, ?)
                """,
                (
                    user_id,
                    plan_type.value,
                    plan["coffee_credits"],
                    timestamp,
                    expires_at,
                ),
            )
            subscription_id = cursor.lastrowid

    failure_reason = None if approved else "Kart simülasyon tarafından reddedildi."
    connection.execute(
        """
        INSERT INTO payment_transactions (
            transaction_id, user_id, subscription_id, plan_type, amount_cents,
            status, failure_reason, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            transaction_id,
            user_id,
            subscription_id or (
                existing_subscription["id"] if existing_subscription else None
            ),
            plan_type.value,
            plan["price_cents"],
            "SUCCESS" if approved else "FAILED",
            failure_reason,
            timestamp,
        ),
    )

    subscription = None
    if subscription_id:
        subscription = _subscription_response(
            connection.execute(
                "SELECT * FROM subscriptions WHERE id = ?",
                (subscription_id,),
            ).fetchone()
        )

    return PurchaseResponse(
        success=approved,
        transaction_id=transaction_id,
        amount=plan["price_cents"] / 100,
        timestamp=timestamp,
        message=(
            "Ödeme başarılı."
            if approved
            else "Ödeme başarısız. Kart reddedildi; abonelik hakkınız değişmedi."
        ),
        subscription=subscription,
    )


@router.get("/subscriptions/plans", response_model=list[PlanResponse])
def list_plans() -> list[PlanResponse]:
    return [_plan_response(plan_type) for plan_type in PlanType]


@router.post("/subscriptions", response_model=PurchaseResponse)
def start_subscription(
    request: SubscriptionPurchaseRequest,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> PurchaseResponse:
    with get_connection() as connection:
        if _active_subscription(connection, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Zaten aktif aboneliğiniz var. Paket değiştirme endpoint'ini kullanın.",
            )
        return _process_payment(
            connection,
            current_user.id,
            request.plan_type,
            request.card_number,
        )


@router.post("/payments/process", response_model=PurchaseResponse)
def process_payment(
    request: PaymentProcessRequest,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> PurchaseResponse:
    with get_connection() as connection:
        if _active_subscription(connection, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Zaten aktif aboneliğiniz var. Paket değiştirme endpoint'ini kullanın.",
            )
        return _process_payment(
            connection,
            current_user.id,
            request.subscription_plan,
            request.card_token,
        )


@router.get("/subscriptions/me", response_model=SubscriptionResponse)
def get_my_subscription(
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> SubscriptionResponse:
    with get_connection() as connection:
        subscription = _active_subscription(connection, current_user.id)
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Aktif aboneliğiniz bulunmuyor.",
            )
        return _subscription_response(subscription)


@router.post("/subscriptions/me/renew", response_model=PurchaseResponse)
def renew_my_subscription(
    request: SubscriptionRenewRequest,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> PurchaseResponse:
    with get_connection() as connection:
        subscription = _active_subscription(connection, current_user.id)
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Yenilemek için aktif aboneliğiniz olmalıdır.",
            )
        return _process_payment(
            connection,
            current_user.id,
            PlanType(subscription["plan_type"]),
            request.card_number,
            subscription,
        )


@router.patch("/subscriptions/me", response_model=PurchaseResponse)
def change_my_subscription(
    request: SubscriptionUpdateRequest,
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> PurchaseResponse:
    with get_connection() as connection:
        subscription = _active_subscription(connection, current_user.id)
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paket değiştirmek için aktif aboneliğiniz olmalıdır.",
            )
        if subscription["plan_type"] == request.plan_type.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Seçtiğiniz paket zaten aktif.",
            )
        return _process_payment(
            connection,
            current_user.id,
            request.plan_type,
            request.card_number,
            subscription,
        )


@router.delete("/subscriptions/me", response_model=SubscriptionResponse)
def cancel_my_subscription(
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> SubscriptionResponse:
    with get_connection() as connection:
        subscription = _active_subscription(connection, current_user.id)
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="İptal edilecek aktif aboneliğiniz bulunmuyor.",
            )
        connection.execute(
            "UPDATE subscriptions SET status = 'CANCELLED' WHERE id = ?",
            (subscription["id"],),
        )
        cancelled = dict(subscription)
        cancelled["status"] = "CANCELLED"
        return SubscriptionResponse(**cancelled)


@router.get("/payments/history", response_model=list[PaymentHistoryItem])
def payment_history(
    current_user: Annotated[UserResponse, Depends(get_me)],
) -> list[PaymentHistoryItem]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT transaction_id, plan_type, amount_cents, status,
                   failure_reason, created_at
            FROM payment_transactions
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (current_user.id,),
        ).fetchall()
        return [
            PaymentHistoryItem(
                transaction_id=row["transaction_id"],
                plan_type=row["plan_type"],
                amount=row["amount_cents"] / 100,
                status=row["status"],
                failure_reason=row["failure_reason"],
                created_at=row["created_at"],
            )
            for row in rows
        ]
