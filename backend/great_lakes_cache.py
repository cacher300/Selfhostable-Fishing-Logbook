"""Shared on-disk cache and binary OPeNDAP reader for NOAA Great Lakes data.

Gunicorn runs several worker processes, and the background refresher runs in
only one of them, so downloaded NOAA data lives on disk where every worker
(and the next server start) can reuse it. Writes are atomic renames, so a
reader never sees a partial file.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import struct
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from array import array
from pathlib import Path

USER_AGENT = "Fishing-Logbook-GreatLakes/1.0"
DEFAULT_CACHE_DIR = Path(tempfile.gettempdir()) / "fishing-logbook-great-lakes"

_cache_dir = DEFAULT_CACHE_DIR
_configure_lock = threading.Lock()

# XDR sizes for DAP2 base types; 16-bit and 8-bit integers are widened or
# packed as XDR requires.
_DAP_TYPES = {
    "Float32": ("f", 4), "Float64": ("d", 8), "Int32": ("i", 4), "UInt32": ("I", 4),
    "Int16": ("i", 4), "UInt16": ("I", 4), "Byte": ("B", 1), "Int8": ("b", 1), "UInt8": ("B", 1),
}
_DDS_VARIABLE = re.compile(r"^\s*(" + "|".join(_DAP_TYPES) + r")\s+(\w+)((?:\[[^\]]*\])*)\s*;", re.M)


def configure(cache_dir: str | os.PathLike | None) -> Path:
    global _cache_dir
    with _configure_lock:
        _cache_dir = Path(cache_dir).expanduser() if cache_dir else DEFAULT_CACHE_DIR
    return _cache_dir


def cache_dir() -> Path:
    return _cache_dir


def path_for(*parts: str) -> Path:
    return _cache_dir.joinpath(*parts)


def _write_atomic(target: Path, data: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.", suffix=".tmp")
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
        os.replace(temporary, target)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def write_json(target: Path, value: object) -> None:
    _write_atomic(target, json.dumps(value, separators=(",", ":")).encode("utf-8"))


def read_json(target: Path, max_age_seconds: float | None = None) -> object | None:
    try:
        if max_age_seconds is not None and time.time() - target.stat().st_mtime > max_age_seconds:
            return None
        return json.loads(target.read_bytes())
    except (OSError, ValueError):
        return None


def get_or_create_json(target: Path, build, *, valid, timeout: float = 150.0,
                       max_age_seconds: float | None = None):
    """Share an expensive lookup across threads, processes, and restarts.

    Only validated results are saved. The OS releases the lock if a worker
    exits; a bounded wait lets callers retry rather than wait indefinitely.
    """
    saved = read_json(target, max_age_seconds)
    if valid(saved):
        return saved
    lock = LeaderLock(target.with_suffix(".lock"))
    deadline = time.monotonic() + timeout
    try:
        while True:
            try:
                acquired = lock.acquire()
            except OSError:
                return build()  # Cache permissions must not block NOAA data.
            if acquired:
                break
            saved = read_json(target, max_age_seconds)
            if valid(saved):
                return saved
            if time.monotonic() >= deadline:
                raise TimeoutError(f"Timed out waiting for cached {target.name}")
            time.sleep(0.05)
        saved = read_json(target, max_age_seconds)
        if valid(saved):
            return saved
        result = build()
        if valid(result):
            try:
                write_json(target, result)
            except OSError:
                pass  # A successful lookup still works with a read-only cache.
        return result
    finally:
        lock.release()


def write_record(target: Path, header: dict, arrays: dict[str, array]) -> None:
    """Store a JSON header plus little-endian numeric arrays in one file."""
    layout, chunks = [], []
    for name, values in arrays.items():
        layout.append({"name": name, "typecode": values.typecode, "count": len(values)})
        chunk = array(values.typecode, values)
        if sys.byteorder != "little":
            chunk.byteswap()
        chunks.append(chunk.tobytes())
    encoded = json.dumps({**header, "_arrays": layout}, separators=(",", ":")).encode("utf-8")
    _write_atomic(target, struct.pack("<I", len(encoded)) + encoded + b"".join(chunks))


def read_record(target: Path) -> tuple[dict, dict[str, array]] | None:
    try:
        data = target.read_bytes()
        (header_length,) = struct.unpack_from("<I", data)
        header = json.loads(data[4:4 + header_length])
        offset, arrays = 4 + header_length, {}
        for item in header.pop("_arrays"):
            values = array(item["typecode"])
            size = values.itemsize * item["count"]
            values.frombytes(data[offset:offset + size])
            if sys.byteorder != "little":
                values.byteswap()
            if len(values) != item["count"]:
                return None
            arrays[item["name"]] = values
            offset += size
        return header, arrays
    except (OSError, ValueError, KeyError, struct.error):
        return None


def prune(directory: Path, keep: set[str]) -> None:
    """Remove child directories of ``directory`` whose names are not in ``keep``."""
    try:
        children = list(directory.iterdir())
    except OSError:
        return
    for child in children:
        if child.is_dir() and child.name not in keep:
            shutil.rmtree(child, ignore_errors=True)


def http_get(url: str, timeout: float = 60) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def parse_dods(payload: bytes) -> dict[str, tuple[list[int], array]]:
    """Decode a DAP2 ``.dods`` response containing plain arrays.

    Returns ``{name: (shape, values)}`` in response order. Each array is an
    XDR length (sent twice) followed by big-endian values.
    """
    marker = payload.find(b"\nData:\n")
    if marker < 0:
        raise RuntimeError("NOAA response has no binary data section")
    dds = payload[:marker].decode("utf-8", "replace")
    offset, result = marker + len(b"\nData:\n"), {}
    for type_name, name, dimensions in _DDS_VARIABLE.findall(dds):
        shape = [int(size) for size in re.findall(r"=\s*(\d+)\]", dimensions)] or [1]
        typecode, width = _DAP_TYPES[type_name]
        count = 1
        for size in shape:
            count *= size
        if dimensions:
            first, second = struct.unpack_from(">II", payload, offset)
            if first != count or second != count:
                raise RuntimeError(f"NOAA array {name} has an unexpected length")
            offset += 8
        values = array(typecode)
        if width == 1:
            values.frombytes(payload[offset:offset + count])
            offset += (count + 3) // 4 * 4
        elif type_name in {"Int16", "UInt16"}:
            values.frombytes(payload[offset:offset + count * 4])
            offset += count * 4
        else:
            values.frombytes(payload[offset:offset + count * width])
            offset += count * width
        if values.itemsize > 1 and sys.byteorder == "little":
            values.byteswap()
        if len(values) != count:
            raise RuntimeError(f"NOAA array {name} was truncated")
        result[name] = (shape, values)
    if not result:
        raise RuntimeError("NOAA response declared no arrays")
    return result


def fetch_dods(base_url: str, expression: str, timeout: float = 120) -> dict[str, tuple[list[int], array]]:
    return parse_dods(http_get(f"{base_url}.dods?{urllib.parse.quote(expression, safe=',')}", timeout))


class LeaderLock:
    """Process-lifetime exclusive lock; the OS releases it if the process dies."""

    def __init__(self, target: Path) -> None:
        self.target = target
        self._handle = None

    def acquire(self) -> bool:
        if self._handle is not None:
            return True
        self.target.parent.mkdir(parents=True, exist_ok=True)
        handle = open(self.target, "a+b")
        try:
            if os.name == "nt":
                import msvcrt
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            return False
        self._handle = handle
        return True

    def release(self) -> None:
        if self._handle is None:
            return
        try:
            if os.name == "nt":
                import msvcrt
                self._handle.seek(0)
                msvcrt.locking(self._handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
        finally:
            self._handle.close()
            self._handle = None
