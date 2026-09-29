from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

from backend.logbook_store import validate_logbook

ROOT = Path(__file__).resolve().parents[1]


def _parse_segment(segment: str) -> tuple[str, list[int]]:
    name, *indexes = segment.replace("]", "").split("[")
    return name, [int(index) for index in indexes]


def _resolve_parent(document: dict, dotted_path: str):
    current = document
    parts = dotted_path.split(".")
    for segment in parts[:-1]:
        name, indexes = _parse_segment(segment)
        current = current[name]
        for index in indexes:
            current = current[index]
    return current, parts[-1]


def _set_path(document: dict, dotted_path: str, value):
    parent, last = _resolve_parent(document, dotted_path)
    name, indexes = _parse_segment(last)
    if indexes:
        target = parent[name]
        for index in indexes[:-1]:
            target = target[index]
        target[indexes[-1]] = value
    else:
        parent[name] = value


def _remove_path(document: dict, dotted_path: str):
    parent, last = _resolve_parent(document, dotted_path)
    name, indexes = _parse_segment(last)
    if indexes:
        target = parent[name]
        for index in indexes[:-1]:
            target = target[index]
        del target[indexes[-1]]
    else:
        parent.pop(name, None)


def _case_document(case: dict) -> dict:
    document = json.loads((ROOT / "schema" / "default-logbook.json").read_text(encoding="utf-8"))
    for path in case.get("remove", []):
        _remove_path(document, path)
    for path, value in case.get("set", {}).items():
        _set_path(document, path, deepcopy(value))
    return document


def test_schema_fixture_cases_match_python_expectations():
    fixture = json.loads((ROOT / "tests" / "fixtures" / "schema-cases.json").read_text(encoding="utf-8"))
    for case in fixture["cases"]:
        valid, error = validate_logbook(_case_document(case))
        assert valid is case["valid"], case["name"]
        if case["valid"]:
            assert error is None
        else:
            assert error is not None
            assert error.split(":", 1)[0] == case["path"]
