"""Forecast animation: frame times, the shared colour scale, and preparation."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

from backend import great_lakes_animation as animation
from backend import great_lakes_refresher as refresher
from backend import great_lakes_service as service
from conftest import make_app


def _epoch(text: str) -> float:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc).timestamp()


def test_frames_sit_on_three_hourly_clock_times_out_to_48_hours() -> None:
    # 16:10 UTC: "Now" is 16:00; frames at 18:00, 21:00 … 15:00 two days on.
    offsets = service.animation_offsets(_epoch("2026-10-02T16:10:00"))
    assert offsets == (0, *range(2, 48, 3)) and len(offsets) == 17
    # Half past rounds "Now" up to 17:00: the same clock times, one hour closer.
    assert service.animation_offsets(_epoch("2026-10-02T16:40:00")) == (0, *range(1, 48, 3))
    # On a frame time, "Now" is itself a frame and the last one is 48 h out.
    assert service.animation_offsets(_epoch("2026-10-02T18:00:00")) == (0, *range(3, 49, 3))
    assert service.served_offsets(_epoch("2026-10-02T18:00:00")) == (0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48)


def test_shared_scale_covers_every_frame_on_round_steps() -> None:
    assert animation.shared_scale("temperature", [(11.2, 18.3), (10.9, 17.6)]) == (10.5, 18.5)
    assert animation.shared_scale("temperature", [(12.0, 18.0)]) == (12.0, 18.0)  # already round
    assert animation.shared_scale("thermocline", [(0.4, 21.2), (3.0, 30.01)]) == (0.0, 31.0)
    assert animation.shared_scale("currents", [(0.0, 0.181), (0.0, 0.243)]) == (0.0, 0.26)  # speed starts at still water
    assert animation.shared_scale("waves", [(0.0, 0.5), (0.2, 1.31)]) == (0.0, 1.4)
    assert animation.shared_scale("waves", []) is None
    assert animation.frame_range("temperature", {"minC": 4, "maxC": 19.5}) == (4.0, 19.5)
    assert animation.frame_range("waves", {"maxHeightMeters": 1.0}) is None


def _fake_layers(calls):
    def payload(layer, forecast_hour, depth=0.0, scale=None):
        calls.append((layer, forecast_hour, depth, scale))
        low, high = 10.0 + forecast_hour / 10, 15.0 + forecast_hour / 10
        return {
            "rasters": [],
            "metadata": {"minC": low, "maxC": high, "models": [{"available": forecast_hour != 5, "validTime": f"t+{forecast_hour}"}]},
        }
    return payload


def test_index_prepares_frames_on_one_scale_then_reuses_it(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(service, "animation_offsets", lambda now=None: (0, 2, 5))
    monkeypatch.setattr(service, "snap_depth", lambda depth, models: 4.0)
    monkeypatch.setattr(refresher, "data_status", lambda models=service.MODELS: {"version": "v1", "wavesVersion": "w1"})
    monkeypatch.setattr(animation, "layer_payload", _fake_layers(calls))

    index = animation.index("temperature", 3.0, wait_seconds=5)
    assert index["ready"] is True and index["progress"] == {"done": 6, "total": 6}
    assert index["depthMeters"] == 4.0 and index["stepHours"] == 3 and index["spanHours"] == 48
    # Every frame's own range first, then each frame on the shared, rounded scale.
    assert [call[3] for call in calls] == [None, None, None, (10.0, 15.5), (10.0, 15.5), (10.0, 15.5)]
    assert index["scale"] == {"min": 10.0, "max": 15.5}
    assert [frame["forecastHour"] for frame in index["frames"]] == [0, 2, 5]
    assert index["frames"][1] == {"forecastHour": 2, "validTime": "t+2", "available": True,
                                  "url": "/api/great-lakes/temperature-raster?forecastHour=2&depth=4&resolution=512&models=LSOFS%2CLMHOFS%2CLEOFS%2CLOOFS&animation=1&data=v1"}
    assert index["frames"][2]["available"] is False

    # Another worker (empty memory) finds the scale on disk and only draws the frames.
    calls.clear()
    animation.clear_memory()
    again = animation.index("temperature", 3.0, wait_seconds=5)
    assert again["scale"] == index["scale"] and [call[3] for call in calls] == [(10.0, 15.5)] * 3

    # A single frame request uses the same scale.
    calls.clear()
    animation.frame_payload("temperature", 4, 3.0)
    assert calls == [("temperature", 5, 3.0, (10.0, 15.5))]


def test_index_reports_progress_and_errors(monkeypatch) -> None:
    release = __import__("threading").Event()
    monkeypatch.setattr(service, "animation_offsets", lambda now=None: (0, 3))
    monkeypatch.setattr(refresher, "data_status", lambda models=service.MODELS: {"version": "v2", "wavesVersion": "w2"})

    def slow(layer, forecast_hour, depth=0.0, scale=None):
        release.wait(5)
        return {"rasters": [], "metadata": {"minHeightMeters": 0.0, "maxHeightMeters": 1.0, "models": [{"available": True}]}}

    monkeypatch.setattr(animation, "layer_payload", slow)
    waiting = animation.index("waves", wait_seconds=0.05)
    assert waiting["ready"] is False and waiting["progress"]["total"] == 4 and "frames" not in waiting
    release.set()
    done = animation.index("waves", wait_seconds=5)
    assert done["ready"] is True and done["depthMeters"] is None and done["scale"] == {"min": 0.0, "max": 1.0}

    monkeypatch.setattr(refresher, "data_status", lambda models=service.MODELS: {"version": "v3", "wavesVersion": "w3"})
    monkeypatch.setattr(animation, "layer_payload", lambda layer, forecast_hour, depth=0.0, scale=None: {"rasters": [], "metadata": {"models": []}})
    failed = animation.index("waves", wait_seconds=5)
    assert failed["ready"] is False and "unavailable" in failed["error"]


def test_refresher_preparation_is_shared_with_requests(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(service, "animation_offsets", lambda now=None: (0, 1))
    monkeypatch.setattr(refresher, "data_status", lambda models=service.MODELS: {"version": "v4", "wavesVersion": "w4"})
    monkeypatch.setattr(animation, "layer_payload", _fake_layers(calls))
    prepared = animation.prepare("temperature")
    calls.clear()
    with patch.object(animation, "_executor") as executor:
        index = animation.index("temperature", wait_seconds=0)
    executor.submit.assert_not_called()
    assert index["ready"] is True and index["frames"] == prepared["frames"] and calls == []


def test_animation_routes(monkeypatch, tmp_path) -> None:
    calls = []
    monkeypatch.setattr(service, "animation_offsets", lambda now=None: (0, 2, 5, 8))
    monkeypatch.setattr(animation, "scale_for", lambda layer, depth=0.0, offsets=None: (4.0, 18.5))
    monkeypatch.setattr(animation, "layer_payload", lambda layer, hour, depth=0.0, scale=None: calls.append((layer, hour, depth, scale)) or {"rasters": [], "metadata": {}})
    client = make_app(tmp_path).client
    assert client.get("/api/great-lakes/temperature-raster?forecastHour=7&depth=1.5&animation=1").status_code == 200
    assert client.get("/api/great-lakes/currents?forecastHour=3&depth=900&animation=1").status_code == 200
    assert client.get("/api/great-lakes/waves-raster?forecastHour=soon&animation=1").status_code == 400
    assert calls == [("temperature", 8, 1.5, (4.0, 18.5)), ("currents", 2, 500.0, (4.0, 18.5))]

    states = iter([{"ready": False, "progress": {"done": 1, "total": 8}}, {"ready": True, "frames": [], "scale": {"min": 0, "max": 1}}, {"ready": False, "error": "down"}])
    monkeypatch.setattr(animation, "index", lambda layer, depth=0.0: next(states))
    assert client.get("/api/great-lakes/animation/waves").status_code == 202
    assert client.get("/api/great-lakes/animation/waves").json["scale"] == {"min": 0, "max": 1}
    assert client.get("/api/great-lakes/animation/waves").status_code == 503
    assert client.get("/api/great-lakes/animation/salinity").status_code == 404
