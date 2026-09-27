"""Run the recurring startup cleanup for the duplicate paddle-tail lure."""

from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend import cloud_storage  # noqa: E402
from backend.backend_config import DATABASE_FILE  # noqa: E402
from backend.lure_cleanup import cleanup_duplicate_lure  # noqa: E402


def main() -> int:
    if cloud_storage.enabled():
        print("Startup lure cleanup skipped: cloud storage is enabled; local SQLite was not changed.")
        return 0

    result = cleanup_duplicate_lure(DATABASE_FILE)
    print(result.message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
