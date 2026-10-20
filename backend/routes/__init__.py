"""HTTP routes, split by concern into Flask blueprints."""

from __future__ import annotations

from flask import current_app

from ..config import AppConfig
from ..storage import Storage


def storage() -> Storage:
    return current_app.extensions["fish.storage"]


def app_config() -> AppConfig:
    return current_app.extensions["fish.config"]


def read_document() -> dict:
    """Current validated logbook; shared snapshot, copy before mutating."""
    return storage().logbook.read().document
