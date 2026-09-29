"""All-or-nothing file promotion for local media.

Archive import, Shared Trip import, and photo-queue claim/copy all need the
same guarantee: either every file lands in its final place, or the upload
tree is restored exactly as it was. :class:`MediaTransaction` collects the
file operations, performs them in order, and undoes completed steps when
anything later fails (including the logbook write that follows).
"""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import BinaryIO, Callable


class MediaTransaction:
    """Stage and promote files with rollback.

    Use as a context manager. Operations are recorded with ``stage_*``,
    ``move``, ``copy`` and ``remove``; nothing touches the target tree until
    :meth:`promote`. If the ``with`` block raises after promotion, every
    completed step is undone in reverse order.
    """

    def __init__(self, scratch_parent: Path):
        scratch_parent.mkdir(parents=True, exist_ok=True)
        self._scratch = TemporaryDirectory(dir=scratch_parent, prefix=".media-transaction-")
        self._root = Path(self._scratch.name)
        self._pending: list[tuple[str, Path | None, Path, bool]] = []
        self._undo: list[Callable[[], None]] = []
        self._promoted = False

    def __enter__(self) -> "MediaTransaction":
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        try:
            if exc_type is not None:
                self.rollback()
        finally:
            self._scratch.cleanup()

    def _scratch_path(self) -> Path:
        path = self._root / "staged" / uuid.uuid4().hex
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def stage_bytes(self, target: Path, content: bytes, *, overwrite: bool = False) -> None:
        staged = self._scratch_path()
        staged.write_bytes(content)
        self._pending.append(("staged", staged, target, overwrite))

    def stage_stream(self, target: Path, stream: BinaryIO, *, overwrite: bool = False) -> None:
        staged = self._scratch_path()
        with staged.open("wb") as destination:
            shutil.copyfileobj(stream, destination, length=1024 * 1024)
        self._pending.append(("staged", staged, target, overwrite))

    def move(self, source: Path, target: Path) -> None:
        self._pending.append(("move", source, target, False))

    def copy(self, source: Path, target: Path) -> None:
        self._pending.append(("copy", source, target, False))

    def remove(self, path: Path) -> None:
        """Delete ``path`` on promotion, restoring it on rollback."""
        self._pending.append(("remove", None, path, False))

    def created(self, path: Path) -> None:
        """Register a file the caller wrote directly after promotion."""
        self._undo.append(lambda: path.unlink(missing_ok=True))

    def _backup(self, target: Path) -> Path:
        backup = self._root / "backup" / uuid.uuid4().hex
        backup.parent.mkdir(parents=True, exist_ok=True)
        target.replace(backup)
        return backup

    def promote(self) -> None:
        if self._promoted:
            raise RuntimeError("Media transaction was already promoted")
        self._promoted = True
        for action, source, target, overwrite in self._pending:
            if action == "remove":
                if target.is_file():
                    backup = self._backup(target)
                    self._undo.append(lambda backup=backup, target=target: backup.replace(target))
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            restore_existing: Callable[[], None] | None = None
            if target.exists():
                if not overwrite:
                    raise FileExistsError(target)
                backup = self._backup(target)
                restore_existing = lambda backup=backup, target=target: backup.replace(target)
            assert source is not None
            if action == "copy":
                shutil.copy2(source, target)
                undo: Callable[[], None] = lambda target=target: target.unlink(missing_ok=True)
            elif action == "move":
                source.replace(target)
                undo = lambda source=source, target=target: target.replace(source)
            else:
                source.replace(target)
                undo = lambda target=target: target.unlink(missing_ok=True)

            def undo_step(undo=undo, restore_existing=restore_existing) -> None:
                undo()
                if restore_existing:
                    restore_existing()

            self._undo.append(undo_step)

    def rollback(self) -> None:
        while self._undo:
            step = self._undo.pop()
            try:
                step()
            except OSError:
                # Keep undoing the remaining steps; a partially restored tree
                # is still better than abandoning the rollback.
                continue
