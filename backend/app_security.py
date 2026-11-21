import hashlib
import hmac
import os
import secrets
from pathlib import Path

PASSWORD_HASH_ITERATIONS = 310_000


def load_or_create_secret(path: Path, environment_variable: str) -> bytes:
    configured_secret = os.getenv(environment_variable)
    if configured_secret:
        if len(configured_secret) < 32:
            raise RuntimeError(f"{environment_variable} en az 32 karakter olmalıdır.")
        return configured_secret.encode("utf-8")

    try:
        with path.open("x", encoding="utf-8") as secret_file:
            secret_file.write(secrets.token_urlsafe(48))
    except FileExistsError:
        pass

    secret = path.read_text(encoding="utf-8").strip()
    if len(secret) < 32:
        raise RuntimeError(f"İmzalama anahtarı geçersiz: {path}")
    return secret.encode("utf-8")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return (
        f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}"
        f"${salt.hex()}${password_hash.hex()}"
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, hash_hex = stored_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        expected_hash = bytes.fromhex(hash_hex)
        actual_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual_hash, expected_hash)
