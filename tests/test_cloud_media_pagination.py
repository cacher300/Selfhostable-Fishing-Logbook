from copy import deepcopy
from io import BytesIO
from urllib.parse import parse_qs, urlsplit
from zipfile import ZipFile

import pytest

from backend import cloud_storage
from backend.archive_service import read_import_bundle
from backend.backend_config import DEFAULT_LOGBOOK
from conftest import make_app


def test_paginated_cloud_archive_includes_referenced_older_media(tmp_path, monkeypatch):
    inventory = [{"category": "lures", "filename": f"{index}.jpg", "metadata": {}} for index in range(502)]
    calls = []

    def page(method, path):
        query = parse_qs(urlsplit(path).query)
        calls.append(query)
        if "cursor" not in query:
            return {"media": inventory[:500], "nextCursor": "page-two"}, {}, 200
        assert query["cursor"] == ["page-two"]
        return {"media": inventory[500:], "nextCursor": None}, {}, 200

    document = deepcopy(DEFAULT_LOGBOOK)
    document["lures"] = [{"id": "old-lure", "name": "Older lure", "media": [{"id": "old-photo", "category": "lures", "filename": "501.jpg"}]}]
    monkeypatch.setattr(cloud_storage, "_json_request", page)
    monkeypatch.setattr(cloud_storage, "get_logbook", lambda: (document, '"1"'))
    monkeypatch.setattr(cloud_storage, "get_object", lambda *args: (b"synthetic media", {}))
    fish = make_app(tmp_path, storage_backend="cloud", cloud_api_url="https://cloud.invalid")
    response = fish.client.get("/api/archive")
    assert response.status_code == 200
    with ZipFile(BytesIO(response.data)) as bundle:
        loaded, names = read_import_bundle(bundle)
        assert loaded == document
        assert "media/lures/501.jpg" in names
        assert bundle.read("media/lures/501.jpg") == b"synthetic media"
    assert len(calls) == 2


def test_cloud_media_lookup_follows_category_cursor(monkeypatch):
    pages = iter([{"media": [{"filename": "new.jpg"}], "nextCursor": "older"}, {"media": [{"filename": "old.jpg"}], "nextCursor": None}])
    calls = []

    def page(method, path):
        calls.append(parse_qs(urlsplit(path).query))
        return next(pages), {}, 200

    monkeypatch.setattr(cloud_storage, "_json_request", page)
    assert cloud_storage.inventory_item("lures", "old.jpg") == {"filename": "old.jpg"}
    assert all(call["category"] == ["lures"] for call in calls)
    assert calls[1]["cursor"] == ["older"]


@pytest.mark.parametrize("payload", [
    {"media": [{}] * 500},
    {"media": [{}], "nextCursor": 12},
    {"media": [], "nextCursor": "unusable"},
    {"media": "invalid"},
])
def test_cloud_media_inventory_refuses_incomplete_or_invalid_pages(monkeypatch, payload):
    monkeypatch.setattr(cloud_storage, "_json_request", lambda *args: (payload, {}, 200))
    with pytest.raises(cloud_storage.CloudStorageError):
        cloud_storage.list_media()


def test_cloud_media_inventory_refuses_repeating_cursor(monkeypatch):
    monkeypatch.setattr(cloud_storage, "_json_request", lambda *args: ({"media": [{}], "nextCursor": "repeated"}, {}, 200))
    with pytest.raises(cloud_storage.CloudStorageError, match="cursor"):
        cloud_storage.list_media()


def test_older_worker_small_inventory_remains_supported(monkeypatch):
    monkeypatch.setattr(cloud_storage, "_json_request", lambda *args: ({"media": [{"filename": "one.jpg"}]}, {}, 200))
    assert cloud_storage.list_media() == [{"filename": "one.jpg"}]
