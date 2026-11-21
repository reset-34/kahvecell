import math
import unicodedata
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from database import get_connection

router = APIRouter()
EARTH_RADIUS_KM = 6371.0088


class ShopResponse(BaseModel):
    id: int
    name: str
    address: str
    latitude: float
    longitude: float
    opening_hours: str | None
    rating: float | None
    distance_km: float | None = None


class ProductResponse(BaseModel):
    id: int
    name: str
    description: str | None
    price: float
    is_available: bool


class ShopDetailResponse(ShopResponse):
    menu: list[ProductResponse]


def _normalize_search(value: str) -> str:
    value = value.casefold().replace("ı", "i")
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(character)
    )


def _distance_km(
    origin_latitude: float,
    origin_longitude: float,
    shop_latitude: float,
    shop_longitude: float,
) -> float:
    latitude_delta = math.radians(shop_latitude - origin_latitude)
    longitude_delta = math.radians(shop_longitude - origin_longitude)
    origin_latitude = math.radians(origin_latitude)
    shop_latitude = math.radians(shop_latitude)
    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(origin_latitude)
        * math.cos(shop_latitude)
        * math.sin(longitude_delta / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1, haversine)))


def _product_response(row) -> ProductResponse:
    return ProductResponse(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        price=row["price"],
        is_available=bool(row["is_available"]),
    )


@router.get("/shops", response_model=list[ShopResponse], tags=["Shops"])
def list_shops(
    q: Annotated[str | None, Query(max_length=100)] = None,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    radius: Annotated[float, Query(gt=0, le=200)] = 10,
) -> list[ShopResponse]:
    if (lat is None) != (lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Yakınlık araması için lat ve lng birlikte gönderilmelidir.",
        )

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, address, latitude, longitude, opening_hours, rating
            FROM shops
            """
        ).fetchall()

    normalized_query = _normalize_search(q.strip()) if q and q.strip() else None
    shops: list[ShopResponse] = []
    for row in rows:
        if normalized_query and normalized_query not in _normalize_search(
            f"{row['name']} {row['address']}"
        ):
            continue

        distance = None
        if lat is not None and lng is not None:
            distance = _distance_km(lat, lng, row["latitude"], row["longitude"])
            if distance > radius:
                continue

        shops.append(
            ShopResponse(
                id=row["id"],
                name=row["name"],
                address=row["address"],
                latitude=row["latitude"],
                longitude=row["longitude"],
                opening_hours=row["opening_hours"],
                rating=row["rating"],
                distance_km=round(distance, 2) if distance is not None else None,
            )
        )

    if lat is not None and lng is not None:
        shops.sort(key=lambda shop: shop.distance_km or 0)
    else:
        shops.sort(key=lambda shop: _normalize_search(shop.name))
    return shops


@router.get(
    "/shops/{shop_id}/menu",
    response_model=list[ProductResponse],
    tags=["Shops"],
)
def get_shop_menu(shop_id: int) -> list[ProductResponse]:
    with get_connection() as connection:
        shop = connection.execute(
            "SELECT id FROM shops WHERE id = ?",
            (shop_id,),
        ).fetchone()
        if not shop:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dükkân bulunamadı.",
            )

        products = connection.execute(
            """
            SELECT id, name, description, price, is_available
            FROM products
            WHERE shop_id = ?
            ORDER BY name
            """,
            (shop_id,),
        ).fetchall()
        return [_product_response(product) for product in products]


@router.get(
    "/shops/{shop_id}",
    response_model=ShopDetailResponse,
    tags=["Shops"],
)
def get_shop_detail(
    shop_id: int,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
) -> ShopDetailResponse:
    if (lat is None) != (lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Yakınlık araması için lat ve lng birlikte gönderilmelidir.",
        )

    with get_connection() as connection:
        shop = connection.execute(
            """
            SELECT id, name, address, latitude, longitude, opening_hours, rating
            FROM shops
            WHERE id = ?
            """,
            (shop_id,),
        ).fetchone()
        if not shop:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dükkân bulunamadı.",
            )

        products = connection.execute(
            """
            SELECT id, name, description, price, is_available
            FROM products
            WHERE shop_id = ?
            ORDER BY name
            """,
            (shop_id,),
        ).fetchall()
        distance = (
            _distance_km(lat, lng, shop["latitude"], shop["longitude"])
            if lat is not None and lng is not None
            else None
        )
        return ShopDetailResponse(
            id=shop["id"],
            name=shop["name"],
            address=shop["address"],
            latitude=shop["latitude"],
            longitude=shop["longitude"],
            opening_hours=shop["opening_hours"],
            rating=shop["rating"],
            distance_km=round(distance, 2) if distance is not None else None,
            menu=[_product_response(product) for product in products],
        )
