import type * as SQLite from "expo-sqlite";
import type { Logbook, MediaRef, Reel, Trip } from "../domain/types";

/** SQLite layout version. It is separate from desktop's archive schemaVersion (currently 1). */
export const STORAGE_SCHEMA_VERSION = 2;

const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS logbook_metadata (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logbook_collections (
  collection_name TEXT NOT NULL,
  position INTEGER NOT NULL,
  record_id TEXT,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (collection_name, position)
);
CREATE INDEX IF NOT EXISTS idx_logbook_collections_id ON logbook_collections(collection_name, record_id);

CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS setup_lines (id TEXT PRIMARY KEY NOT NULL, trip_id TEXT NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_setup_lines_trip ON setup_lines(trip_id, position);
CREATE TABLE IF NOT EXISTS catches (id TEXT PRIMARY KEY NOT NULL, trip_id TEXT NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_catches_trip ON catches(trip_id, position);
CREATE TABLE IF NOT EXISTS lost_fish (id TEXT PRIMARY KEY NOT NULL, trip_id TEXT NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lost_fish_trip ON lost_fish(trip_id, position);
CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS launches (id TEXT PRIMARY KEY NOT NULL, location_id TEXT NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_launches_location ON launches(location_id, position);
CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gear_items (kind TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (kind, id));
CREATE TABLE IF NOT EXISTS line_history (id TEXT PRIMARY KEY NOT NULL, reel_id TEXT NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_line_history_reel ON line_history(reel_id, position);
CREATE TABLE IF NOT EXISTS media_items (id TEXT NOT NULL, owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (id, owner_kind, owner_id));
CREATE INDEX IF NOT EXISTS idx_media_owner ON media_items(owner_kind, owner_id, position);
CREATE TABLE IF NOT EXISTS predefined_fields (collection_name TEXT NOT NULL, position INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (collection_name, position));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL);
`;

const legacyCollections = [
  "species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes",
  "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes",
  "trollingPresentations", "trollingDirections", "setupLineSides", "lures", "flashers",
  "reels", "rods", "rodReelCombos", "people", "locations", "trips",
] as const;
const predefinedCollections = new Set<string>(legacyCollections.slice(0, 14));

async function tableExists(db: SQLite.SQLiteDatabase, table: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table);
  return Boolean(row);
}

/**
 * Migrates v1's generic prototype tables without deleting them. The canonical new tables are
 * populated atomically first, so an interrupted upgrade leaves the old app data recoverable.
 */
export async function migrateStorage(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  await db.execAsync(CREATE_SCHEMA_SQL);
  const canonicalRows = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM logbook_metadata");
  if (Number(canonicalRows?.count ?? 0) === 0 && await tableExists(db, "mobile_metadata")) {
    await db.withTransactionAsync(async () => {
      const metadata = await db.getAllAsync<{ key: string; value_json: string }>("SELECT key, value_json FROM mobile_metadata");
      const entries = await db.getAllAsync<{ collection_name: string; position: number; record_id: string | null; payload_json: string }>("SELECT collection_name, position, record_id, payload_json FROM mobile_entries ORDER BY collection_name, position");
      for (const row of metadata) await db.runAsync("INSERT INTO logbook_metadata (key, value_json) VALUES (?, ?)", row.key, row.value_json);
      for (const row of entries) await db.runAsync("INSERT INTO logbook_collections (collection_name, position, record_id, payload_json) VALUES (?, ?, ?, ?)", row.collection_name, row.position, row.record_id, row.payload_json);
    });
  }
  await db.execAsync(`PRAGMA user_version = ${STORAGE_SCHEMA_VERSION}`);
}

const json = (value: unknown) => JSON.stringify(value);
const idOf = (value: unknown, fallback: string) => {
  const id = value && typeof value === "object" ? (value as { id?: unknown }).id : undefined;
  return typeof id === "string" && id ? id : fallback;
};

function collectMedia(value: unknown, ownerKind: string, ownerId: string, into: Array<{ media: MediaRef; ownerKind: string; ownerId: string }>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach((item) => collectMedia(item, ownerKind, ownerId, into)); return; }
  const record = value as Record<string, unknown>;
  if (typeof record.filename === "string" && typeof record.category === "string") into.push({ media: record as MediaRef, ownerKind, ownerId });
}

/** Rebuilds normalized query projections; canonical JSON remains the only source used to export. */
export async function rebuildEntityIndexes(db: SQLite.SQLiteDatabase, logbook: Logbook): Promise<void> {
  await db.execAsync("DELETE FROM trips; DELETE FROM setup_lines; DELETE FROM catches; DELETE FROM lost_fish; DELETE FROM locations; DELETE FROM launches; DELETE FROM people; DELETE FROM gear_items; DELETE FROM line_history; DELETE FROM media_items; DELETE FROM predefined_fields; DELETE FROM settings;");

  for (const [key, value] of Object.entries(logbook.settings)) await db.runAsync("INSERT INTO settings (key, value_json) VALUES (?, ?)", key, json(value));
  for (const key of legacyCollections.filter((name) => predefinedCollections.has(name))) {
    for (const [position, value] of (logbook[key] as unknown[]).entries()) await db.runAsync("INSERT INTO predefined_fields (collection_name, position, payload_json) VALUES (?, ?, ?)", key, position, json(value));
  }
  for (const [position, person] of logbook.people.entries()) await db.runAsync("INSERT INTO people (id, position, payload_json) VALUES (?, ?, ?)", idOf(person, `person-${position}`), position, json(person));
  for (const [position, location] of logbook.locations.entries()) {
    const locationId = idOf(location, `location-${position}`);
    await db.runAsync("INSERT INTO locations (id, position, payload_json) VALUES (?, ?, ?)", locationId, position, json(location));
    for (const [launchPosition, launch] of location.launches.entries()) await db.runAsync("INSERT INTO launches (id, location_id, position, payload_json) VALUES (?, ?, ?, ?)", idOf(launch, `${locationId}-launch-${launchPosition}`), locationId, launchPosition, json(launch));
  }
  for (const kind of ["lures", "flashers", "rods", "reels", "rodReelCombos"] as const) {
    for (const [position, item] of logbook[kind].entries()) {
      const itemId = idOf(item, `${kind}-${position}`);
      await db.runAsync("INSERT INTO gear_items (kind, id, position, payload_json) VALUES (?, ?, ?, ?)", kind, itemId, position, json(item));
      if (kind === "reels") {
        const reel = item as Reel;
        for (const [linePosition, line] of reel.lineHistory.entries()) await db.runAsync("INSERT INTO line_history (id, reel_id, position, payload_json) VALUES (?, ?, ?, ?)", idOf(line, `${itemId}-line-${linePosition}`), itemId, linePosition, json(line));
      }
    }
  }
  const media: Array<{ media: MediaRef; ownerKind: string; ownerId: string }> = [];
  for (const [position, trip] of logbook.trips.entries()) {
    const tripId = idOf(trip, `trip-${position}`);
    await db.runAsync("INSERT INTO trips (id, position, payload_json) VALUES (?, ?, ?)", tripId, position, json(trip));
    collectMedia(trip.notePhotos, "trip", tripId, media);
    await indexTripChildren(db, trip, tripId, media);
  }
  for (const [position, item] of logbook.lures.entries()) collectMedia(item.media, "lure", idOf(item, `lure-${position}`), media);
  for (const [position, item] of logbook.flashers.entries()) collectMedia(item.media, "flasher", idOf(item, `flasher-${position}`), media);
  for (const [position, item] of logbook.rods.entries()) collectMedia(item.media, "rod", idOf(item, `rod-${position}`), media);
  for (const [position, item] of logbook.reels.entries()) collectMedia(item.media, "reel", idOf(item, `reel-${position}`), media);
  for (const [position, item] of media.entries()) await db.runAsync("INSERT OR REPLACE INTO media_items (id, owner_kind, owner_id, position, payload_json) VALUES (?, ?, ?, ?, ?)", idOf(item.media, `${item.ownerKind}-${item.ownerId}-${position}`), item.ownerKind, item.ownerId, position, json(item.media));
}

async function indexTripChildren(db: SQLite.SQLiteDatabase, trip: Trip, tripId: string, media: Array<{ media: MediaRef; ownerKind: string; ownerId: string }>): Promise<void> {
  for (const [position, line] of trip.gearUsed.entries()) await db.runAsync("INSERT INTO setup_lines (id, trip_id, position, payload_json) VALUES (?, ?, ?, ?)", idOf(line, `${tripId}-setup-${position}`), tripId, position, json(line));
  for (const [position, catchItem] of trip.catches.entries()) {
    const catchId = idOf(catchItem, `${tripId}-catch-${position}`);
    await db.runAsync("INSERT INTO catches (id, trip_id, position, payload_json) VALUES (?, ?, ?, ?)", catchId, tripId, position, json(catchItem));
    collectMedia(catchItem.photos, "catch", catchId, media);
  }
  for (const [position, lost] of trip.lostFish.entries()) await db.runAsync("INSERT INTO lost_fish (id, trip_id, position, payload_json) VALUES (?, ?, ?, ?)", idOf(lost, `${tripId}-lost-${position}`), tripId, position, json(lost));
}
