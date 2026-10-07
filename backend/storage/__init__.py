"""Storage backends selected once from :class:`backend.config.AppConfig`."""

from __future__ import annotations

from ..config import AppConfig
from .base import (
    InvalidRevision,
    LogbookSnapshot,
    LogbookStore,
    MediaInventoryIncomplete,
    MediaRequestError,
    MediaStore,
    RevisionConflict,
    Storage,
)
from .local import LocalLogbookStore, LocalMediaStore


def create_storage(config: AppConfig) -> Storage:
    if config.cloud_enabled:
        from .cloud import CloudLogbookStore, CloudMediaStore

        logbook_store: LogbookStore = CloudLogbookStore()
        scratch = LocalMediaStore(config.uploads_dir, config.data_dir, lambda: logbook_store.read().document)
        return Storage(logbook_store, CloudMediaStore(scratch))

    local_logbook = LocalLogbookStore(config.database_file)
    media = LocalMediaStore(config.uploads_dir, config.data_dir, lambda: local_logbook.read().document)
    return Storage(local_logbook, media)


__all__ = [
    "InvalidRevision",
    "LogbookSnapshot",
    "LogbookStore",
    "MediaInventoryIncomplete",
    "MediaRequestError",
    "MediaStore",
    "RevisionConflict",
    "Storage",
    "create_storage",
]
