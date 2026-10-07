"""Shared NOAA disk cache, binary OPeNDAP decoding, and leader election."""

from __future__ import annotations

import os
import struct
import time
from array import array

import pytest

from backend import great_lakes_cache as cache


def _dods(*variables: tuple[str, str, list[int], list[float]]) -> bytes:
    """Build a DAP2 binary response: DDS text, ``Data:``, then XDR arrays."""
    declarations = []
    body = b""
    for type_name, name, shape, values in variables:
        dimensions = "".join(f"[d{index} = {size}]" for index, size in enumerate(shape))
        declarations.append(f"    {type_name} {name}{dimensions};")
        body += struct.pack(">II", len(values), len(values))
        if type_name == "Float32":
            body += struct.pack(f">{len(values)}f", *values)
        elif type_name == "Float64":
            body += struct.pack(f">{len(values)}d", *values)
        elif type_name == "Byte":
            body += bytes(int(value) for value in values) + b"\0" * (-len(values) % 4)
    dds = "Dataset {\n" + "\n".join(declarations) + "\n} test.nc;\n"
    return dds.encode() + b"\nData:\n" + body


def test_parse_dods_decodes_big_endian_arrays_and_signs() -> None:
    payload = _dods(
        ("Float64", "Latitude", [2, 1], [41.5, 42.0]),
        ("Byte", "flags", [3], [1, 0, 1]),
        ("Float32", "u_eastward", [1, 2, 2], [-0.25, 0.5, -1.5, 0.0]),
    )

    arrays = cache.parse_dods(payload)

    assert list(arrays) == ["Latitude", "flags", "u_eastward"]
    assert arrays["Latitude"] == ([2, 1], array("d", [41.5, 42.0]))
    assert list(arrays["flags"][1]) == [1, 0, 1]
    assert arrays["u_eastward"][0] == [1, 2, 2]
    assert list(arrays["u_eastward"][1]) == [-0.25, 0.5, -1.5, 0.0]


def test_parse_dods_rejects_truncated_or_mismatched_data() -> None:
    payload = _dods(("Float32", "temp", [4], [1.0, 2.0, 3.0, 4.0]))
    with pytest.raises(RuntimeError):
        cache.parse_dods(payload[:-4])
    with pytest.raises(RuntimeError):
        cache.parse_dods(payload.replace(b"[d0 = 4]", b"[d0 = 5]"))
    with pytest.raises(RuntimeError):
        cache.parse_dods(b"Dataset {} x;")


def test_records_round_trip_through_disk(tmp_path) -> None:
    target = tmp_path / "models" / "LEOFS" / "volume.bin"
    cache.write_record(target, {"rows": 2, "depths": [0.0, 1.0]}, {"wet": array("B", [1, 0]), "temp": array("f", [-1.5, 20.25])})

    header, arrays = cache.read_record(target)

    assert header == {"rows": 2, "depths": [0.0, 1.0]}
    assert list(arrays["wet"]) == [1, 0]
    assert list(arrays["temp"]) == [-1.5, 20.25]
    assert not list(target.parent.glob("*.tmp"))  # atomic write leaves no partial file
    target.write_bytes(target.read_bytes()[:-2])
    assert cache.read_record(target) is None  # a truncated file is ignored, not trusted


def test_read_json_honours_maximum_age(tmp_path) -> None:
    target = tmp_path / "status.json"
    cache.write_json(target, {"ok": True})
    assert cache.read_json(target, max_age_seconds=60) == {"ok": True}
    old = time.time() - 120
    os.utime(target, (old, old))
    assert cache.read_json(target, max_age_seconds=60) is None
    assert cache.read_json(tmp_path / "missing.json") is None


def test_prune_keeps_only_named_runs(tmp_path) -> None:
    for name in ("20261002t06z", "20261002t12z"):
        (tmp_path / name).mkdir()
        (tmp_path / name / "temperature.bin").write_bytes(b"x")

    cache.prune(tmp_path, {"20261002t12z"})

    assert [child.name for child in tmp_path.iterdir()] == ["20261002t12z"]


def test_only_one_leader_lock_holder_at_a_time(tmp_path) -> None:
    first, second = cache.LeaderLock(tmp_path / "refresher.lock"), cache.LeaderLock(tmp_path / "refresher.lock")

    assert first.acquire() is True
    assert second.acquire() is False
    first.release()
    assert second.acquire() is True
    second.release()


def test_configure_switches_and_resets_the_cache_directory(tmp_path) -> None:
    assert cache.configure(tmp_path) == tmp_path
    assert cache.path_for("runs.json") == tmp_path / "runs.json"
    assert cache.configure(None) == cache.DEFAULT_CACHE_DIR
