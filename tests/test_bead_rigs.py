from copy import deepcopy

from backend.backend_config import DEFAULT_LOGBOOK
from backend.shared_trip_archive import SharedTripArchive, build_shared_logbook, merge_shared_archive


def test_three_beads_share_all_dependencies_and_remap_colliding_ids():
    source = deepcopy(DEFAULT_LOGBOOK)
    source["lures"] = [
        {"id": f"bead-{index}", "name": f"Bead {index}", "type": "Bead", "beadMaterial": "Glass"}
        for index in range(1, 4)
    ]
    rig = {"lureId": "bead-1", "beadCount": 3, "secondBeadLureId": "bead-2", "thirdBeadLureId": "bead-3", "thirdBeadSpacing": "12 in"}
    source["trips"] = [{
        "id": "trip", "people": [], "gearUsed": [{"id": "line", **rig}],
        "catches": [{"id": "catch", "species": "Rainbow Trout", "quantity": 2, **rig}],
        "lostFish": [{"id": "lost", "possibleSpecies": "Rainbow Trout", **rig}],
    }]
    shared = build_shared_logbook(source, "trip")
    assert {item["id"] for item in shared["lures"]} == {"bead-1", "bead-2", "bead-3"}
    destination = deepcopy(DEFAULT_LOGBOOK)
    destination["lures"] = [{"id": "bead-2", "name": "Different local lure"}, {"id": "bead-3", "name": "Another local lure"}]
    merged, _, trip_id = merge_shared_archive(SharedTripArchive(shared, {}), destination, {}, "add")
    trip = next(item for item in merged["trips"] if item["id"] == trip_id)
    names = {item["id"]: item["name"] for item in merged["lures"]}
    for record in [*trip["gearUsed"], *trip["catches"], *trip["lostFish"]]:
        assert record["beadCount"] == 3
        assert record["secondBeadLureId"] != "bead-2"
        assert record["thirdBeadLureId"] != "bead-3"
        assert names[record["secondBeadLureId"]] == "Bead 2"
        assert names[record["thirdBeadLureId"]] == "Bead 3"
        assert record["thirdBeadSpacing"] == "12 in"
    assert trip["catches"][0]["quantity"] == 2
    assert len(trip["lostFish"]) == 1
