"""Sampled NOAA currents remain available without a regular flow grid."""

from backend import great_lakes_service as service


def test_currents_keep_samples_when_regular_grid_is_unavailable(monkeypatch):
    def no_regular_grid(*_args):
        raise RuntimeError("No regular grid")

    monkeypatch.setattr(
        service,
        "_sample_model",
        lambda model, kind, hour, depth: (
            [{"latitude": 43.5, "longitude": -79.5, "u": 0.2, "v": 0.2, "speed": 0.283, "direction": 45, "depthMeters": depth}],
            {"model": model, "available": True, "validTime": "2026-09-28T12:00:00Z"},
        ),
    )
    monkeypatch.setattr(service, "_current_grid_field", no_regular_grid)
    monkeypatch.setattr(service, "_current_payload_cache", {})

    payload = service.great_lakes_payload("currents", 0, 10, ("LOOFS",))

    assert len(payload["data"]) == 1
    assert payload["data"][0]["validTime"] == "2026-09-28T12:00:00Z"
    assert payload["fields"] == []
    assert payload["metadata"]["models"][0]["gridAvailable"] is False


def test_regular_current_profile_reports_each_depth(monkeypatch):
    monkeypatch.setattr(service, "discovered_runs", lambda models: {"LOOFS": {"files": {0: "mock"}, "date": 20260928, "cycle": 0}})
    monkeypatch.setattr(service, "_metadata", lambda path: {"u": "u", "v": "v"})
    monkeypatch.setattr(service, "_regular_grid_dimensions", lambda path: (2, 2, [0, 5, 10]))
    monkeypatch.setattr(service, "_ascii", lambda path, query: query)
    monkeypatch.setattr(service, "_numbers", lambda query, variable: {"Latitude": [43, 44], "Longitude": [78, 79], "mask": [1], "u": [0, 0.2, 0.4], "v": [0.1, 0.2, 0]}[variable])

    profile = service._current_profile_for_model("LOOFS", 0, 43.1, -78.1)

    assert profile["available"] is True
    assert [row["depthMeters"] for row in profile["values"]] == [0, 5, 10]
    assert [round(row["directionDegrees"]) for row in profile["values"]] == [0, 45, 90]
    assert profile["depthApproximate"] is False


def test_fvcom_current_profile_uses_sigma_depths(monkeypatch):
    monkeypatch.setattr(service, "discovered_runs", lambda models: {"LOOFS": {"files": {0: "mock"}, "date": 20260928, "cycle": 0}})
    monkeypatch.setattr(service, "_metadata", lambda path: {"u": "u", "v": "v"})
    monkeypatch.setattr(service, "_regular_grid_dimensions", lambda path: (0, 0, []))
    monkeypatch.setattr(service, "_field_dimensions", lambda path: (3, 4))
    monkeypatch.setattr(service, "_get", lambda url: "Float32 u[time = 1][siglay = 3][nele = 4];")
    monkeypatch.setattr(service, "_ascii", lambda path, query: query)
    monkeypatch.setattr(service, "_numbers", lambda query, variable: {"latc": [43, 43.5, 44, 44.5], "lonc": [78, 79, 80, 81], "nv": [1, 2, 3], "u": [0.3, 0.2, 0.1], "v": [0, 0.2, 0.1], "h": [20], "siglay": [0.1, 0.5, 0.9]}[variable])

    profile = service._current_profile_for_model("LOOFS", 0, 43.1, -78.1)

    assert profile["available"] is True
    assert [row["depthMeters"] for row in profile["values"]] == [2, 10, 18]
    assert [round(row["directionDegrees"]) for row in profile["values"]] == [90, 45, 45]
    assert profile["depthApproximate"] is True


def test_current_profile_route_validates_coordinates(monkeypatch):
    import server

    monkeypatch.setattr(server, "great_lakes_current_profile", lambda *args: {"available": True, "values": []})
    client = server.create_app({"TESTING": True}).test_client()

    assert client.get("/api/great-lakes/current-profile?latitude=nan&longitude=-78").status_code == 400
    assert client.get("/api/great-lakes/current-profile?latitude=43.5&longitude=-78").json["available"] is True
