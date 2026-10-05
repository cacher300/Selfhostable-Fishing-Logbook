from __future__ import annotations

from array import array

from backend import great_lakes_service as service
from backend import great_lakes_upwelling as upwelling
from backend import great_lakes_volumes as volumes
from conftest import make_app

ROWS, COLUMNS = 20, 30


def _lake(surface_c: float = 18.0, depth: float = 40.0):
    """A rectangular lake: land around the edge, open water inside."""
    wet = [0 < row < ROWS - 1 and 0 < column < COLUMNS - 1 for row in range(ROWS) for column in range(COLUMNS)]
    surface = [surface_c if ok else None for ok in wet]
    bottoms = [depth if ok else None for ok in wet]
    return wet, surface, bottoms


def _patch(values: list, rows: range, columns: range, value) -> None:
    for row in rows:
        for column in columns:
            values[row * COLUMNS + column] = value


def _score_kinds(result: dict) -> set[str]:
    return {"upwelling" if value < 0 else "downwelling" for value in result["score"] if value is not None}


def test_cold_water_against_a_shore_is_upwelling() -> None:
    wet, surface, bottoms = _lake()
    _patch(surface, range(1, 6), range(1, 12), 18.0 - 3.0)  # 5.4 °F colder along the north shore
    near = upwelling.near_shore_cells(wet, ROWS, COLUMNS, 2)

    result = upwelling.scores(surface, None, None, bottoms, ROWS, COLUMNS, 8, 8, 4, near)

    marked = [cell for cell, value in enumerate(result["score"]) if value is not None]
    assert _score_kinds(result) == {"upwelling"}
    assert all(1 <= cell // COLUMNS <= 5 for cell in marked)
    strongest = min(value for value in result["score"] if value is not None)
    assert -upwelling.SCORE_LIMIT_F <= strongest <= -4.0


def test_a_lake_cooling_all_over_is_not_upwelling() -> None:
    # A cold front: every spot 4 °F cooler than yesterday, but no colder than its surroundings.
    wet, surface, bottoms = _lake(16.0)
    previous = [None if value is None else 18.2 for value in surface]

    result = upwelling.scores(surface, previous, None, bottoms, ROWS, COLUMNS, 8, 8)

    assert _score_kinds(result) == set()


def test_cooling_over_the_day_strengthens_a_weak_cold_patch() -> None:
    wet, surface, bottoms = _lake()
    _patch(surface, range(1, 6), range(1, 12), 18.0 - 1.5)  # 2.7 °F colder; against its surroundings, under the 2.5 °F score
    previous = [None if value is None else 18.0 for value in surface]

    assert _score_kinds(upwelling.scores(surface, None, None, bottoms, ROWS, COLUMNS, 8, 8)) == set()
    # ... but it cooled 2.7 °F since yesterday, while the rest of the lake did not.
    assert _score_kinds(upwelling.scores(surface, previous, None, bottoms, ROWS, COLUMNS, 8, 8)) == {"upwelling"}


def test_warm_water_piled_against_a_shore_with_a_deeper_thermocline_is_downwelling() -> None:
    wet, surface, bottoms = _lake()
    thermocline = [10.0 if ok else None for ok in wet]
    _patch(thermocline, range(14, 19), range(15, 29), 28.0)  # 18 m (59 ft) deeper along the south shore

    result = upwelling.scores(surface, None, thermocline, bottoms, ROWS, COLUMNS, 8, 8, 4, upwelling.near_shore_cells(wet, ROWS, COLUMNS, 2))

    assert _score_kinds(result) == {"downwelling"}


def test_shallow_water_and_small_or_offshore_patches_are_left_out() -> None:
    wet, surface, bottoms = _lake()
    _patch(bottoms, range(1, 6), range(1, 12), 4.0)  # a shallow bay
    _patch(surface, range(1, 6), range(1, 12), 15.0)
    _patch(surface, range(9, 12), range(13, 17), 15.0)  # a cold eddy in the middle of the lake
    _patch(surface, range(15, 17), range(25, 27), 15.0)  # a cold speck by the shore
    near = upwelling.near_shore_cells(wet, ROWS, COLUMNS, 2)

    result = upwelling.scores(surface, None, None, bottoms, ROWS, COLUMNS, 8, 8, 6, near)

    assert _score_kinds(result) == set()


def test_box_mean_and_shore_distance() -> None:
    values = [float(index) for index in range(9)]
    assert upwelling.box_mean(values, [True] * 9, 3, 3, 1, 1)[4] == 4.0
    assert upwelling.box_mean(values, [index != 8 for index in range(9)], 3, 3, 1, 1)[8] == (4 + 5 + 7) / 3
    wet, _, _ = _lake()
    near = upwelling.near_shore_cells(wet, ROWS, COLUMNS, 2)
    assert near[2 * COLUMNS + 15] and not near[10 * COLUMNS + 15] and not near[0]


def test_the_day_before_is_the_older_run_at_the_same_forecast_hour() -> None:
    path = "NOAA/LOOFS/MODELS/2026/10/01/loofs.t06z.20261001.regulargrid.f005.nc"
    assert upwelling.previous_day_path(path) == "NOAA/LOOFS/MODELS/2026/09/30/loofs.t06z.20260930.regulargrid.f005.nc"
    assert upwelling.previous_day_path("nonsense") is None


def _volume() -> volumes.Volume:
    wet, surface, _ = _lake()
    _patch(surface, range(1, 6), range(1, 12), 15.0)
    levels = [surface, [None if value is None else 8.0 for value in surface]]
    values = array("f", [float("nan") if value is None else value for level in levels for value in level])
    return volumes.Volume("temperature", "LOOFS", "20261005t06z", 5, ROWS, COLUMNS, 1, 1,
                          [43.0 + 0.01 * row for row in range(ROWS)], [-78.0 + 0.013 * column for column in range(COLUMNS)],
                          array("B", wet), [0.0, 30.0], {"temp": values})


def test_layer_and_point_lookup(monkeypatch, tmp_path) -> None:
    volume = _volume()
    run = {"id": "20261005t06z", "cycleEpoch": 1791180000.0, "files": {5: "NOAA/LOOFS/MODELS/2026/10/05/loofs.t06z.20261005.regulargrid.f005.nc"}}
    path = run["files"][5]
    monkeypatch.setattr(service, "MODELS", ("LOOFS",))
    monkeypatch.setattr(service, "_model_volume", lambda kind, model, hour: (run, 5, path, {"temperature": "temp"}, volume))
    monkeypatch.setattr(service, "_thermocline_depths", lambda *args: [None] * volume.cells)
    monkeypatch.setattr(service, "_volume_bottom_depths", lambda model, vol: [40.0] * vol.cells)
    monkeypatch.setattr(service, "_regular_grid_dimensions", lambda p: (ROWS, COLUMNS, [0.0, 30.0]))
    monkeypatch.setattr(service, "_water_mask_or_none", lambda *args: None)
    monkeypatch.setattr(service, "_data_key", lambda models, hour: (("LOOFS", run["id"], 5),))
    fetched = []

    def no_day_before(url, expression):
        fetched.append(url)
        raise OSError("NOAA unreachable")

    monkeypatch.setattr(upwelling.gl_cache, "fetch_dods", no_day_before)

    value = upwelling.upwelling_value(0, 43.03, -77.96, ("LOOFS",))
    assert value["available"] and value["kind"] == "upwelling" and value["strengthF"] >= 2.5
    assert value["comparedWithDayBefore"] is False and fetched == [f"{service.THREDDS}/dodsC/NOAA/LOOFS/MODELS/2026/10/04/loofs.t06z.20261004.regulargrid.f005.nc"]
    assert round(value["surfaceC"], 1) == 15.0 and value["surroundingC"] > 15.0
    open_lake = upwelling.upwelling_value(0, 43.12, -77.75, ("LOOFS",))
    assert open_lake["available"] and open_lake["kind"] is None

    payload = upwelling.upwelling_rasters(0, 128, ("LOOFS",))
    assert payload["metadata"]["minScoreF"] == -upwelling.SCORE_LIMIT_F and payload["metadata"]["maxScoreF"] == upwelling.SCORE_LIMIT_F
    model = payload["metadata"]["models"][0]
    assert model["available"] and model["upwellingCells"] > 0 and model["downwellingCells"] == 0 and model["comparedWithDayBefore"] is False
    assert payload["rasters"][0]["imageUrl"].startswith(("data:image/", "/api/"))

    client = make_app(tmp_path).client
    assert client.get("/api/great-lakes/upwelling-value?forecastHour=0&latitude=43.03&longitude=-77.96&models=LOOFS").json["kind"] == "upwelling"
    assert client.get("/api/great-lakes/upwelling-raster?forecastHour=0&resolution=128&models=LOOFS").json["metadata"]["maxScoreF"] == upwelling.SCORE_LIMIT_F
