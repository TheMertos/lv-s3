#!/usr/bin/env python3
"""
Generate JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, MASTER_ENCRYPTION_KEY,
and ADMIN_BOOTSTRAP_PASSWORD for .env.
"""

import secrets
import string


def _bootstrap_password(length: int = 24) -> str:
    """Strong one-line password: upper, lower, digit, safe special."""
    lower = string.ascii_lowercase
    upper = string.ascii_uppercase
    digits = string.digits
    special = "!@#$%+-_"
    alphabet = lower + upper + digits + special
    # Ensure at least one of each class
    parts = [
        secrets.choice(lower),
        secrets.choice(upper),
        secrets.choice(digits),
        secrets.choice(special),
    ]
    for _ in range(max(0, length - len(parts))):
        parts.append(secrets.choice(alphabet))
    secrets.SystemRandom().shuffle(parts)
    return "".join(parts)


def main() -> None:
    # URL-safe, long enough for JWT signing (>= 32 chars)
    jwt_access = secrets.token_urlsafe(48)
    jwt_refresh = secrets.token_urlsafe(48)
    # Same shape as typical MASTER_ENCRYPTION_KEY in this project (64 hex = 32 bytes)
    master_hex = secrets.token_hex(32)
    bootstrap_pw = _bootstrap_password(24)

    print("# Paste into .env (replace existing lines)")
    print(f"JWT_ACCESS_SECRET={jwt_access}")
    print(f"JWT_REFRESH_SECRET={jwt_refresh}")
    print(f"MASTER_ENCRYPTION_KEY={master_hex}")
    print(f"ADMIN_BOOTSTRAP_PASSWORD={bootstrap_pw}")
    print("# Sync E2E: tests/docker-e2e/.env ADMIN_PASSWORD = same value (first boot only)")


if __name__ == "__main__":
    main()
