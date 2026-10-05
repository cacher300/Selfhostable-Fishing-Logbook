from __future__ import annotations

from dataclasses import dataclass, fields
from pathlib import Path
from typing import Any

import pytest
from flask.testing import FlaskClient

from backend.app_factory import create_app
from backend.config import AppConfig
from backend.storage.local import LocalLogbookStore


@dataclass
class FishTestApp:
    app: Any
    client: FlaskClient
    config: AppConfig
    logbook: LocalLogbookStore
    uploads: Path

    def csrf(self) -> str:
        return self.client.get("/api/csrf-token").get_json()["csrfToken"]


def make_app(root: Path, **config_overrides: Any) -> FishTestApp:
    config_fields = {field.name for field in fields(AppConfig)}
    app_overrides: dict[str, Any] = {}
    values: dict[str, Any] = {
        "data_dir": Path(root),
        "testing": bool(config_overrides.pop("TESTING", True)),
        "secret_key": config_overrides.pop("SECRET_KEY", "test-secret"),
        "great_lakes_cache_dir": str(Path(root) / "great-lakes-cache"),
    }
    for key, value in config_overrides.items():
        normalized = key.lower()
        if normalized in config_fields:
            values[normalized] = value
        else:
            app_overrides[key] = value
    config = AppConfig(**values)
    app = create_app(config)
    if app_overrides:
        app.config.update(app_overrides)
    storage = app.extensions["fish.storage"]
    return FishTestApp(
        app=app,
        client=app.test_client(),
        config=config,
        logbook=storage.logbook,
        uploads=config.uploads_dir,
    )


@pytest.fixture
def fish(tmp_path: Path) -> FishTestApp:
    return make_app(tmp_path)


@pytest.fixture(autouse=True)
def isolated_great_lakes_cache(tmp_path_factory: pytest.TempPathFactory):
    """Keep NOAA cache files and discovered runs from leaking between tests or into the real cache."""
    from backend import great_lakes_animation, great_lakes_cache, great_lakes_service, great_lakes_upwelling, great_lakes_volumes, great_lakes_waves

    great_lakes_cache.configure(tmp_path_factory.mktemp("great-lakes-cache"))
    great_lakes_service._runs_state.clear()
    great_lakes_service._runs_disk_checked[0] = 0.0
    great_lakes_service._dds_cache.clear()
    great_lakes_service._dimensions_cache.clear()
    great_lakes_volumes.clear_memory()
    great_lakes_waves.clear_memory()
    great_lakes_animation.clear_memory()
    great_lakes_upwelling.clear_memory()
    yield
    great_lakes_service._runs_state.clear()
    great_lakes_volumes.clear_memory()
    great_lakes_waves.clear_memory()
    great_lakes_animation.clear_memory()
    great_lakes_cache.configure(None)
