from uuid import uuid4

from app_security import hash_password
from database import create_tables, get_connection

SHOP_OWNER_PHONE = "05550000002"
SHOP_OWNER_PASSWORD = "KahveShop123!"


def main() -> None:
    create_tables()
    with get_connection() as connection:
        owner = connection.execute(
            "SELECT id, role, password_hash FROM users WHERE phone_number = ?",
            (SHOP_OWNER_PHONE,),
        ).fetchone()

        if owner and owner["role"] != "SHOP_OWNER":
            raise RuntimeError(
                f"{SHOP_OWNER_PHONE} başka bir role sahip; mevcut hesabı değiştirmedim."
            )

        if owner:
            owner_id = owner["id"]
            if not owner["password_hash"]:
                connection.execute(
                    """
                    UPDATE users
                    SET password_hash = ?
                    WHERE id = ?
                    """,
                    (hash_password(SHOP_OWNER_PASSWORD), owner_id),
                )
            connection.execute(
                "UPDATE users SET is_verified = 1 WHERE id = ?",
                (owner_id,),
            )
        else:
            cursor = connection.execute(
                """
                INSERT INTO users (
                    public_id, phone_number, full_name, password_hash, role, is_verified
                )
                VALUES (?, ?, ?, ?, 'SHOP_OWNER', 1)
                """,
                (
                    str(uuid4()),
                    SHOP_OWNER_PHONE,
                    "Demo Dükkân Sahibi",
                    hash_password(SHOP_OWNER_PASSWORD),
                ),
            )
            owner_id = cursor.lastrowid

        connection.execute(
            "UPDATE shops SET owner_id = ? WHERE owner_id IS NULL",
            (owner_id,),
        )

    print("Test dükkân sahibi hesabı hazır.")
    print(f"Telefon: {SHOP_OWNER_PHONE}")
    print(f"Şifre: {SHOP_OWNER_PASSWORD}")
    print("Bu hesap seed dükkânlarını yönetebilir.")


if __name__ == "__main__":
    main()
