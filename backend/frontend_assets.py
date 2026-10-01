"""Resolve built frontend asset URLs from static/dist/manifest.json."""

from __future__ import annotations

import json

from .config import PROJECT_ROOT


MANIFEST = PROJECT_ROOT / "static" / "dist" / "manifest.json"
_cache: tuple[float, dict[str, str]] | None = None


def asset_url(name: str) -> str:
    """Return the relative, content-versioned URL for a built asset.

    Falls back to the unversioned path when the frontend has not been built,
    so templates still render (the page then needs ``npm run build``).
    """
    global _cache
    try:
        modified = MANIFEST.stat().st_mtime
    except OSError:
        return f"static/dist/{'app-styles.css' if name == 'app.css' else name}"
    if not _cache or _cache[0] != modified:
        _cache = (modified, json.loads(MANIFEST.read_text(encoding="utf-8")))
    return _cache[1].get(name, f"static/dist/{name}")


def frontend_is_built() -> bool:
    return MANIFEST.is_file()


def frontend_build_is_stale() -> bool:
    """True when a JS/CSS source file is newer than the built bundle."""
    try:
        built = MANIFEST.stat().st_mtime
    except OSError:
        return True
    sources = [
        *(PROJECT_ROOT / "static" / "js").rglob("*.js"),
        *(PROJECT_ROOT / "static" / "css").rglob("*.css"),
    ]
    return any(source.stat().st_mtime > built for source in sources)
