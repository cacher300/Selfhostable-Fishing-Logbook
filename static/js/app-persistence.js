let lastPersistedState = null;

function rememberPersistedState(value) {
  lastPersistedState = structuredClone(value);
}

async function saveState() {
  const nextState = validateState(state);

  if (location.protocol === "file:") {
    state = nextState;
    localStorage.setItem(storageKey, JSON.stringify(state));
    rememberPersistedState(state);
    return;
  }

  const headers = { "Content-Type": "application/json" };
  if (logbookRevision) headers["If-Match"] = logbookRevision;
  try {
    const response = await protectedFetch("/api/logbook", {
      method: "PUT",
      headers,
      body: JSON.stringify(nextState)
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Could not save logbook database");
    }
    logbookRevision = response.headers.get("ETag") || logbookRevision;
  } catch (error) {
    if (lastPersistedState) state = structuredClone(lastPersistedState);
    throw error;
  }
  state = nextState;
  rememberPersistedState(state);
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not cache the saved logbook in browser storage.", error);
  }
}
