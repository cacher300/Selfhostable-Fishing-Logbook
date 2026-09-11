async function saveState() {
  state = normalizeState(state);
  localStorage.setItem(storageKey, JSON.stringify(state));

  if (location.protocol === "file:") return;

  const headers = { "Content-Type": "application/json" };
  if (logbookRevision) headers["If-Match"] = logbookRevision;
  const response = await protectedFetch("/api/logbook", {
    method: "PUT",
    headers,
    body: JSON.stringify(state)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not save logbook database");
  }
  logbookRevision = response.headers.get("ETag") || logbookRevision;
}
