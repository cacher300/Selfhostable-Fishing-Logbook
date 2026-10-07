"""Runtime configuration for the Flask application.

Environment variables are read only by :meth:`AppConfig.from_env`, which the
production entry points call once. Tests and tools build an ``AppConfig``
directly so no module-level state has to be patched.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping


PROJECT_ROOT = Path(__file__).resolve().parent.parent
TRUTHY = {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class AppConfig:
    data_dir: Path = PROJECT_ROOT / "data"
    host: str = "127.0.0.1"
    port: int = 8080
    secret_key: str = field(default_factory=lambda: secrets.token_hex(32), repr=False)
    session_cookie_secure: bool = False
    storage_backend: str = "local"
    cloud_api_url: str = ""
    testing: bool = False
    # Shared NOAA download cache; empty means the OS temp directory.
    great_lakes_cache_dir: str = ""
    # Keep NOAA Great Lakes data downloaded in the background (server only).
    great_lakes_background_refresh: bool = False
    # Website serving saved past Great Lakes conditions ("Past 90 days").
    great_lakes_history_url: str = "https://greatlakestrolling.com"

    def __post_init__(self) -> None:
        object.__setattr__(self, "data_dir", Path(self.data_dir).expanduser().resolve())
        object.__setattr__(self, "storage_backend", str(self.storage_backend or "local").strip().lower())

    @property
    def database_file(self) -> Path:
        return self.data_dir / "logbook.sqlite3"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def cloud_enabled(self) -> bool:
        return self.storage_backend == "cloud" and bool(self.cloud_api_url)

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "AppConfig":
        env = os.environ if environ is None else environ
        configured_data_dir = str(env.get("FISH_DATA_DIR", "")).strip()
        secret_key = env.get("SECRET_KEY") or secrets.token_hex(32)
        return cls(
            data_dir=Path(configured_data_dir) if configured_data_dir else PROJECT_ROOT / "data",
            host=env.get("HOST", "127.0.0.1"),
            port=int(env.get("PORT", "8080")),
            secret_key=secret_key,
            session_cookie_secure=str(env.get("SESSION_COOKIE_SECURE", "false")).lower() in TRUTHY,
            storage_backend=env.get("FISH_STORAGE_BACKEND", "local"),
            cloud_api_url=str(env.get("FISH_CLOUD_API_URL", "")).strip(),
            great_lakes_cache_dir=str(env.get("GREAT_LAKES_CACHE_DIR", "")).strip(),
            great_lakes_background_refresh=str(env.get("GREAT_LAKES_BACKGROUND_REFRESH", "true")).lower() in TRUTHY,
            great_lakes_history_url=str(env.get("GREAT_LAKES_HISTORY_URL", "https://greatlakestrolling.com")).strip(),
        )
