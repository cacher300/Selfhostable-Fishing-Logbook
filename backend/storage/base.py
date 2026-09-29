"""Storage interfaces shared by the local and cloud backends.

Routes talk only to these protocols. :func:`backend.storage.create_storage`
chooses the implementation once, from :class:`backend.config.AppConfig`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, Protocol
from zipfile import ZipFile

from flask import Response
from werkzeug.datastructures import FileStorage

from ..shared_trip_archive import ArchiveMedia


class RevisionConflict(RuntimeError):
    """The stored logbook changed since the client last read it."""

    def __init__(self, current_revision: str):
        super().__init__("The logbook was changed elsewhere. Reload to get the latest version before saving.")
        self.current_revision = current_revision


class MediaRequestError(ValueError):
    """A media request is invalid; the message is safe to show to the user."""


class MediaInventoryIncomplete(RuntimeError):
    """The media inventory could not be listed completely."""


@dataclass(frozen=True)
class LogbookSnapshot:
    """A validated document and its revision tag (an HTTP ETag value, or "")."""

    document: dict
    revision: str


class LogbookStore(Protocol):
    def exists(self) -> bool:
        """Whether a stored document exists (archive export needs one)."""

    def read(self) -> LogbookSnapshot:
        """Return the current validated document.

        The returned document may be shared with other readers; copy it
        before mutating.
        """

    def write(self, document: dict, expected_revision: str | None) -> str:
        """Replace the whole document; ``expected_revision`` guards concurrent edits."""

    def apply_changes(self, changes: list, expected_revision: str | None) -> str:
        """Apply record-level changes (see :mod:`backend.logbook_changes`)."""

    def install(self, document: dict) -> str:
        """Install a validated document during explicit archive recovery."""

    def initialize(self) -> None:
        """Create or validate storage at startup; may raise for degraded mode."""


class MediaStore(Protocol):
    def save_upload(self, category: str, upload: FileStorage, metadata_json: str | None, logbook: Callable[[], dict]) -> dict: ...

    def list_queue(self) -> list[dict]: ...

    def list_gallery(self, categories: Iterable[str], single_category: str | None) -> list[dict]: ...

    def list_orphans(self, references: set[tuple[str, str]]) -> list[dict]: ...

    def delete(self, category: str, filename: str) -> None: ...

    def claim_queue_item(self, filename: str, target_category: str) -> dict: ...

    def copy_queue_item(self, filename: str, target_category: str) -> dict: ...

    def delete_queue_item(self, filename: str) -> None: ...

    def serve(self, category: str, filename: str, *, preview: bool) -> Response: ...

    def write_archive_media(self, bundle: ZipFile) -> None: ...

    def import_archive(self, bundle: ZipFile, names: list[str], install_logbook: Callable[[], None]) -> None: ...

    def shared_archive_item(self, category: str, filename: str) -> ArchiveMedia | None: ...

    def import_shared_media(self, media: list[ArchiveMedia], commit_logbook: Callable[[], str]) -> str: ...


@dataclass(frozen=True)
class Storage:
    logbook: LogbookStore
    media: MediaStore


def archive_media_entries(names: Iterable[str]) -> list[str]:
    return [name for name in names if name.startswith("media/") and not name.endswith("/")]
