from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app_security import hash_password
from database import create_tables, get_connection

DEMO_PHONE = "05550000001"
DEMO_PASSWORD = "KahveCell123!"
# Shop names and coordinates are based on OpenStreetMap listings.
# Menus, prices, and opening hours below are sample data, not official shop details.
SHOPS = (
    {
        "name": "Cafe Down Engelsiz Cafe",
        "address": "İzmir 1 Caddesi, Kızılay Mahallesi, Çankaya, Ankara",
        "latitude": 39.9229865,
        "longitude": 32.8539956,
    },
    {
        "name": "Coffee Lab - Bahçelievler",
        "address": "Aşkabat Caddesi (7. Cadde), Yukarı Bahçelievler, Çankaya, Ankara",
        "latitude": 39.9194687,
        "longitude": 32.8273582,
    },
    {
        "name": "Coffee Lab - Tunalı Hilmi",
        "address": "Tunalı Hilmi Caddesi 82-B, Remzi Oğuz Arık, Çankaya, Ankara",
        "latitude": 39.9061676,
        "longitude": 32.8607376,
    },
    {
        "name": "Starbucks - Çayyolu",
        "address": "Doğan Taşdelen Bulvarı, Prof. Dr. Ahmet Taner Kışlalı, Çankaya, Ankara",
        "latitude": 39.8817570,
        "longitude": 32.6857066,
    },
    {
        "name": "Mackbear Coffee - Balgat",
        "address": "Ceyhun Atuf Kansu Caddesi, Oğuzlar, Çankaya, Ankara",
        "latitude": 39.8987686,
        "longitude": 32.8176761,
    },
)

PRODUCTS = (
    ("Espresso", "Tek shot espresso", 95.00),
    ("Americano", "Espresso ve sıcak su", 115.00),
    ("Türk Kahvesi", "Geleneksel Türk kahvesi", 105.00),
    ("Cappuccino", "Espresso, süt ve süt köpüğü", 145.00),
    ("Latte", "Espresso ve buharda ısıtılmış süt", 150.00),
)


def seed_user(connection) -> int:
    existing_user = connection.execute(
        "SELECT id FROM users WHERE phone_number = ?",
        (DEMO_PHONE,),
    ).fetchone()
    password_hash = hash_password(DEMO_PASSWORD)

    if existing_user:
        user_id = existing_user["id"]
        connection.execute(
            """
            UPDATE users
            SET full_name = ?, password_hash = ?, role = 'CUSTOMER'
            WHERE id = ?
            """,
            ("Demo Kullanıcı", password_hash, user_id),
        )
        return user_id

    cursor = connection.execute(
        """
        INSERT INTO users (public_id, phone_number, full_name, password_hash, role)
        VALUES (?, ?, ?, ?, 'CUSTOMER')
        """,
        (str(uuid4()), DEMO_PHONE, "Demo Kullanıcı", password_hash),
    )
    return cursor.lastrowid


def seed_subscription(connection, user_id: int, now: datetime) -> None:
    started_at = now.isoformat(timespec="seconds")
    expires_at = (now + timedelta(days=30)).isoformat(timespec="seconds")
    active_starter = connection.execute(
        """
        SELECT id FROM subscriptions
        WHERE user_id = ? AND plan_type = 'STARTER' AND status = 'ACTIVE'
        ORDER BY id LIMIT 1
        """,
        (user_id,),
    ).fetchone()

    if active_starter:
        connection.execute(
            """
            UPDATE subscriptions
            SET remaining_credits = 10, started_at = ?, expires_at = ?
            WHERE id = ?
            """,
            (started_at, expires_at, active_starter["id"]),
        )
        return

    connection.execute(
        """
        INSERT INTO subscriptions (
            user_id, plan_type, remaining_credits, status, started_at, expires_at
        )
        VALUES (?, 'STARTER', 10, 'ACTIVE', ?, ?)
        """,
        (user_id, started_at, expires_at),
    )


def seed_shops_and_products(connection) -> tuple[int, int]:
    product_count = 0

    for shop_data in SHOPS:
        existing_shop = connection.execute(
            "SELECT id FROM shops WHERE name = ?",
            (shop_data["name"],),
        ).fetchone()

        if existing_shop:
            shop_id = existing_shop["id"]
            connection.execute(
                """
                UPDATE shops
                SET address = ?, latitude = ?, longitude = ?, opening_hours = ?
                WHERE id = ?
                """,
                (
                    shop_data["address"],
                    shop_data["latitude"],
                    shop_data["longitude"],
                    "Her gün 08:00-22:00 (örnek)",
                    shop_id,
                ),
            )
        else:
            cursor = connection.execute(
                """
                INSERT INTO shops (
                    public_id, name, address, latitude, longitude, opening_hours
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    shop_data["name"],
                    shop_data["address"],
                    shop_data["latitude"],
                    shop_data["longitude"],
                    "Her gün 08:00-22:00 (örnek)",
                ),
            )
            shop_id = cursor.lastrowid

        for name, description, price in PRODUCTS:
            existing_product = connection.execute(
                "SELECT id FROM products WHERE shop_id = ? AND name = ?",
                (shop_id, name),
            ).fetchone()

            if existing_product:
                connection.execute(
                    """
                    UPDATE products
                    SET description = ?, price = ?, is_available = 1
                    WHERE id = ?
                    """,
                    (description, price, existing_product["id"]),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO products (shop_id, name, description, price)
                    VALUES (?, ?, ?, ?)
                    """,
                    (shop_id, name, description, price),
                )
            product_count += 1

    return len(SHOPS), product_count


def main() -> None:
    create_tables()
    now = datetime.now(timezone.utc)

    with get_connection() as connection:
        user_id = seed_user(connection)
        seed_subscription(connection, user_id, now)
        shop_count, product_count = seed_shops_and_products(connection)

    print("Örnek veriler başarıyla eklendi/güncellendi.")
    print(f"Dükkan: {shop_count}, ürün: {product_count}")
    print(f"Test telefonu: {DEMO_PHONE}")
    print(f"Test şifresi: {DEMO_PASSWORD}")
    print("Abonelik: Aktif Starter, 10 kahve hakkı, 30 gün geçerli")
    print("Not: Bu kullanıcı, abonelik ve dükkân bilgileri demo/test verileridir.")


if __name__ == "__main__":
    main()
