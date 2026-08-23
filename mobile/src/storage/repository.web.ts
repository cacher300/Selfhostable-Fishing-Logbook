import { defaultLogbook } from "../domain/defaults";
import { normalizeLogbook } from "../domain/logbook";
import type { Logbook } from "../domain/types";

const databaseName = "fishing-logbook-web";
const storeName = "logbook";
const recordKey = "canonical";
let opening: Promise<IDBDatabase> | null = null;

function database() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = null; reject(request.error); };
  });
  return opening;
}

async function read(): Promise<Logbook> {
  const db = await database();
  const value = await new Promise<unknown>((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(recordKey);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return value ? normalizeLogbook(value as Partial<Logbook>) : structuredClone(defaultLogbook);
}

async function write(value: Logbook): Promise<Logbook> {
  const logbook = normalizeLogbook(value); const db = await database();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(logbook, recordKey);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  return logbook;
}

/** Expo SQLite's OPFS access handles survive web Fast Refresh; IndexedDB is durable and reload-safe. */
export async function loadLogbook(): Promise<Logbook> { return read(); }
export async function saveLogbook(value: Logbook): Promise<Logbook> { return write(value); }
export async function inLogbookTransaction<T>(operation: (current: Logbook) => Promise<{ next: Logbook; result: T }> | { next: Logbook; result: T }): Promise<T> {
  const outcome = await operation(await read()); await write(outcome.next); return outcome.result;
}
