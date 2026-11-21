import os
import sys

from database import create_tables, get_connection
from seed_data import main as seed_demo_data
from seed_shop_owner import main as seed_demo_shop_owner


def main() -> None:
    create_tables()

    with get_connection() as connection:
        has_shops = connection.execute("SELECT 1 FROM shops LIMIT 1").fetchone()

    if not has_shops:
        seed_demo_data()
    seed_demo_shop_owner()
    os.execv(
        sys.executable,
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "0.0.0.0",
            "--port",
            os.getenv("PORT", "8000"),
        ],
    )


if __name__ == "__main__":
    main()
