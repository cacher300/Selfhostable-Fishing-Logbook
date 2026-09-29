// Turn two logbook documents into record-level changes for POST /api/logbook/changes.
//
// The server applies operations in order: deletes, then upserts. An upsert of
// an existing record without an index replaces it in place; a new record is
// inserted at its index. Collections whose surviving records were reordered,
// and plain option lists, are sent as a whole-collection "replace".

const MAX_CHANGES = 200;

function recordId(record) {
  return record && typeof record === "object" ? String(record.id || "") : "";
}

function same(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function hasUniqueIds(records) {
  const ids = records.map(recordId);
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

function diffObjectCollection(key, previous, next) {
  if (!hasUniqueIds(previous) || !hasUniqueIds(next)) return [{ op: "replace", collection: key, items: next }];
  const nextIds = new Set(next.map(recordId));
  const previousById = new Map(previous.map((record) => [recordId(record), record]));
  const survivingPrevious = previous.map(recordId).filter((id) => nextIds.has(id));
  const survivingNext = next.map(recordId).filter((id) => previousById.has(id));
  if (!same(survivingPrevious, survivingNext)) return [{ op: "replace", collection: key, items: next }];

  const changes = previous
    .map(recordId)
    .filter((id) => !nextIds.has(id))
    .map((id) => ({ op: "delete", collection: key, id }));
  next.forEach((record, index) => {
    const existing = previousById.get(recordId(record));
    if (!existing) changes.push({ op: "upsert", collection: key, record, index });
    else if (!same(existing, record)) changes.push({ op: "upsert", collection: key, record });
  });
  return changes;
}

/**
 * @returns {{ changes: object[], fullSave: boolean }} ``fullSave`` is true when
 * the difference cannot be expressed as record changes (or is too large to be
 * worth it) and the whole document should be PUT instead.
 */
export function diffLogbook(previous, next, { collectionKeys, objectCollectionKeys }) {
  if (!previous || !next) return { changes: [], fullSave: true };
  const managed = new Set([...collectionKeys, "settings"]);
  const topLevelKeys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of topLevelKeys) {
    if (managed.has(key)) continue;
    if (!same(previous[key], next[key])) return { changes: [], fullSave: true };
  }
  const changes = [];
  for (const key of collectionKeys) {
    const before = previous[key];
    const after = next[key];
    if (same(before, after)) continue;
    if (!Array.isArray(after) || (before !== undefined && !Array.isArray(before))) return { changes: [], fullSave: true };
    if (objectCollectionKeys.has(key) && Array.isArray(before)) changes.push(...diffObjectCollection(key, before, after));
    else changes.push({ op: "replace", collection: key, items: after });
  }
  if (!same(previous.settings, next.settings)) changes.push({ op: "settings", value: next.settings });
  if (changes.length > MAX_CHANGES) return { changes: [], fullSave: true };
  return { changes, fullSave: false };
}
