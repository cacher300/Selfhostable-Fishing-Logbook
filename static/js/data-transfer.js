function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fishing-logbook-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const nextState = JSON.parse(text);

    if (location.protocol === "file:") {
      if (!Array.isArray(nextState.trips) || !Array.isArray(nextState.lures) || !Array.isArray(nextState.flashers)) {
        throw new Error("That file does not look like a Fishing Logbook export.");
      }
      state = normalizeState(nextState);
      localStorage.setItem(storageKey, JSON.stringify(state));
    } else {
      const response = await protectedFetch("/api/logbook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextState)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "The logbook import is invalid.");
      }
      state = await loadState();
      localStorage.setItem(storageKey, JSON.stringify(state));
    }

    renderAll();
    event.target.value = "";
  } catch (error) {
    console.error("Could not import logbook.", error);
    alert(error.message || "The logbook import could not be saved.");
  }
}
