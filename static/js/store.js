// Central logbook store.
//
// `state` (from app-state.js) is the read-only view every renderer uses. All
// changes go through `commit(mutate)`: the mutation runs on a copy, the copy is
// validated against the shared schema, persisted as record-level changes (or a
// whole-document save when needed), and only then becomes the new state.
// Failed commits leave `state` untouched. Commits run one at a time so every
// diff is taken against the last persisted document.
import { protectedFetch, storageKey } from "./app-config.js";
import { logbookRevision, setLogbookRevision, setState, state } from "./app-state.js";
import { validateState } from "./app-normalization.js";
import { COLLECTION_KEYS, OBJECT_COLLECTION_KEYS } from "./generated/logbook-schema-rules.js";
import { diffLogbook } from "./logbook-sync.js";

export class LogbookConflictError extends Error {
  constructor() {
    super("This logbook was changed in another tab or on another device. Reload the page to get the latest version; your last change was not saved.");
    this.name = "LogbookConflictError";
  }
}

const listeners = new Set();
let persisted = null;
let queue = Promise.resolve();

// Validate and persist exactly what JSON transport carries (undefined
// properties are dropped, as JSON.stringify always did for saves).
function jsonDocument(document) {
  return JSON.parse(JSON.stringify(document));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key], seen);
  }
  return value;
}

function installState(document) {
  const next = (typeof __STRICT_STATE__ !== "undefined" && __STRICT_STATE__)
    ? deepFreeze(document)
    : document;
  setState(next);
  return next;
}

function cacheLocally(document) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(document));
  } catch (error) {
    console.warn("Could not cache the saved logbook in browser storage.", error);
  }
}

function notify(change) {
  for (const listener of listeners) {
    try {
      listener(state, change);
    } catch (error) {
      console.error("A logbook subscriber failed.", error);
    }
  }
}

/** Call `listener(state, change)` after every successful commit or reload. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The last document known to be persisted (read-only). */
export function persistedDocument() {
  return persisted;
}

/** Install a document that is already persisted (startup, archive import, refresh). */
export function replaceState(document, { revision } = {}) {
  const validated = validateState(document);
  if (revision !== undefined) setLogbookRevision(revision);
  const installed = installState(validated);
  persisted = structuredClone(validated);
  cacheLocally(validated);
  notify({ type: "replace" });
  return installed;
}

/** Reload the stored document from the server and make it current. */
export async function reloadFromServer() {
  const response = await fetch("/api/logbook");
  if (!response.ok) throw new Error("The logbook could not be refreshed from the server.");
  return replaceState(await response.json(), { revision: response.headers.get("ETag") || "" });
}

async function responseError(response, fallback) {
  if (response.status === 412) return new LogbookConflictError();
  const payload = await response.json().catch(() => ({}));
  return new Error(payload.error || fallback);
}

async function persist(document) {
  if (location.protocol === "file:") return;
  const { changes, fullSave } = diffLogbook(persisted, document, {
    collectionKeys: COLLECTION_KEYS,
    objectCollectionKeys: OBJECT_COLLECTION_KEYS,
  });
  if (!fullSave && !changes.length) return;
  const headers = { "Content-Type": "application/json" };
  if (logbookRevision) headers["If-Match"] = logbookRevision;
  const response = fullSave
    ? await protectedFetch("/api/logbook", { method: "PUT", headers, body: JSON.stringify(document) })
    : await protectedFetch("/api/logbook/changes", { method: "POST", headers, body: JSON.stringify({ changes }) });
  if (!response.ok) throw await responseError(response, "Could not save logbook database");
  setLogbookRevision(response.headers.get("ETag") || logbookRevision);
}

/**
 * Apply `mutate(draft)` to a copy of the current logbook and persist it.
 * `mutate` may modify the draft in place or return a replacement document.
 * Resolves with the new state; rejects (leaving state unchanged) on failure.
 */
export function commit(mutate) {
  const run = async () => {
    const draft = structuredClone(state);
    const replacement = await mutate(draft);
    const next = validateState(jsonDocument(replacement === undefined ? draft : replacement));
    await persist(next);
    const installed = installState(next);
    persisted = structuredClone(next);
    cacheLocally(next);
    notify({ type: "commit" });
    return installed;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
