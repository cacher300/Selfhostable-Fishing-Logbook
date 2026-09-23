from __future__ import annotations

import json
import re
import unicodedata
import uuid
from copy import deepcopy
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Callable
from zipfile import BadZipFile, ZIP_STORED, ZipFile

from .backend_config import DEFAULT_LOGBOOK, PREVIEW_DIRNAME, UPLOAD_CATEGORIES
from .logbook_store import validate_logbook
from .media_service import media_key_from_reference, referenced_uploads


SHARED_ARCHIVE_FORMAT = "fishing-logbook-shared-trip"
SHARED_ARCHIVE_VERSION = 2


def _checked_logbook(document: dict) -> dict:
    valid, error = validate_logbook(document)
    if not valid:
        raise SharedTripArchiveError(error or "Only v2 logbooks are supported.")
    return deepcopy(document)


_GEAR_COLLECTIONS = ("lures", "flashers", "reels", "rods", "rodReelCombos")
_ID_COLLECTIONS = ("lures", "flashers", "reels", "rods", "rodReelCombos")


class SharedTripArchiveError(ValueError):
    """A share archive is invalid or cannot be merged safely."""


@dataclass
class ArchiveMedia:
    category: str
    filename: str
    content: bytes
    metadata: dict
    preview: bytes | None = None


@dataclass
class SharedTripArchive:
    logbook: dict
    media: dict[tuple[str, str], ArchiveMedia]


def normalized_name(value: object) -> str:
    """Compare human names without treating presentation differences as identity."""
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", "", text.casefold())


def _record_by_id(records: list[dict], record_id: object) -> dict | None:
    requested_id = str(record_id or "")
    return next((item for item in records if str(item.get("id") or "") == requested_id), None)


def _records_by_ids(records: list[dict], ids: set[str]) -> list[dict]:
    return [deepcopy(item) for item in records if str(item.get("id") or "") in ids]


def _referenced_trip_ids(trip: dict) -> dict[str, set[str]]:
    referenced = {key: set() for key in (*_ID_COLLECTIONS, "people", "spots")}
    for person in trip.get("people", []):
        if isinstance(person, dict) and person.get("id"):
            referenced["people"].add(str(person["id"]))
    for record_group in ("catches", "lostFish"):
        for record in trip.get(record_group, []):
            if not isinstance(record, dict):
                continue
            for key, field in (("people", "personId"), ("spots", "spotId"), ("lures", "lureId"), ("flashers", "flasherId"), ("rods", "rodId")):
                if record.get(field):
                    referenced[key].add(str(record[field]))
    for setup in trip.get("gearUsed", []):
        if not isinstance(setup, dict):
            continue
        for key, field in (("lures", "lureId"), ("flashers", "flasherId"), ("reels", "reelId"), ("rods", "rodId"), ("rodReelCombos", "comboId")):
            if setup.get(field):
                referenced[key].add(str(setup[field]))
    return referenced


def build_shared_logbook(logbook: dict, trip_id: str) -> dict:
    """Return a valid, intentionally small logbook document for one shared trip."""
    normalized = _checked_logbook(logbook)
    trip = _record_by_id(normalized["trips"], trip_id)
    if not trip:
        raise SharedTripArchiveError("Trip not found.")

    selected_trip = deepcopy(trip)
    # An expedition represents other trip history, so a single-trip share stands alone.
    selected_trip["expeditionId"] = ""
    referenced = _referenced_trip_ids(selected_trip)

    selected_combos = _records_by_ids(normalized["rodReelCombos"], referenced["rodReelCombos"])
    for combo in selected_combos:
        if combo.get("rodId"):
            referenced["rods"].add(str(combo["rodId"]))
        if combo.get("reelId"):
            referenced["reels"].add(str(combo["reelId"]))

    people_sources = [*normalized.get("people", []), *(selected_trip.get("people", []))]
    people_by_id: dict[str, dict] = {}
    for person in people_sources:
        if isinstance(person, dict) and person.get("id") and person.get("name"):
            people_by_id.setdefault(str(person["id"]), {"id": str(person["id"]), "name": str(person["name"]).strip()})

    locations: list[dict] = []
    location = _record_by_id(normalized.get("locations", []), selected_trip.get("locationId"))
    if not location:
        location_name = normalized_name(selected_trip.get("location"))
        location = next((item for item in normalized.get("locations", []) if normalized_name(item.get("name")) == location_name), None)
    if location:
        selected_location = deepcopy(location)
        launch_id = str(selected_trip.get("launchId") or "")
        launch_name = normalized_name(selected_trip.get("launch"))
        selected_location["launches"] = [
            launch for launch in selected_location.get("launches", [])
            if str(launch.get("id") or "") == launch_id
            or (launch_name and normalized_name(launch.get("name")) == launch_name)
        ]
        locations.append(selected_location)

    shared = deepcopy(DEFAULT_LOGBOOK)
    shared.update({
        "schemaVersion": 2,
        "trips": [selected_trip],
        "people": [people_by_id[person_id] for person_id in referenced["people"] if person_id in people_by_id],
        "locations": locations,
        "spots": _records_by_ids(normalized.get("spots", []), referenced["spots"]),
        "expeditions": [],
        "lures": _records_by_ids(normalized.get("lures", []), referenced["lures"]),
        "flashers": _records_by_ids(normalized.get("flashers", []), referenced["flashers"]),
        "reels": _records_by_ids(normalized.get("reels", []), referenced["reels"]),
        "rods": _records_by_ids(normalized.get("rods", []), referenced["rods"]),
        "rodReelCombos": selected_combos,
    })
    valid, error = validate_logbook(shared)
    if not valid:
        raise SharedTripArchiveError(error or "The selected trip cannot be shared.")
    return shared


def create_shared_archive(
    logbook: dict,
    trip_id: str,
    read_media: Callable[[str, str], ArchiveMedia | None],
) -> BytesIO:
    shared = build_shared_logbook(logbook, trip_id)
    requested_media = referenced_uploads(shared)
    archive = BytesIO()
    with ZipFile(archive, "w", ZIP_STORED) as bundle:
        bundle.writestr("manifest.json", json.dumps({
            "format": SHARED_ARCHIVE_FORMAT,
            "sharedTripArchiveVersion": SHARED_ARCHIVE_VERSION,
            "schemaVersion": shared["schemaVersion"],
        }, separators=(",", ":")))
        bundle.writestr("logbook.json", json.dumps(shared, allow_nan=False, separators=(",", ":")))
        for category, filename in sorted(requested_media):
            item = read_media(category, filename)
            if not item:
                raise SharedTripArchiveError(f"Shared trip media is missing: {category}/{filename}")
            bundle.writestr(f"media/{category}/{filename}", item.content)
            bundle.writestr(f"media/{category}/{filename}.json", json.dumps(item.metadata, allow_nan=False, separators=(",", ":")))
            if item.preview:
                preview_name = str(item.metadata.get("previewFilename") or f"{Path(filename).stem}.jpg")
                bundle.writestr(f"media/{category}/{PREVIEW_DIRNAME}/{preview_name}", item.preview)
    archive.seek(0)
    return archive


def _archive_media_path(name: str) -> tuple[str, str, bool] | None:
    if not name.startswith("media/") or name.endswith("/"):
        return None
    parts = Path(name).parts
    if len(parts) < 3 or parts[0] != "media" or parts[1] not in UPLOAD_CATEGORIES or parts[1] == "queue":
        raise SharedTripArchiveError("Archive contains an invalid media path.")
    if any(part in {"", ".", ".."} for part in parts) or len(parts) > 4:
        raise SharedTripArchiveError("Archive contains an invalid media path.")
    category = parts[1]
    if len(parts) == 4:
        if parts[2] != PREVIEW_DIRNAME or not parts[3]:
            raise SharedTripArchiveError("Archive contains an invalid preview path.")
        return category, parts[3], True
    filename = parts[2]
    if not filename or Path(filename).name != filename:
        raise SharedTripArchiveError("Archive contains an invalid media path.")
    return category, filename, filename.endswith(".json")


def read_shared_archive(stream) -> SharedTripArchive:
    try:
        with ZipFile(stream) as bundle:
            names = bundle.namelist()
            if len(names) != len(set(names)):
                raise SharedTripArchiveError("Archive contains duplicate file paths.")
            if "manifest.json" not in names or "logbook.json" not in names:
                raise SharedTripArchiveError("Shared trip archive is missing its manifest or logbook.")
            manifest = json.loads(bundle.read("manifest.json"))
            if (
                manifest.get("format") != SHARED_ARCHIVE_FORMAT
                or manifest.get("sharedTripArchiveVersion") != SHARED_ARCHIVE_VERSION
                or manifest.get("schemaVersion") != 2
            ):
                raise SharedTripArchiveError("This is not a supported shared trip archive.")
            payload = json.loads(bundle.read("logbook.json"))
            normalized = _checked_logbook(payload)
            if len(normalized.get("trips", [])) != 1:
                raise SharedTripArchiveError("A shared trip archive must contain exactly one trip.")

            media_content: dict[tuple[str, str], bytes] = {}
            metadata: dict[tuple[str, str], dict] = {}
            previews: dict[tuple[str, str], bytes] = {}
            for name in names:
                media_path = _archive_media_path(name)
                if not media_path:
                    continue
                category, filename, is_preview = media_path
                if is_preview and Path(name).parts[-2] == PREVIEW_DIRNAME:
                    previews[(category, filename)] = bundle.read(name)
                elif filename.endswith(".json"):
                    target = (category, filename.removesuffix(".json"))
                    try:
                        decoded = json.loads(bundle.read(name))
                    except json.JSONDecodeError as error:
                        raise SharedTripArchiveError("Archive contains invalid media metadata.") from error
                    metadata[target] = decoded if isinstance(decoded, dict) else {}
                else:
                    media_content[(category, filename)] = bundle.read(name)

            required_media = referenced_uploads(normalized)
            missing = sorted(required_media - set(media_content))
            if missing:
                category, filename = missing[0]
                raise SharedTripArchiveError(f"Shared trip media is missing: {category}/{filename}")
            media: dict[tuple[str, str], ArchiveMedia] = {}
            for key in required_media:
                content = media_content[key]
                category, filename = key
                item_metadata = metadata.get(key, {})
                preview_name = str(item_metadata.get("previewFilename") or "")
                media[key] = ArchiveMedia(
                    category=category,
                    filename=filename,
                    content=content,
                    metadata=item_metadata,
                    preview=previews.get((category, preview_name)),
                )
            return SharedTripArchive(normalized, media)
    except SharedTripArchiveError:
        raise
    except (BadZipFile, OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SharedTripArchiveError("Could not read the shared trip archive.") from error


def _trip_summary(trip: dict) -> dict:
    return {
        "id": str(trip.get("id") or ""),
        "title": str(trip.get("title") or "Untitled trip"),
        "date": str(trip.get("date") or ""),
        "location": str(trip.get("location") or ""),
        "launch": str(trip.get("launch") or ""),
        "method": str(trip.get("method") or ""),
        "launchTime": str(trip.get("launchTime") or ""),
        "linesPulledTime": str(trip.get("linesPulledTime") or ""),
        "caught": len(trip.get("catches") or []),
        "lost": len(trip.get("lostFish") or []),
        "people": [str(person.get("name") or "") for person in trip.get("people", []) if isinstance(person, dict) and person.get("name")],
    }


def _time_window_overlaps(first: dict, second: dict) -> bool | None:
    first_start = str(first.get("launchTime") or "")
    first_end = str(first.get("linesPulledTime") or "")
    second_start = str(second.get("launchTime") or "")
    second_end = str(second.get("linesPulledTime") or "")
    if not all((first_start, first_end, second_start, second_end)):
        return None

    def minutes(value: str) -> int | None:
        match = re.fullmatch(r"(\d{1,2}):(\d{2})", value)
        if not match:
            return None
        hour, minute = (int(part) for part in match.groups())
        return (hour * 60) + minute if hour < 24 and minute < 60 else None

    first_values = (minutes(first_start), minutes(first_end))
    second_values = (minutes(second_start), minutes(second_end))
    if any(value is None for value in (*first_values, *second_values)):
        return None
    first_begin, first_finish = first_values
    second_begin, second_finish = second_values
    if first_finish < first_begin:
        first_finish += 24 * 60
    if second_finish < second_begin:
        second_finish += 24 * 60
    return max(first_begin, second_begin) <= min(first_finish, second_finish)


def likely_overlaps(incoming_trip: dict, local_logbook: dict) -> list[dict]:
    """Rank intentionally conservative same-day candidates for human reconciliation."""
    candidates: list[tuple[int, dict]] = []
    incoming_location = normalized_name(incoming_trip.get("location"))
    incoming_launch = normalized_name(incoming_trip.get("launch"))
    incoming_people = {normalized_name(person.get("name")) for person in incoming_trip.get("people", []) if isinstance(person, dict)}
    for trip in _checked_logbook(local_logbook).get("trips", []):
        if str(trip.get("date") or "") != str(incoming_trip.get("date") or ""):
            continue
        location_matches = bool(incoming_location and incoming_location == normalized_name(trip.get("location")))
        launch_matches = bool(incoming_launch and incoming_launch == normalized_name(trip.get("launch")))
        if not (location_matches or launch_matches):
            continue
        time_overlap = _time_window_overlaps(incoming_trip, trip)
        if time_overlap is False:
            continue
        score = 4 + (2 if location_matches else 0) + (2 if launch_matches else 0)
        if time_overlap:
            score += 2
        if normalized_name(incoming_trip.get("method")) and normalized_name(incoming_trip.get("method")) == normalized_name(trip.get("method")):
            score += 1
        if normalized_name(incoming_trip.get("title")) and normalized_name(incoming_trip.get("title")) == normalized_name(trip.get("title")):
            score += 1
        local_people = {normalized_name(person.get("name")) for person in trip.get("people", []) if isinstance(person, dict)}
        if incoming_people & local_people:
            score += 1
        candidates.append((score, _trip_summary(trip)))
    return [candidate for _, candidate in sorted(candidates, key=lambda item: (-item[0], item[1]["title"], item[1]["id"]))]


def archive_preview(archive: SharedTripArchive, local_logbook: dict) -> dict:
    trip = archive.logbook["trips"][0]
    local = _checked_logbook(local_logbook)
    local_people = [person for person in local.get("people", []) if person.get("id") and person.get("name")]
    source_people = {str(person.get("id")): person for person in trip.get("people", []) if isinstance(person, dict) and person.get("id") and person.get("name")}
    for record_group in ("catches", "lostFish"):
        for record in trip.get(record_group, []):
            person_id = str(record.get("personId") or "")
            if person_id and person_id not in source_people:
                source = _record_by_id(archive.logbook.get("people", []), person_id)
                if source:
                    source_people[person_id] = source
    people = []
    for source_id, source in sorted(source_people.items(), key=lambda item: str(item[1].get("name")).casefold()):
        key = normalized_name(source.get("name"))
        suggestion = next((person for person in local_people if normalized_name(person.get("name")) == key), None)
        people.append({
            "sourceId": source_id,
            "name": str(source.get("name") or ""),
            "suggestedPersonId": str(suggestion.get("id") or "") if suggestion else "",
            "suggestedName": str(suggestion.get("name") or "") if suggestion else "",
        })
    return {
        "trip": _trip_summary(trip),
        "people": people,
        "candidates": likely_overlaps(trip, local),
    }


def _unique_id(existing_ids: set[str], preferred: object) -> str:
    candidate = str(preferred or "").strip()
    if candidate and candidate not in existing_ids:
        existing_ids.add(candidate)
        return candidate
    while True:
        candidate = str(uuid.uuid4())
        if candidate not in existing_ids:
            existing_ids.add(candidate)
            return candidate


def _canonical_record(record: dict) -> str:
    value = {key: item for key, item in record.items() if key != "id"}
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _rewrite_media_references(value: object, mapping: dict[tuple[str, str], tuple[str, str]]) -> object:
    if isinstance(value, list):
        return [_rewrite_media_references(item, mapping) for item in value]
    if not isinstance(value, dict):
        return value
    rewritten = {key: _rewrite_media_references(item, mapping) for key, item in value.items()}
    key = media_key_from_reference(rewritten)
    if not key or key not in mapping:
        return rewritten
    category, filename = mapping[key]
    if "category" in rewritten:
        rewritten["category"] = category
    if "filename" in rewritten:
        rewritten["filename"] = filename
    return rewritten


def _unique_spot_name(name: str, used_names: set[str]) -> str:
    base = name or "Imported Spot"
    candidate = base
    suffix = 2
    while normalized_name(candidate) in used_names:
        candidate = f"{base} (Imported {suffix})"
        suffix += 1
    used_names.add(normalized_name(candidate))
    return candidate


def merge_shared_archive(
    archive: SharedTripArchive,
    local_logbook: dict,
    person_mappings: dict[str, str],
    action: str,
    replacement_trip_id: str = "",
) -> tuple[dict, list[str], str]:
    """Merge a reviewed shared archive; return state, stale-media keys, and trip ID."""
    if action not in {"add", "replace", "keep-local"}:
        raise SharedTripArchiveError("Choose how to handle the possible duplicate trip.")
    if action == "keep-local":
        return _checked_logbook(local_logbook), [], ""

    local = _checked_logbook(local_logbook)
    incoming = deepcopy(archive.logbook)
    trip = deepcopy(incoming["trips"][0])
    source_trip_id = str(trip.get("id") or "")
    candidates = {item["id"] for item in likely_overlaps(trip, local)}
    discarded_media: list[str] = []
    if action == "replace":
        if not replacement_trip_id or replacement_trip_id not in candidates:
            raise SharedTripArchiveError("Choose one of the suggested overlapping trips to replace.")
        replacement = _record_by_id(local["trips"], replacement_trip_id)
        if not replacement:
            raise SharedTripArchiveError("The selected local trip no longer exists.")
        discarded_media = [f"{category}/{filename}" for category, filename in referenced_uploads(replacement)]
        local["trips"] = [item for item in local["trips"] if str(item.get("id") or "") != replacement_trip_id]

    # Map people before catches/lost fish are rewritten.
    source_people = {str(person.get("id")): deepcopy(person) for person in incoming.get("people", []) if person.get("id") and person.get("name")}
    for person in trip.get("people", []):
        if isinstance(person, dict) and person.get("id") and person.get("name"):
            source_people.setdefault(str(person["id"]), deepcopy(person))
    existing_people = {str(person.get("id")): person for person in local.get("people", []) if person.get("id")}
    used_person_ids = set(existing_people)
    people_map: dict[str, str] = {}
    for source_id, person in source_people.items():
        selected_id = str(person_mappings.get(source_id) or "").strip()
        if selected_id:
            if selected_id not in existing_people:
                raise SharedTripArchiveError("A selected person is no longer available in this logbook.")
            people_map[source_id] = selected_id
            continue
        destination_id = _unique_id(used_person_ids, source_id)
        people_map[source_id] = destination_id
        local["people"].append({"id": destination_id, "name": str(person.get("name") or "").strip()})

    for person in trip.get("people", []):
        if isinstance(person, dict) and str(person.get("id") or "") in people_map:
            person["id"] = people_map[str(person["id"])]
    for record_group in ("catches", "lostFish"):
        for record in trip.get(record_group, []):
            source_person_id = str(record.get("personId") or "")
            if source_person_id in people_map:
                record["personId"] = people_map[source_person_id]

    # Locations are useful context but never overwrite an existing location or launch.
    source_locations = incoming.get("locations", [])
    source_location = _record_by_id(source_locations, trip.get("locationId"))
    if not source_location:
        source_location = next((item for item in source_locations if normalized_name(item.get("name")) == normalized_name(trip.get("location"))), None)
    if source_location:
        existing_location = next((item for item in local["locations"] if normalized_name(item.get("name")) == normalized_name(source_location.get("name"))), None)
        if not existing_location:
            location_ids = {str(item.get("id") or "") for item in local["locations"]}
            existing_location = deepcopy(source_location)
            existing_location["id"] = _unique_id(location_ids, source_location.get("id"))
            launch_ids: set[str] = set()
            for launch in existing_location.get("launches", []):
                launch["id"] = _unique_id(launch_ids, launch.get("id"))
            local["locations"].append(existing_location)
        trip["locationId"] = str(existing_location.get("id") or "")
        trip["location"] = str(existing_location.get("name") or trip.get("location") or "")
        source_launch = next((item for item in source_location.get("launches", []) if str(item.get("id") or "") == str(trip.get("launchId") or "")), None)
        if not source_launch:
            source_launch = next((item for item in source_location.get("launches", []) if normalized_name(item.get("name")) == normalized_name(trip.get("launch"))), None)
        if source_launch:
            existing_launch = next((item for item in existing_location.get("launches", []) if normalized_name(item.get("name")) == normalized_name(source_launch.get("name"))), None)
            if not existing_launch:
                existing_launch = deepcopy(source_launch)
                existing_launch["id"] = _unique_id({str(item.get("id") or "") for item in existing_location.get("launches", [])}, source_launch.get("id"))
                existing_location.setdefault("launches", []).append(existing_launch)
            trip["launchId"] = str(existing_launch.get("id") or "")
            trip["launch"] = str(existing_launch.get("name") or trip.get("launch") or "")

    # Only referenced spots come across. Same name plus same geometry is reused.
    referenced = _referenced_trip_ids(trip)
    spot_map: dict[str, str] = {}
    used_spot_ids = {str(item.get("id") or "") for item in local["spots"]}
    used_spot_names = {normalized_name(item.get("name")) for item in local["spots"]}
    for source_spot in _records_by_ids(incoming.get("spots", []), referenced["spots"]):
        source_id = str(source_spot.get("id") or "")
        existing_spot = next((item for item in local["spots"] if normalized_name(item.get("name")) == normalized_name(source_spot.get("name")) and item.get("coordinates") == source_spot.get("coordinates") and item.get("radiusMeters") == source_spot.get("radiusMeters")), None)
        if existing_spot:
            spot_map[source_id] = str(existing_spot.get("id") or "")
            continue
        source_spot["id"] = _unique_id(used_spot_ids, source_id)
        source_spot["name"] = _unique_spot_name(str(source_spot.get("name") or ""), used_spot_names)
        spot_map[source_id] = source_spot["id"]
        local["spots"].append(source_spot)
    for record_group in ("catches", "lostFish"):
        for record in trip.get(record_group, []):
            source_spot_id = str(record.get("spotId") or "")
            if source_spot_id in spot_map:
                record["spotId"] = spot_map[source_spot_id]

    # Gear is carried only when the trip references it. Existing matching IDs are reused;
    # collisions get fresh IDs and all trip references are rewritten.
    id_maps: dict[str, dict[str, str]] = {key: {} for key in _ID_COLLECTIONS}
    imported_gear_ids: dict[str, set[str]] = {key: set() for key in _ID_COLLECTIONS}
    used_ids = {key: {str(item.get("id") or "") for item in local[key]} for key in _ID_COLLECTIONS}
    for collection in ("lures", "flashers", "reels", "rods"):
        for source in incoming.get(collection, []):
            source_id = str(source.get("id") or "")
            if source_id not in referenced[collection]:
                continue
            existing = _record_by_id(local[collection], source_id)
            if existing and _canonical_record(existing) == _canonical_record(source):
                id_maps[collection][source_id] = source_id
                continue
            copied = deepcopy(source)
            copied["id"] = _unique_id(used_ids[collection], source_id)
            id_maps[collection][source_id] = copied["id"]
            local[collection].append(copied)
            imported_gear_ids[collection].add(copied["id"])
    for source in incoming.get("rodReelCombos", []):
        source_id = str(source.get("id") or "")
        if source_id not in referenced["rodReelCombos"]:
            continue
        copied = deepcopy(source)
        if str(copied.get("rodId") or "") in id_maps["rods"]:
            copied["rodId"] = id_maps["rods"][str(copied["rodId"])]
        if str(copied.get("reelId") or "") in id_maps["reels"]:
            copied["reelId"] = id_maps["reels"][str(copied["reelId"])]
        existing = _record_by_id(local["rodReelCombos"], source_id)
        if existing and _canonical_record(existing) == _canonical_record(copied):
            id_maps["rodReelCombos"][source_id] = source_id
            continue
        copied["id"] = _unique_id(used_ids["rodReelCombos"], source_id)
        id_maps["rodReelCombos"][source_id] = copied["id"]
        local["rodReelCombos"].append(copied)
        imported_gear_ids["rodReelCombos"].add(copied["id"])
    for setup in trip.get("gearUsed", []):
        for collection, field in (("lures", "lureId"), ("flashers", "flasherId"), ("reels", "reelId"), ("rods", "rodId"), ("rodReelCombos", "comboId")):
            source_id = str(setup.get(field) or "")
            if source_id in id_maps[collection]:
                setup[field] = id_maps[collection][source_id]
    for record_group in ("catches", "lostFish"):
        for record in trip.get(record_group, []):
            for collection, field in (("lures", "lureId"), ("flashers", "flasherId"), ("rods", "rodId")):
                source_id = str(record.get(field) or "")
                if source_id in id_maps[collection]:
                    record[field] = id_maps[collection][source_id]

    imported_gear = {
        collection: [item for item in local[collection] if str(item.get("id") or "") in imported_gear_ids[collection]]
        for collection in _GEAR_COLLECTIONS
    }
    required_source_media = referenced_uploads([trip, *imported_gear.values()])
    media_map: dict[tuple[str, str], tuple[str, str]] = {}
    rewritten_media: dict[tuple[str, str], ArchiveMedia] = {}
    for key in required_source_media:
        item = archive.media.get(key)
        if not item:
            category, filename = key
            raise SharedTripArchiveError(f"Shared trip media is missing: {category}/{filename}")
        category, filename = key
        replacement = f"{uuid.uuid4().hex}{Path(filename).suffix.lower() or '.bin'}"
        preview_name = f"{Path(replacement).stem}.jpg" if item.preview else ""
        metadata = deepcopy(item.metadata)
        if preview_name:
            metadata["previewFilename"] = preview_name
        else:
            metadata.pop("previewFilename", None)
        media_map[key] = (category, replacement)
        rewritten_media[(category, replacement)] = ArchiveMedia(category, replacement, item.content, metadata, item.preview)
    trip = _rewrite_media_references(trip, media_map)
    for collection in _GEAR_COLLECTIONS:
        local[collection] = [
            _rewrite_media_references(item, media_map)
            if str(item.get("id") or "") in imported_gear_ids[collection]
            else item
            for item in local[collection]
        ]

    trip["id"] = _unique_id({str(item.get("id") or "") for item in local["trips"]}, source_trip_id)
    trip["expeditionId"] = ""
    local["trips"].append(trip)
    merged = local
    valid, error = validate_logbook(merged)
    if not valid:
        raise SharedTripArchiveError(error or "Shared trip could not be merged.")
    # The caller needs the transformed media to copy it after the merge is validated.
    archive.media = rewritten_media
    return merged, discarded_media, str(trip["id"])
