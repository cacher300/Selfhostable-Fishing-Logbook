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
  document.querySelectorAll("#tripDialog .trolling-field:not(.catch-presentation-field)").forEach((element) => {
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
  const presentationSelect = row.querySelector(".catch-presentation");
  const presentation = presentationSelect?.value || "";
  const catchPresentationField = row.querySelector(".catch-presentation-field");
  const isCatchRow = row.classList.contains("catch-row");
  const hasSelectedRod = Boolean(row.querySelector(".catch-setup-line")?.value);
  const estimatedDepthLabel = row.querySelector(".estimated-depth-label");
  const isLeadcoreCatch = isCatchRow && catchRowUsesLeadcore(row);
  row.querySelectorAll(".trolling-param").forEach((field) => field.classList.remove("visible"));
  if (isCatchRow && presentationSelect) {
    presentationSelect.disabled = true;
    presentationSelect.setAttribute("aria-disabled", "true");
  }
  if (catchPresentationField) {
    catchPresentationField.classList.toggle("hidden", !isTrollingTrip() || !hasSelectedRod || row.classList.contains("lost-fish-row"));
  }
  if (estimatedDepthLabel) {
    estimatedDepthLabel.dataset.unitLabelText = presentation === "flatline" ? "Estimated depth down" : "Estimated depth";
    estimatedDepthLabel.textContent = presentation === "flatline" ? "Estimated depth down" : "Estimated depth";
  }
  if (!isTrollingTrip()) return;

  if (row.classList.contains("gear-used-row")) {
    if (isLeadcoreCapablePresentation(presentation)) {
      row.querySelector(".param-leadcore")?.classList.add("visible");
    } else {
      const leadcoreToggle = row.querySelector(".trip-gear-leadcore");
      if (leadcoreToggle) leadcoreToggle.checked = false;
    }
    if (presentation === "downrigger" || presentation === "Downrigger") {
      row.querySelector(".param-cheater")?.classList.add("visible");
      if (row.querySelector(".trip-gear-cheater")?.checked) {
        row.querySelector(".param-cheater-lure")?.classList.add("visible");
        row.querySelector(".param-cheater-lure-select")?.classList.add("visible");
      }
    }
    return;
  }

  if (["downrigger", "cheater", "Downrigger", "Cheater"].includes(presentation)) {
    row.querySelector(".param-ball-depth")?.classList.add("visible");
    if (["downrigger", "Downrigger"].includes(presentation)) {
      row.querySelector(".param-deepest-rigger")?.classList.add("visible");
    } else {
      const deepestRiggerToggle = row.querySelector(".catch-deepest-rigger");
      if (deepestRiggerToggle) deepestRiggerToggle.checked = false;
    }
    if (["cheater", "Cheater"].includes(presentation)) {
      row.querySelector(".param-cheater-depth")?.classList.add("visible");
    }
  } else {
    const deepestRiggerToggle = row.querySelector(".catch-deepest-rigger");
    if (deepestRiggerToggle) deepestRiggerToggle.checked = false;
  }
  if (presentation === "flatline") {
    row.querySelector(".param-flatline-weight")?.classList.add("visible");
    row.querySelector(".param-estimated-depth")?.classList.add("visible");
  }
  if (["flatline-leadcore", "Outside Board", "Inside Board"].includes(presentation)) {
    row.querySelector(".param-lure-depth")?.classList.add("visible");
  }
  if (isLeadcoreCatch) {
    row.querySelector(".param-leadcore-colors")?.classList.add("visible");
    row.querySelector(".param-lure-depth")?.classList.add("visible");
    updateLeadcoreEstimatedDepth(row);
  } else {
    const estimatedLureDepth = row.querySelector(".catch-estimated-lure-depth");
    if (estimatedLureDepth) estimatedLureDepth.readOnly = false;
  }
  if (["dipsey-diver", "High Diver", "Low Diver"].includes(presentation)) {
    row.querySelector(".param-dipsey-setting")?.classList.add("visible");
    row.querySelector(".param-line-out")?.classList.add("visible");
    row.querySelector(".param-estimated-depth")?.classList.add("visible");
  }
}

function isLeadcoreCapablePresentation(presentation) {
  return ["Outside Board", "Inside Board", "Chute Rod", "flatline-leadcore", "flatline"].includes(presentation);
}

function setupRowForCatchRow(row) {
  const selectedValue = row.querySelector(".catch-setup-line")?.value || "";
  const setupLineId = selectedValue.split("::")[0];
  return [...els.tripGearRows.querySelectorAll(".gear-used-row")]
    .find((gearRow) => gearRow.dataset.gearId === setupLineId);
}

function catchRowUsesLeadcore(row) {
  const setupRow = setupRowForCatchRow(row);
  const presentation = setupRow?.querySelector(".catch-presentation")?.value || "";
  return isLeadcoreCapablePresentation(presentation) && Boolean(setupRow?.querySelector(".trip-gear-leadcore")?.checked);
}

function leadcoreDepthLabel(colors) {
  const feet = colors * 5;
  const converted = convertUnitValue(feet, "ft", unitPreference("depth"));
  if (converted === null) return "";
  const decimals = unitPreference("depth") === "m" ? 1 : 0;
  const rounded = Math.round(converted * (10 ** decimals)) / (10 ** decimals);
  return `${trimNumber(rounded)} ${unitSymbol("depth")}`;
}

function updateLeadcoreEstimatedDepth(row) {
  const colors = Number(row.querySelector(".catch-leadcore-colors")?.value);
  const output = row.querySelector(".catch-estimated-lure-depth");
  if (!output) return;
  output.readOnly = true;
  output.value = Number.isFinite(colors) && colors > 0 ? leadcoreDepthLabel(colors) : "";
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
