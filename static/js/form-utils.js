function setupMinutesFromRow(row) {
  return calculateMinutes(
    row.querySelector(".trip-gear-start-time").value,
    row.querySelector(".trip-gear-end-time").value
  );
}

function isTrollingTrip() {
  return getValue("method").toLowerCase() === "trolling";
}

function updateTrollingVisibility() {
  const trolling = isTrollingTrip();
  document.querySelectorAll("#tripDialog .trolling-field").forEach((element) => {
    element.classList.toggle("hidden", !trolling);
  });
  document.querySelectorAll("#tripDialog .trolling-catch-line-field").forEach((element) => {
    element.classList.toggle("hidden", !trolling);
  });
  document.querySelectorAll("#tripDialog .catch-row .direct-catch-gear:not(.trolling-field)").forEach((element) => {
    element.classList.toggle("hidden", trolling);
  });
  document.querySelectorAll(".catch-row, .gear-used-row").forEach(updatePresentationFields);
}

function updatePresentationFields(row) {
  const presentation = row.querySelector(".catch-presentation")?.value || "";
  row.querySelectorAll(".trolling-param").forEach((field) => field.classList.remove("visible"));
  if (!isTrollingTrip()) return;

  if (row.classList.contains("gear-used-row")) {
    if (presentation === "downrigger") {
      row.querySelector(".param-deepest-rigger")?.classList.add("visible");
    }
    return;
  }

  if (presentation === "downrigger" || presentation === "cheater") {
    row.querySelector(".param-ball-depth")?.classList.add("visible");
  }
  if (presentation === "flatline-leadcore") {
    row.querySelector(".param-board-line")?.classList.add("visible");
    row.querySelector(".param-lure-depth")?.classList.add("visible");
  }
  if (presentation === "dipsey-diver") {
    row.querySelector(".param-dipsey-setting")?.classList.add("visible");
    row.querySelector(".param-line-out")?.classList.add("visible");
    row.querySelector(".param-estimated-depth")?.classList.add("visible");
  }
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
