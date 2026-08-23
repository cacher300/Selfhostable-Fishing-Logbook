import { Platform } from "react-native";
import type { Logbook } from "../domain/types";

const databaseName = "fishing-logbook-media";
const storeName = "originals";
let databasePromise: Promise<IDBDatabase> | null = null;

function key(category: string, filename: string) { return `${category}/${filename}`; }
function mediaType(filename: string) { const extension = filename.split(".").pop()?.toLowerCase(); return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", mov: "video/quicktime", mp4: "video/mp4" } as Record<string, string>)[extension || ""] || "application/octet-stream"; }
function database() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}
async function read(category: string, filename: string): Promise<Blob | undefined> {
  if (Platform.OS !== "web") return undefined;
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key(category, filename));
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Keeps original archive media in browser storage when FileSystem is unavailable on Expo Web. */
export async function storeWebMedia(category: string, filename: string, data: Uint8Array): Promise<string | undefined> {
  if (Platform.OS !== "web") return undefined;
  const db = await database(); const copy = new Uint8Array(data.length); copy.set(data); const blob = new Blob([copy.buffer], { type: mediaType(filename) });
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(blob, key(category, filename));
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  return URL.createObjectURL(blob);
}

export async function webMediaUri(category: string, filename: string): Promise<string | undefined> {
  const blob = await read(category, filename);
  return blob ? URL.createObjectURL(blob) : undefined;
}

/** Recreates transient object URLs after a browser restart without storing those URLs in SQLite. */
export async function hydrateWebMediaUris(logbook: Logbook): Promise<Logbook> {
  if (Platform.OS !== "web") return logbook;
  const copy = structuredClone(logbook);
  const walk = async (value: unknown): Promise<void> => {
    if (Array.isArray(value)) { await Promise.all(value.map(walk)); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.category === "string" && typeof record.filename === "string") {
      const uri = await webMediaUri(record.category, record.filename);
      if (uri) record.uri = uri;
    }
    await Promise.all(Object.values(record).map(walk));
  };
  await walk(copy);
  return copy;
}
