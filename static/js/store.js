// Central logbook store.
//
// `state` (from app-state.js) is the read-only view every renderer uses. All
// changes go through `commit(mutate)`: the mutation runs on a copy, the copy is
// validated against the shared schema, saved to the server as the whole document
// (with If-Match, so a stale save is refused), and only then becomes the new
// state. Failed commits leave `state` untouched. Commits run one at a time, and
// a commit that changes nothing sends no request.
import { protectedFetch, storageKey } from "./app-config.js";
import { logbookRevision, setLogbookRevision, setState, state } from "./app-state.js";
import { validateState } from "./app-normalization.js";

class LogbookConflictError extends Error {
  constructor() {
    super("This logbook was changed in another tab or on another device. Reload the page to get the latest version; your last change was not saved.");
    this.name = "LogbookConflictError";
  }
}

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

/** Install a document that is already persisted (startup, archive import, refresh). */
export function replaceState(document, { revision } = {}) {
  const validated = validateState(document);
  if (revision !== undefined) setLogbookRevision(revision);
  const installed = installState(validated);
  persisted = structuredClone(validated);
  cacheLocally(validated);
  return installed;
}

async function responseError(response, fallback) {
  if (response.status === 412) return new LogbookConflictError();
  const payload = await response.json().catch(() => ({}));
  return new Error(payload.error || fallback);
}

async function persist(document) {
  if (location.protocol === "file:") return;
  const body = JSON.stringify(document);
  if (persisted && body === JSON.stringify(persisted)) return;
  const headers = { "Content-Type": "application/json" };
  if (logbookRevision) headers["If-Match"] = logbookRevision;
  const response = await protectedFetch("/api/logbook", { method: "PUT", headers, body });
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
    return installed;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
