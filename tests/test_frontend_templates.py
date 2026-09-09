from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

from server import create_app


ROOT = Path(__file__).resolve().parents[1]


def test_frontend_template_renders_all_partials_once() -> None:
    app = create_app({"TESTING": True, "SECRET_KEY": "frontend-template-test"})
    with patch("server.read_logbook", return_value={"settings": {"theme": "dark"}}):
        response = app.test_client().get("/trips")

    assert response.status_code == 200
    markup = response.get_data(as_text=True)
    assert '<html lang="en" data-theme="dark">' in markup
    assert "Fishing Logbook" in markup
    assert 'id="tripListPanel"' in markup
    assert 'id="tripDialog"' in markup
    assert 'id="checklistsPanel"' in markup
    assert 'id="loadSpreadTemplateButton"' not in markup
    assert 'id="saveSpreadTemplateButton"' not in markup
    assert 'id="settingsSpreadTemplateSelect"' not in markup
    assert 'id="spreadTemplateDialog"' not in markup
    assert 'id="tripTemplatesDialog"' not in markup
    assert 'id="tripChecklistItems"' not in markup
    assert 'id="catchRowTemplate"' in markup
    assert 'class="catch-deepest-rigger"' in markup
    assert 'class="trip-gear-deepest-rigger"' not in markup
    assert "Previous standalone leaderboard markup" not in markup
    assert "{% include" not in markup

    ids = re.findall(r'\bid="([^"]+)"', markup)
    assert len(ids) == len(set(ids)), "Rendered frontend contains duplicate element IDs"


def test_checklists_route_renders_the_app() -> None:
    app = create_app({"TESTING": True, "SECRET_KEY": "checklists-route-test"})
    with patch("server.read_logbook", return_value={"settings": {}}):
        response = app.test_client().get("/checklists")

    assert response.status_code == 200
    assert 'id="checklistsPanel"' in response.get_data(as_text=True)


def test_standalone_frontend_is_current() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/build-standalone.py"), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
