import * as SQLite from "expo-sqlite";
import { defaultLogbook } from "../domain/defaults";
import { normalizeLogbook } from "../domain/logbook";
import type { Logbook } from "../domain/types";
import { migrateStorage, rebuildEntityIndexes, STORAGE_SCHEMA_VERSION } from "./schema";

const DB = "fishing-logbook.db";
let database: SQLite.SQLiteDatabase | null = null;
let openingDatabase: Promise<SQLite.SQLiteDatabase> | null = null;

const collections = [
  "species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes",
  "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes",
  "trollingPresentations", "trollingDirections", "setupLineSides", "lures", "flashers",
  "reels", "rods", "rodReelCombos", "people", "locations", "trips",
] as const;

type Collection = (typeof collections)[number];
const objectCollections = new Set<Collection>(["lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "trips"]);

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  // React Strict Mode and Fast Refresh can request the first read twice. Expo SQLite's
  // web OPFS VFS permits one access handle per file, so opening must be single-flight.
  if (!openingDatabase) {
    openingDatabase = SQLite.openDatabaseAsync(DB)
      .then(async (connection) => {
        await migrateStorage(connection);
        database = connection;
        return connection;
      })
      .catch((error) => {
        openingDatabase = null;
        throw error;
      });
  }
  return openingDatabase;
}

function parseJson(value: string, fallback: unknown): unknown {
  try { return JSON.parse(value); } catch { return fallback; }
}

function topLevelExtras(logbook: Logbook): Record<string, unknown> {
  const known = new Set<string>([...collections, "schemaVersion", "settings"]);
  return Object.fromEntries(Object.entries(logbook).filter(([key]) => !known.has(key)));
}

/**
 * Loads the canonical archive-shaped document. Entity tables are SQLite indexes/projections
 * used by focused repositories; this keeps every unknown desktop property round-trippable.
 */
async function readCanonical(conn: SQLite.SQLiteDatabase): Promise<Logbook> {
  const metadata = await conn.getAllAsync<{ key: string; value_json: string }>("SELECT key, value_json FROM logbook_metadata");
  if (!metadata.length) return structuredClone(defaultLogbook);

  const map = Object.fromEntries(metadata.map((row) => [row.key, parseJson(row.value_json, null)]));
  const result: Record<string, unknown> = {
    schemaVersion: map.schemaVersion,
    settings: map.settings,
    ...(map.extra && typeof map.extra === "object" ? map.extra as Record<string, unknown> : {}),
  };
  for (const collection of collections) {
    const rows = await conn.getAllAsync<{ payload_json: string }>(
      "SELECT payload_json FROM logbook_collections WHERE collection_name = ? ORDER BY position",
      collection,
    );
    result[collection] = rows.map((row) => parseJson(row.payload_json, null)).filter((item) => item !== null);
  }
  return normalizeLogbook(result as Partial<Logbook>);
}

export async function loadLogbook(): Promise<Logbook> { return readCanonical(await db()); }

async function writeCanonical(conn: SQLite.SQLiteDatabase, value: Logbook): Promise<Logbook> {
  const logbook = normalizeLogbook(value);
  await conn.runAsync("DELETE FROM logbook_metadata");
  await conn.runAsync("DELETE FROM logbook_collections");
  await conn.runAsync("INSERT INTO logbook_metadata (key, value_json) VALUES (?, ?)", "schemaVersion", JSON.stringify(logbook.schemaVersion));
  await conn.runAsync("INSERT INTO logbook_metadata (key, value_json) VALUES (?, ?)", "settings", JSON.stringify(logbook.settings));
  await conn.runAsync("INSERT INTO logbook_metadata (key, value_json) VALUES (?, ?)", "extra", JSON.stringify(topLevelExtras(logbook)));

  for (const collection of collections) {
    const entries = logbook[collection] as unknown[];
    for (const [position, item] of entries.entries()) {
      const recordId = objectCollections.has(collection) && item && typeof item === "object"
        ? String((item as { id?: unknown }).id ?? "")
        : null;
      await conn.runAsync(
        "INSERT INTO logbook_collections (collection_name, position, record_id, payload_json) VALUES (?, ?, ?, ?)",
        collection, position, recordId, JSON.stringify(item),
      );
    }
  }
  await rebuildEntityIndexes(conn, logbook);
  await conn.execAsync(`PRAGMA user_version = ${STORAGE_SCHEMA_VERSION}`);
  return logbook;
}

/** Saves canonical archive data and its entity projections in one SQLite transaction. */
export async function saveLogbook(value: Logbook): Promise<Logbook> {
  const conn = await db();
  let saved!: Logbook;
  await conn.withTransactionAsync(async () => { saved = await writeCanonical(conn, value); });
  return saved;
}

/** Useful to future focused repositories without exposing SQLite implementation details. */
export async function inLogbookTransaction<T>(operation: (current: Logbook) => Promise<{ next: Logbook; result: T }> | { next: Logbook; result: T }): Promise<T> {
  const conn = await db();
  let result!: T;
  await conn.withTransactionAsync(async () => {
    const current = await readCanonical(conn);
    const outcome = await operation(current);
    await writeCanonical(conn, outcome.next);
    result = outcome.result;
  });
  return result;
}
