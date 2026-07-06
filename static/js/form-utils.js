function setupMinutesFromRow(row) {
  return calculateMinutes(
    row.querySelector(".trip-gear-start-time").value,
    row.querySelector(".trip-gear-end-time").value
  );
}

function isTrollingTrip() {
  return getValue("method").toLowerCase() === "trolling";
}

function isCastingTrip() {
  return getValue("method").toLowerCase() === "casting";
}

function updateTrollingVisibility() {
  const trolling = isTrollingTrip();
  const casting = isCastingTrip();
  document.querySelectorAll("#tripDialog .trolling-field").forEach((element) => {
    element.classList.toggle("hidden", !trolling);
  });
  document.querySelectorAll("#tripDialog .casting-field").forEach((element) => {
    element.classList.toggle("hidden", !casting);
  });
  document.querySelectorAll("#tripDialog .trolling-catch-line-field").forEach((element) => {
    element.classList.toggle("hidden", !trolling);
  });
  document.querySelectorAll("#tripDialog .catch-row .direct-catch-gear:not(.trolling-field)").forEach((element) => {
    element.classList.toggle("hidden", trolling);
  });
  document.querySelectorAll("#tripDialog .catch-row").forEach((row) => {
    const hideDuplicateDepth = trolling || row.classList.contains("lost-fish-row");
    row.querySelector(".catch-water-depth-field")?.classList.toggle("hidden", hideDuplicateDepth);
    row.querySelector(".catch-depth-down-field")?.classList.toggle("hidden", hideDuplicateDepth);
  });
  document.querySelectorAll(".catch-row, .gear-used-row").forEach(updatePresentationFields);
  renderLiveTrollingSpread();
}

function updatePresentationFields(row) {
  const presentation = row.querySelector(".catch-presentation")?.value || "";
  const estimatedDepthLabel = row.querySelector(".estimated-depth-label");
  row.querySelectorAll(".trolling-param").forEach((field) => field.classList.remove("visible"));
  if (estimatedDepthLabel) {
    estimatedDepthLabel.dataset.unitLabelText = presentation === "flatline" ? "Estimated depth down" : "Estimated depth";
    estimatedDepthLabel.textContent = presentation === "flatline" ? "Estimated depth down" : "Estimated depth";
  }
  if (!isTrollingTrip()) return;

  if (row.classList.contains("gear-used-row")) {
    if (presentation === "downrigger" || presentation === "Downrigger") {
      row.querySelector(".param-cheater")?.classList.add("visible");
      if (row.querySelector(".trip-gear-cheater")?.checked) {
        row.querySelector(".param-cheater-lure")?.classList.add("visible");
      }
    }
    return;
  }

  if (["downrigger", "cheater", "Downrigger", "Cheater"].includes(presentation)) {
    row.querySelector(".param-ball-depth")?.classList.add("visible");
    if (["cheater", "Cheater"].includes(presentation)) {
      row.querySelector(".param-cheater-depth")?.classList.add("visible");
    }
  }
  if (presentation === "flatline") {
    row.querySelector(".param-flatline-weight")?.classList.add("visible");
    row.querySelector(".param-estimated-depth")?.classList.add("visible");
  }
  if (["flatline-leadcore", "Outside Board", "Inside Board"].includes(presentation)) {
    row.querySelector(".param-board-line")?.classList.add("visible");
    row.querySelector(".param-lure-depth")?.classList.add("visible");
  }
  if (["dipsey-diver", "High Diver", "Low Diver"].includes(presentation)) {
    row.querySelector(".param-dipsey-setting")?.classList.add("visible");
    row.querySelector(".param-line-out")?.classList.add("visible");
    row.querySelector(".param-estimated-depth")?.classList.add("visible");
  }
}

function updateCheaterDepth(row) {
  const output = row.querySelector(".catch-cheater-depth");
  if (!output) return;
  const ballDepth = Number.parseFloat(row.querySelector(".catch-ball-depth")?.value);
  output.value = Number.isFinite(ballDepth) ? trimNumber(ballDepth / 2) : "";
}

function trimNumber(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
