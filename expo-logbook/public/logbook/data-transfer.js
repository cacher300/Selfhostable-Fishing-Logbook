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
    if (!Array.isArray(nextState.trips) || !Array.isArray(nextState.lures) || !Array.isArray(nextState.flashers) || !Array.isArray(nextState.people || [])) {
      alert("That file does not look like a Fishing Logbook export.");
      return;
    }
    state = normalizeState(nextState);
    await saveState();
    renderAll();
    event.target.value = "";
  } catch (error) {
    console.error("Could not import logbook.", error);
    alert(error.message || "The logbook import could not be saved.");
  }
}
