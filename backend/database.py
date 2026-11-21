import os
import sqlite3
from pathlib import Path
from uuid import uuid4

DATA_DIR = Path(os.getenv("KAHVECELL_DATA_DIR", str(Path(__file__).parent)))
DATABASE_PATH = DATA_DIR / "kahvecell.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    public_id TEXT,
    phone_number TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'CUSTOMER'
        CHECK (role IN ('CUSTOMER', 'SHOP_OWNER', 'ADMIN')),
    is_verified INTEGER NOT NULL DEFAULT 0
        CHECK (is_verified IN (0, 1)),
    preferences TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    plan_type TEXT NOT NULL
        CHECK (plan_type IN ('STARTER', 'PREMIUM', 'UNLIMITED')),
    remaining_credits INTEGER,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED')),
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY,
    transaction_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES subscriptions(id),
    plan_type TEXT NOT NULL
        CHECK (plan_type IN ('STARTER', 'PREMIUM', 'UNLIMITED')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    failure_reason TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY,
    public_id TEXT,
    owner_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    opening_hours TEXT,
    rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5))
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL CHECK (price >= 0),
    is_available INTEGER NOT NULL DEFAULT 1
        CHECK (is_available IN (0, 1))
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    public_id TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    size TEXT NOT NULL DEFAULT 'M' CHECK (size IN ('S', 'M', 'L')),
    customizations TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED')),
    qr_code TEXT UNIQUE,
    qr_verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id
    ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON orders(shop_id);
"""


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def create_tables() -> None:
    with get_connection() as connection:
        connection.executescript(SCHEMA)
        user_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(users)")
        }
        if "password_hash" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
        if "is_verified" not in user_columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0"
            )

        for table in ("users", "shops", "orders"):
            columns = {
                row["name"]
                for row in connection.execute(f"PRAGMA table_info({table})")
            }
            if "public_id" not in columns:
                connection.execute(f"ALTER TABLE {table} ADD COLUMN public_id TEXT")

            missing_ids = connection.execute(
                f"SELECT id FROM {table} WHERE public_id IS NULL"
            ).fetchall()
            for row in missing_ids:
                connection.execute(
                    f"UPDATE {table} SET public_id = ? WHERE id = ?",
                    (str(uuid4()), row["id"]),
                )
            connection.execute(
                f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_public_id "
                f"ON {table}(public_id)"
            )

        order_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(orders)")
        }
        if "qr_verified_at" not in order_columns:
            connection.execute("ALTER TABLE orders ADD COLUMN qr_verified_at TEXT")
