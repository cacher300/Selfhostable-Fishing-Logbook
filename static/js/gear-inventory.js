function renderInventoryTable(container, headers, rows, emptyText) {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(emptyText)}</p></div>`;
    return;
  }
  const sortState = inventorySortState[container.id];
  container.innerHTML = `
    <table>
      <thead><tr>${headers.map((header, index) => {
        const sortable = Boolean(header) && header !== "Photo";
        const sorted = sortState?.index === index;
        const direction = sorted ? sortState.direction : "none";
        return `<th aria-sort="${direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}">${sortable ? `<button class="inventory-sort-button" type="button" data-inventory-sort-table="${escapeHtml(container.id)}" data-inventory-sort-index="${index}">${escapeHtml(header)}${sorted ? `<span aria-hidden="true"> ${direction === "asc" ? "↑" : "↓"}</span>` : ""}</button>` : escapeHtml(header)}</th>`;
      }).join("")}</tr></thead>
      <tbody>${rows.map((row) => {
        const cells = Array.isArray(row) ? row : row.cells;
        const attributes = Array.isArray(row) ? "" : Object.entries(row.attributes || {})
          .map(([name, value]) => `${escapeHtml(name)}="${escapeHtml(String(value))}"`)
          .join(" ");
        return `<tr ${attributes}>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
      }).join("")}</tbody>
    </table>
  `;
  applyInventoryTableControls(container);
}

let activeGearFilter = { field: "all", query: "" };
const inventorySortState = {};
let gearFilterSuggestionsOpen = false;

function activeInventoryTable() {
  return document.querySelector(`[data-gear-panel="${activeGearTab}"] .inventory-table`);
}

function inventoryHeaderLabels(container) {
  return [...container.querySelectorAll("thead th")].map((header) => header.textContent.replace(/[↑↓]/g, "").trim());
}

function syncGearFilterFields() {
  const container = activeInventoryTable();
  if (!container || !els.gearFilterField) return;
  const headers = inventoryHeaderLabels(container).filter((label) => label && label !== "Photo");
  if (!headers.includes(activeGearFilter.field)) activeGearFilter.field = "all";
  els.gearFilterField.innerHTML = `<option value="all">All fields</option>${headers.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("")}`;
  els.gearFilterField.value = activeGearFilter.field;
  if (els.gearFilterQuery) els.gearFilterQuery.value = activeGearFilter.query;
  syncGearFilterSuggestions();
}

function syncGearFilterSuggestions() {
  const container = activeInventoryTable();
  if (!container || !els.gearFilterSuggestions) return;
  const headers = inventoryHeaderLabels(container);
  const fieldIndex = activeGearFilter.field === "all" ? -1 : headers.indexOf(activeGearFilter.field);
  const query = activeGearFilter.query.trim().toLocaleLowerCase();
  const values = [...new Set([...container.querySelectorAll("tbody tr")].flatMap((row) => {
    const cells = [...row.cells].map((cell) => cell.textContent.trim());
    return fieldIndex >= 0 ? [cells[fieldIndex]] : cells;
  }).filter((value) => value && value !== "-" && value.toLocaleLowerCase().includes(query)))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })).slice(0, 100);
  els.gearFilterSuggestions.innerHTML = values.map((value) => `<button type="button" role="option" data-gear-filter-suggestion="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join("");
  els.gearFilterSuggestions.classList.toggle("hidden", !gearFilterSuggestionsOpen || !values.length);
}

function openGearFilterSuggestions() {
  gearFilterSuggestionsOpen = true;
  syncGearFilterSuggestions();
}

function closeGearFilterSuggestions() {
  gearFilterSuggestionsOpen = false;
  syncGearFilterSuggestions();
}

function selectGearFilterSuggestion(value) {
  if (els.gearFilterQuery) els.gearFilterQuery.value = value;
  activeGearFilter = { field: els.gearFilterField?.value || "all", query: value };
  closeGearFilterSuggestions();
  applyInventoryTableControls();
}

function applyInventoryTableControls(container = activeInventoryTable()) {
  if (!container) return;
  const headers = inventoryHeaderLabels(container);
  const filterIndex = activeGearFilter.field === "all" ? -1 : headers.indexOf(activeGearFilter.field);
  const query = activeGearFilter.query.trim().toLocaleLowerCase();
  const rows = [...container.querySelectorAll("tbody tr")];
  rows.forEach((row) => {
    const cells = [...row.cells].map((cell) => cell.textContent.trim().toLocaleLowerCase());
    const haystack = filterIndex >= 0 ? cells[filterIndex] || "" : cells.join(" ");
    row.hidden = Boolean(query) && !haystack.includes(query);
  });
  const sortState = inventorySortState[container.id];
  if (!sortState) return;
  rows.sort((left, right) => {
    const leftValue = left.cells[sortState.index]?.textContent.trim() || "";
    const rightValue = right.cells[sortState.index]?.textContent.trim() || "";
    const numericLeftText = leftValue.replace(/[^0-9.-]/g, "");
    const numericRightText = rightValue.replace(/[^0-9.-]/g, "");
    const numericLeft = Number(numericLeftText);
    const numericRight = Number(numericRightText);
    const compared = numericLeftText !== "" && numericRightText !== "" && Number.isFinite(numericLeft) && Number.isFinite(numericRight)
      ? numericLeft - numericRight
      : leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sortState.direction === "asc" ? compared : -compared;
  });
  const body = container.querySelector("tbody");
  rows.forEach((row) => body.append(row));
}

function updateGearFilter() {
  activeGearFilter = {
    field: els.gearFilterField?.value || "all",
    query: els.gearFilterQuery?.value || ""
  };
  gearFilterSuggestionsOpen = true;
  syncGearFilterSuggestions();
  applyInventoryTableControls();
}

function clearGearFilter() {
  activeGearFilter = { field: "all", query: "" };
  gearFilterSuggestionsOpen = false;
  syncGearFilterFields();
  syncGearFilterSuggestions();
  applyInventoryTableControls();
}

function sortInventoryTable(tableId, index) {
  const previous = inventorySortState[tableId];
  if (previous?.index === Number(index) && previous.direction === "desc") {
    delete inventorySortState[tableId];
    renderGearLibrary();
    return;
  }
  inventorySortState[tableId] = {
    index: Number(index),
    direction: previous?.index === Number(index) && previous.direction === "asc" ? "desc" : "asc"
  };
  const container = document.querySelector(`#${tableId}`);
  renderGearLibrary();
  applyInventoryTableControls(container);
}

function inventoryRow(type, item, cells) {
  return {
    attributes: { "data-inventory-type": type, "data-inventory-id": item.id },
    cells
  };
}

function gearUsageCells(type, id) {
  const stats = gearPerformanceStats(type, id);
  return [
    escapeHtml(String(stats.landed || 0)),
    stats.lastUsed ? escapeHtml(formatDate(stats.lastUsed)) : "-"
  ];
}

function inventoryThumb(item) {
  const photos = gearPhotos(item);
  if (!photos.length) return "";
  return mediaMarkup(photos[0], "inventory-thumb", { download: false });
}

function openInventoryItemInfo(type, id) {
  if (type === "lure") return openLureInfoDialog(state.lures.find((item) => item.id === id), "inventory");
  if (type === "flasher") return openFlasherInfoDialog(state.flashers.find((item) => item.id === id), "inventory");

  const collection = type === "reel" ? state.reels : type === "rod" ? state.rods : state.rodReelCombos;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  const label = type === "reel" ? "Reel" : type === "rod" ? "Rod" : "Combo";
  const details = type === "reel"
    ? [["Spooled line", lineSummary(activeLineEntry(item))], ["Style", item.style], ["Brand", item.brand], ["Model", item.name], ["Size", item.size], ["Gear ratio", item.gearRatio]]
    : type === "rod"
      ? [["Type", item.type], ["Brand", item.brand], ["Model", item.name], ["Length", item.length], ["Power", item.power], ["Action", item.action]]
      : [["Rod", rodName(item.rodId)], ["Reel", reelName(item.reelId)]];
  const stats = gearPerformanceStats(type, id);
  details.push(["Fish caught", stats.landed], ["Last used", stats.lastUsed ? formatDate(stats.lastUsed) : "-"]);
  els.inventoryInfoTitle.textContent = gearDisplayName(item, label);
  els.inventoryInfoContent.innerHTML = `
    ${gearPhotos(item).length ? `<div class="lure-info-media">${mediaMarkup(gearPhotos(item)[0], "", { download: false })}</div>` : ""}
    <dl class="lure-info-list">${details.filter(([, value]) => value !== "" && value !== null && value !== undefined).map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join("")}</dl>
    ${item.notes ? `<div class="lure-info-notes"><strong>Notes</strong><p>${escapeHtml(item.notes)}</p></div>` : ""}
  `;
  els.inventoryInfoDialog.showModal();
}

function renderReelInventory() {
  const rows = state.reels.map((reel) => {
    return inventoryRow("reel", reel, [
      inventoryThumb(reel),
      escapeHtml(gearDisplayName(reel, "Reel")),
      ...gearUsageCells("reel", reel.id),
      escapeHtml(lineSummary(activeLineEntry(reel)) || "-"),
      escapeHtml(reel.style || "-"),
      escapeHtml(reel.brand || "-"),
      escapeHtml(reel.name || "-"),
      escapeHtml(reel.size || "-"),
      escapeHtml(reel.weight || "-"),
      escapeHtml(reel.gearRatio || "-"),
      escapeHtml(reel.retrieveRate || "-"),
      escapeHtml(displayStoredMeasurement(reel.maxDrag, "fishWeight") || "-"),
      escapeHtml(reel.monoCapacity || "-"),
      escapeHtml(reel.braidCapacity || "-"),
      escapeHtml(reel.purchaseAmount || "-"),
      escapeHtml(reel.dateBought || "-"),
      escapeHtml(reel.quantityAvailable === "" || reel.quantityAvailable === null || reel.quantityAvailable === undefined ? "-" : reel.quantityAvailable),
      `<div class="inventory-actions"><button class="button secondary inventory-edit-action" type="button" data-edit-reel="${escapeHtml(reel.id)}">Edit</button><button class="button secondary" type="button" data-duplicate-reel="${escapeHtml(reel.id)}">Duplicate</button></div>`
    ]);
  });
  renderInventoryTable(els.reelInventoryTable, ["Photo", "Name", "Fish caught", "Last used", "Spooled Line", "Style", "Brand", "Model", "Size", "Weight", "Gear", "Retrieve", `Max Drag (${unitSymbol("fishWeight")})`, "Mono Cap", "Braid Cap", "Purchase", "Bought", "Owned", ""], rows, "No saved reels yet.");
}

function renderRodInventory() {
  const rows = state.rods.map((rod) => {
    return inventoryRow("rod", rod, [
      inventoryThumb(rod),
      escapeHtml(gearDisplayName(rod, "Rod")),
      ...gearUsageCells("rod", rod.id),
      escapeHtml(rod.type || "-"),
      escapeHtml(rod.brand || "-"),
      escapeHtml(rod.name || "-"),
      escapeHtml(rod.length || "-"),
      escapeHtml(rod.power || "-"),
      escapeHtml(rod.action || "-"),
      escapeHtml(rod.lureRating || "-"),
      escapeHtml(rod.purchaseAmount || "-"),
      escapeHtml(rod.dateBought || "-"),
      escapeHtml(rod.quantityAvailable === "" || rod.quantityAvailable === null || rod.quantityAvailable === undefined ? "-" : rod.quantityAvailable),
      `<div class="inventory-actions"><button class="button secondary inventory-edit-action" type="button" data-edit-rod="${escapeHtml(rod.id)}">Edit</button><button class="button secondary" type="button" data-duplicate-rod="${escapeHtml(rod.id)}">Duplicate</button></div>`
    ]);
  });
  renderInventoryTable(els.rodInventoryTable, ["Photo", "Name", "Fish caught", "Last used", "Type", "Brand", "Model", "Length", "Power", "Action", "Lure Rating", "Purchase", "Bought", "Owned", ""], rows, "No saved rods yet.");
}

function renderComboInventory() {
  const rows = state.rodReelCombos.map((combo) => {
    return inventoryRow("combo", combo, [
      escapeHtml(comboName(combo.id) || "Combo"),
      ...gearUsageCells("combo", combo.id),
      escapeHtml(rodName(combo.rodId) || "-"),
      escapeHtml(reelName(combo.reelId) || "-"),
      escapeHtml(combo.notes || ""),
      `<button class="button secondary inventory-edit-action" type="button" data-edit-combo="${escapeHtml(combo.id)}">Edit</button>`
    ]);
  });
  renderInventoryTable(els.comboInventoryTable, ["Combo", "Fish caught", "Last used", "Rod", "Reel", "Notes", ""], rows, "No saved combos yet.");
}

function renderLineTracker() {
  const rows = state.reels.map((reel) => {
    const line = activeLineEntry(reel);
    if (!line) return null;
    return [
      escapeHtml(gearDisplayName(reel, "Reel")),
      escapeHtml(line.spooledDate || "-"),
      escapeHtml(line.type || "-"),
      escapeHtml(line.brand || "-"),
      escapeHtml(line.name || "-"),
      escapeHtml(displayStoredMeasurement(line.weight, "fishWeight") || "-"),
      escapeHtml(line.diameterIn || "-"),
      escapeHtml(line.diameterMm || "-"),
      escapeHtml(line.color || "-"),
      line.monoBacking ? "Yes" : "No",
      escapeHtml(line.notes || "")
    ];
  }).filter(Boolean);
  renderInventoryTable(els.lineTrackerTable, ["Reel", "Spooled", "Type", "Brand", "Name", `Weight (${unitSymbol("fishWeight")})`, "Dia In", "Dia Mm", "Color", "Backing", "Notes"], rows, "No current line saved yet. Edit a reel to add current line.");
}

function renderBaitInventory() {
  const rows = state.lures.map((lure) => {
    return inventoryRow("lure", lure, [
      inventoryThumb(lure),
      `<button class="inventory-gear-preview-link" type="button" data-inventory-lure-id="${escapeHtml(lure.id)}" aria-label="Open preview for ${escapeHtml(lure.name || "lure")}">${escapeHtml(lure.name || "-")}</button>`,
      ...gearUsageCells("lure", lure.id),
      escapeHtml(lure.type || "-"),
      escapeHtml(lure.brand || "-"),
      escapeHtml(lure.model || "-"),
      escapeHtml(lure.color || "-"),
      escapeHtml(lure.quantityAvailable === "" || lure.quantityAvailable === null || lure.quantityAvailable === undefined ? "-" : lure.quantityAvailable),
      `<button class="button secondary inventory-edit-action" type="button" data-edit-lure="${escapeHtml(lure.id)}">Edit</button>`
    ]);
  });
  renderInventoryTable(els.baitInventoryTable, ["Photo", "Lure", "Fish caught", "Last used", "Type", "Brand", "Model", "Color", "Owned", ""], rows, "No saved lures yet.");
}

function renderFlasherInventory() {
  const rows = state.flashers.map((flasher) => {
    return inventoryRow("flasher", flasher, [
      inventoryThumb(flasher),
      escapeHtml(flasher.name || "-"),
      ...gearUsageCells("flasher", flasher.id),
      escapeHtml(flasher.type || "-"),
      escapeHtml(flasher.brand || "-"),
      escapeHtml(flasher.model || "-"),
      escapeHtml(flasher.color || "-"),
      `<button class="button secondary inventory-edit-action" type="button" data-edit-flasher="${escapeHtml(flasher.id)}">Edit</button>`
    ]);
  });
  renderInventoryTable(els.flasherInventoryTable, ["Photo", "Flasher", "Fish caught", "Last used", "Type", "Brand", "Model", "Color", ""], rows, "No saved flashers yet.");
}

function setGearTab(tab) {
  activeGearTab = tab;
  const showingTackleBoxes = tab === "tackle-boxes";
  document.querySelectorAll("[data-gear-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.gearTab === tab);
  });
  document.querySelectorAll("[data-gear-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.gearPanel !== tab);
  });
  document.querySelectorAll(".gear-standard-action").forEach((button) => {
    button.classList.toggle("hidden", showingTackleBoxes);
  });
  document.querySelector("#newTackleBoxButton")?.classList.toggle("hidden", !showingTackleBoxes);
  const controls = document.querySelector(".gear-inventory-controls");
  const activePanel = document.querySelector(`[data-gear-panel="${tab}"]`);
  if (controls && activePanel && !showingTackleBoxes) activePanel.querySelector(".gear-header")?.append(controls);
  controls?.classList.toggle("hidden", showingTackleBoxes);
  syncGearFilterFields();
  applyInventoryTableControls();
  if (showingTackleBoxes && typeof renderTackleBoxes === "function") renderTackleBoxes();
}

function renderGearLibrary() {
  renderReelInventory();
  renderRodInventory();
  renderComboInventory();
  renderLineTracker();
  renderBaitInventory();
  renderFlasherInventory();
  if (typeof renderTackleBoxes === "function") renderTackleBoxes();
  setGearTab(activeGearTab);
}
