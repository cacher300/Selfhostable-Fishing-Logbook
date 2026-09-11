from __future__ import annotations

import base64
import json
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from .backend_config import FISH_API_TOKEN, FISH_API_TOKEN_FILE, FISH_CLOUD_API_URL, FISH_STORAGE_BACKEND


class CloudStorageError(RuntimeError):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def enabled() -> bool:
    return FISH_STORAGE_BACKEND == "cloud" and bool(FISH_CLOUD_API_URL)


def _token() -> str:
    token = FISH_API_TOKEN.strip()
    if not token and FISH_API_TOKEN_FILE:
        try:
            token = Path(FISH_API_TOKEN_FILE).read_text(encoding="utf-8").strip()
        except OSError as error:
            raise CloudStorageError("Cloud storage token is unavailable", 503) from error
    if not token:
        raise CloudStorageError("Cloud storage token is not configured", 503)
    return token


def _request(
    method: str,
    path: str,
    *,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[bytes, dict[str, str], int]:
    request_headers = {
        "Authorization": f"Bearer {_token()}",
        "User-Agent": "Fish-Logbook/1.0",
        "X-Fish-Client": "fish-web",
        **(headers or {}),
    }
    request = Request(
        f"{FISH_CLOUD_API_URL.rstrip('/')}{path}",
        data=body,
        method=method,
        headers=request_headers,
    )
    try:
        with urlopen(request, timeout=45) as response:
            return response.read(), {key.lower(): value for key, value in response.headers.items()}, response.status
    except HTTPError as error:
        payload = error.read()
        try:
            message = json.loads(payload).get("error") or error.reason
        except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
            message = error.reason
        raise CloudStorageError(str(message), error.code) from error
    except (URLError, TimeoutError, OSError) as error:
        raise CloudStorageError(f"Cloud storage is unavailable: {error}", 503) from error


def _json_request(
    method: str,
    path: str,
    *,
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[dict, dict[str, str], int]:
    body = None
    request_headers = dict(headers or {})
    if payload is not None:
        body = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    raw, response_headers, status = _request(method, path, body=body, headers=request_headers)
    try:
        decoded = json.loads(raw or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise CloudStorageError("Cloud storage returned invalid JSON") from error
    return decoded, response_headers, status


def get_logbook() -> tuple[dict, str]:
    payload, headers, _ = _json_request("GET", "/api/logbook")
    return payload, headers.get("etag", "")


def put_logbook(payload: dict, revision: str = "") -> str:
    headers = {"If-Match": revision} if revision else {}
    _, response_headers, _ = _json_request("PUT", "/api/logbook", payload=payload, headers=headers)
    return response_headers.get("etag", "")


def _object_path(kind: str, category: str, filename: str) -> str:
    return f"/api/{kind}/{quote(category, safe='')}/{quote(filename, safe='')}"


def put_media(
    category: str,
    filename: str,
    content: bytes,
    content_type: str,
    original_name: str,
    metadata: dict,
) -> dict:
    metadata_json = json.dumps(metadata, allow_nan=False, separators=(",", ":")).encode("utf-8")
    encoded_metadata = base64.b64encode(metadata_json).decode("ascii")
    raw, _, _ = _request(
        "PUT",
        _object_path("media", category, filename),
        body=content,
        headers={
            "Content-Type": content_type or "application/octet-stream",
            "X-Original-Filename": original_name,
            "X-Fish-Metadata": encoded_metadata,
        },
    )
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise CloudStorageError("Cloud storage returned invalid upload data") from error


def put_preview(category: str, filename: str, content: bytes) -> None:
    _request(
        "PUT",
        _object_path("previews", category, filename),
        body=content,
        headers={"Content-Type": "image/jpeg"},
    )


def get_object(category: str, filename: str, *, preview: bool = False) -> tuple[bytes, dict[str, str]]:
    kind = "previews" if preview else "media"
    body, headers, _ = _request("GET", _object_path(kind, category, filename))
    return body, headers


def delete_object(category: str, filename: str, *, preview: bool = False, missing_ok: bool = False) -> None:
    kind = "previews" if preview else "media"
    try:
        _request("DELETE", _object_path(kind, category, filename))
    except CloudStorageError as error:
        if missing_ok and error.status == 404:
            return
        raise


def list_media(category: str | None = None) -> list[dict]:
    query = {"limit": "500"}
    if category:
        query["category"] = category
    payload, _, _ = _json_request("GET", f"/api/media?{urlencode(query)}")
    return payload.get("media", [])


def inventory_item(category: str, filename: str) -> dict | None:
    return next(
        (item for item in list_media(category) if item.get("filename") == filename),
        None,
    )


def timestamp(value: str) -> float:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (AttributeError, TypeError, ValueError):
        return 0


def payload_from_inventory(item: dict) -> dict:
    category = str(item.get("category") or "")
    filename = str(item.get("filename") or "")
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    public_metadata = {key: value for key, value in metadata.items() if not key.startswith("_")}
    preview_filename = str(metadata.get("previewFilename") or "")
    return {
        **public_metadata,
        "category": category,
        "filename": filename,
        "name": metadata.get("name") or item.get("original_name") or filename,
        "path": f"{category}/{filename}",
        "url": f"/uploads/{category}/{filename}",
        "image": f"/uploads/{category}/{filename}",
        "mediaType": metadata.get("mediaType") or (
            "video" if str(item.get("content_type") or "").startswith("video/") else "image"
        ),
        "mimeType": metadata.get("mimeType") or item.get("content_type") or "",
        "previewFilename": preview_filename,
        "previewPath": f"{category}/_previews/{preview_filename}" if preview_filename else "",
        "previewUrl": f"/uploads/{category}/_previews/{preview_filename}" if preview_filename else "",
        "previewImage": f"/uploads/{category}/_previews/{preview_filename}" if preview_filename else "",
        "size": int(item.get("byte_size") or 0),
        "modified": timestamp(item.get("uploaded_at")),
        "downloadUrl": f"/uploads/{category}/{filename}",
    }
