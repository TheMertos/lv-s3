#!/usr/bin/env python3
"""
Generate a random value suitable for MASTER_ENCRYPTION_KEY in backend/.env.

The LV-S3 backend accepts either:
  - exactly 64 hexadecimal characters (32 bytes, interpreted as raw key), or
  - any other string (hashed to 32 bytes internally).

This script prints the recommended form: 64 hex chars (256 bits of entropy).
"""

from __future__ import annotations

import argparse
import secrets
import sys


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a random MASTER_ENCRYPTION_KEY (64 hex chars).",
    )
    parser.add_argument(
        "--bytes",
        type=int,
        default=32,
        metavar="N",
        help="number of random bytes before hex encoding (default: 32 → 64 hex chars)",
    )
    args = parser.parse_args()
    if args.bytes < 16:
        print("error: use at least 16 bytes (32 hex chars)", file=sys.stderr)
        return 1
    if args.bytes > 64:
        print("error: at most 64 bytes supported for this helper", file=sys.stderr)
        return 1

    key_hex = secrets.token_hex(args.bytes)
    print(key_hex)
    print()
    print("Add to backend/.env (or your secrets store):")
    print(f"MASTER_ENCRYPTION_KEY={key_hex}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
