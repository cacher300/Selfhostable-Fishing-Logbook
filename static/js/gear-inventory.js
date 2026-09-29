import { html, joinHtml, setHtml } from "./html.js";
import { state, ui } from "./app-state.js";
import { displayStoredMeasurement, unitSymbol } from "./app-units.js";
import { els } from "./app-elements.js";
import { mediaMarkup } from "./app-media.js";
import { formatDate } from "./dashboard.js";
import { activeLineEntry, comboName, gearDisplayName, gearPhotos, lineSummary, reelName, rodName } from "./gear-core.js";
import { isFlyLure } from "./gear-pickers.js";
import { openFlasherInfoDialog, openLureInfoDialog } from "./gear-dialogs.js";
import { gearPerformanceStats } from "./leaderboard.js";

export function renderInventoryTable(container, headers, rows, emptyText) {
  if (!container) return;
  if (!rows.length) {
    setHtml(container, html`<div class="empty-state"><p>${emptyText}</p></div>`);
    return;
  }
  const sortState = inventorySortState[container.id];
  setHtml(container, html`
    <table>
      <thead><tr>${joinHtml(headers.map((header, index) => {
        const sortable = Boolean(header) && header !== "Photo";
        const sorted = sortState?.index === index;
        const direction = sorted ? sortState.direction : "none";
        return html`<th aria-sort="${direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}">${sortable ? html`<button class="inventory-sort-button" type="button" data-inventory-sort-table="${container.id}" data-inventory-sort-index="${index}">${header}${sorted ? html`<span aria-hidden="true"> ${direction === "asc" ? "â†‘" : "â†“"}</span>` : ""}</button>` : header}</th>`;
      }), "")}</tr></thead>
      <tbody>${joinHtml(rows.map((row) => {
        const cells = Array.isArray(row) ? row : row.cells;
        const attributes = Array.isArray(row) ? "" : joinHtml(Object.entries(row.attributes || {})
          .map(([name, value]) => html`${name}="${String(value)}"`), " ");
        return html`<tr ${attributes}>${joinHtml(cells.map((cell) => html`<td>${cell}</td>`), "")}</tr>`;
      }), "")}</tbody>
    </table>
  `);
  applyInventoryTableControls(container);
}

export let activeGearFilter = { field: "all", query: "" };
export const inventorySortState = {};
export let gearFilterSuggestionsOpen = false;

export function activeInventoryTable() {
  return document.querySelector(`[data-gear-panel="${ui.activeGearTab}"] .inventory-table`);
}

export function inventoryHeaderLabels(container) {
  return [...container.querySelectorAll("thead th")].map((header) => header.textContent.replace(/[â†‘â†“]/g, "").trim());
}

export function syncGearFilterFields() {
  const container = activeInventoryTable();
  if (!container || !els.gearFilterField) return;
  const headers = inventoryHeaderLabels(container).filter((label) => label && label !== "Photo");
  if (!headers.includes(activeGearFilter.field)) activeGearFilter.field = "all";
  setHtml(els.gearFilterField, html`<option value="all">All fields</option>${joinHtml(headers.map((label) => html`<option value="${label}">${label}</option>`), "")}`);
  els.gearFilterField.value = activeGearFilter.field;
  if (els.gearFilterQuery) els.gearFilterQuery.value = activeGearFilter.query;
  syncGearFilterSuggestions();
}

export function syncGearFilterSuggestions() {
  const container = activeInventoryTable();
  if (!container || !els.gearFilterSuggestions) return;
  const headers = inventoryHeaderLabels(container);
  const fieldIndex = activeGearFilter.field === "all" ? -1 : headers.indexOf(activeGearFilter.field);
  const query = activeGearFilter.query.trim().toLocaleLowerCase();
  const values = [...new Set([...container.querySelectorAll("tbody tr")].flatMap((row) => {
    const cells = [...row.cells].map((cell) => cell.textContent.trim());
    return fieldIndex >= 0 ? [cells[fieldIndex]] : cells;
  }).filter((value) => value && value !== "-" && value.toLocaleLowerCase().includes(query)))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })).slice(0, 100);
  setHtml(els.gearFilterSuggestions, joinHtml(values.map((value) => html`<button type="button" role="option" data-gear-filter-suggestion="${value}">${value}</button>`), ""));
  els.gearFilterSuggestions.classList.toggle("hidden", !gearFilterSuggestionsOpen || !values.length);
}

export function openGearFilterSuggestions() {
  gearFilterSuggestionsOpen = true;
  syncGearFilterSuggestions();
}

export function closeGearFilterSuggestions() {
  gearFilterSuggestionsOpen = false;
  syncGearFilterSuggestions();
}

export function selectGearFilterSuggestion(value) {
  if (els.gearFilterQuery) els.gearFilterQuery.value = value;
  activeGearFilter = { field: els.gearFilterField?.value || "all", query: value };
  closeGearFilterSuggestions();
  applyInventoryTableControls();
}

export function applyInventoryTableControls(container = activeInventoryTable()) {
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

export function updateGearFilter() {
  activeGearFilter = {
    field: els.gearFilterField?.value || "all",
    query: els.gearFilterQuery?.value || ""
  };
  gearFilterSuggestionsOpen = true;
  syncGearFilterSuggestions();
  applyInventoryTableControls();
}

export function clearGearFilter() {
  activeGearFilter = { field: "all", query: "" };
  gearFilterSuggestionsOpen = false;
  syncGearFilterFields();
  syncGearFilterSuggestions();
  applyInventoryTableControls();
}

export function sortInventoryTable(tableId, index) {
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

export function inventoryRow(type, item, cells) {
  return {
    attributes: { "data-inventory-type": type, "data-inventory-id": item.id },
    cells
  };
}

export function gearUsageCells(type, id) {
  const stats = gearPerformanceStats(type, id);
  return [
    String(String(stats.landed || 0)),
    stats.lastUsed ? String(formatDate(stats.lastUsed)) : "-"
  ];
}

export function inventoryThumb(item) {
  const photos = gearPhotos(item);
  if (!photos.length) return "";
  return mediaMarkup(photos[0], "inventory-thumb", { download: false });
}

export function openInventoryItemInfo(type, id) {
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
  setHtml(els.inventoryInfoContent, html`
    ${gearPhotos(item).length ? html`<div class="lure-info-media">${mediaMarkup(gearPhotos(item)[0], "", { download: false })}</div>` : ""}
    <dl class="lure-info-list">${joinHtml(details.filter(([, value]) => value !== "" && value !== null && value !== undefined).map(([name, value]) => html`<div><dt>${name}</dt><dd>${String(value)}</dd></div>`), "")}</dl>
    ${item.notes ? html`<div class="lure-info-notes"><strong>Notes</strong><p>${item.notes}</p></div>` : ""}
  `);
  els.inventoryInfoDialog.showModal();
}

export function renderReelInventory() {
  const rows = state.reels.map((reel) => {
    return inventoryRow("reel", reel, [
      inventoryThumb(reel),
      String(gearDisplayName(reel, "Reel")),
      ...gearUsageCells("reel", reel.id),
      String(lineSummary(activeLineEntry(reel)) || "-"),
      String(reel.style || "-"),
      String(reel.brand || "-"),
      String(reel.name || "-"),
      String(reel.size || "-"),
      String(reel.weight || "-"),
      String(reel.gearRatio || "-"),
      String(displayStoredMeasurement(reel.maxDrag, "fishWeight") || "-"),
      String(reel.monoCapacity || "-"),
      String(reel.braidCapacity || "-"),
      String(reel.purchaseAmount || "-"),
      String(reel.dateBought || "-"),
      String(reel.quantityAvailable === "" || reel.quantityAvailable === null || reel.quantityAvailable === undefined ? "-" : reel.quantityAvailable),
      html`<div class="inventory-actions"><button class="button secondary inventory-edit-action" type="button" data-edit-reel="${reel.id}">Edit</button><button class="button secondary" type="button" data-duplicate-reel="${reel.id}">Duplicate</button></div>`
    ]);
  });
  renderInventoryTable(els.reelInventoryTable, ["Photo", "Name", "Fish caught", "Last used", "Spooled Line", "Style", "Brand", "Model", "Size", "Weight", "Gear", `Max Drag (${unitSymbol("fishWeight")})`, "Mono Cap", "Braid Cap", "Purchase", "Bought", "Owned", ""], rows, "No saved reels yet.");
}

export function renderRodInventory() {
  const rows = state.rods.map((rod) => {
    return inventoryRow("rod", rod, [
      inventoryThumb(rod),
      String(gearDisplayName(rod, "Rod")),
      ...gearUsageCells("rod", rod.id),
      String(rod.type || "-"),
      String(rod.brand || "-"),
      String(rod.name || "-"),
      String(rod.length || "-"),
      String(rod.power || "-"),
      String(rod.action || "-"),
      String(rod.lureRating || "-"),
      String(rod.purchaseAmount || "-"),
      String(rod.dateBought || "-"),
      String(rod.quantityAvailable === "" || rod.quantityAvailable === null || rod.quantityAvailable === undefined ? "-" : rod.quantityAvailable),
      html`<div class="inventory-actions"><button class="button secondary inventory-edit-action" type="button" data-edit-rod="${rod.id}">Edit</button><button class="button secondary" type="button" data-duplicate-rod="${rod.id}">Duplicate</button></div>`
    ]);
  });
  renderInventoryTable(els.rodInventoryTable, ["Photo", "Name", "Fish caught", "Last used", "Type", "Brand", "Model", "Length", "Power", "Action", "Lure Rating", "Purchase", "Bought", "Owned", ""], rows, "No saved rods yet.");
}

export function renderComboInventory() {
  const rows = state.rodReelCombos.map((combo) => {
    return inventoryRow("combo", combo, [
      String(comboName(combo.id) || "Combo"),
      ...gearUsageCells("combo", combo.id),
      String(rodName(combo.rodId) || "-"),
      String(reelName(combo.reelId) || "-"),
      String(combo.notes || ""),
      html`<button class="button secondary inventory-edit-action" type="button" data-edit-combo="${combo.id}">Edit</button>`
    ]);
  });
  renderInventoryTable(els.comboInventoryTable, ["Combo", "Fish caught", "Last used", "Rod", "Reel", "Notes", ""], rows, "No saved combos yet.");
}

export function renderLineTracker() {
  const rows = state.reels.map((reel) => {
    const line = activeLineEntry(reel);
    if (!line) return null;
    return [
      String(gearDisplayName(reel, "Reel")),
      String(line.spooledDate || "-"),
      String(line.type || "-"),
      String(line.brand || "-"),
      String(line.name || "-"),
      String(displayStoredMeasurement(line.weight, "fishWeight") || "-"),
      String(line.diameterIn || "-"),
      String(line.diameterMm || "-"),
      String(line.color || "-"),
      line.monoBacking ? "Yes" : "No",
      String(line.notes || "")
    ];
  }).filter(Boolean);
  renderInventoryTable(els.lineTrackerTable, ["Reel", "Spooled", "Type", "Brand", "Name", `Weight (${unitSymbol("fishWeight")})`, "Dia In", "Dia Mm", "Color", "Backing", "Notes"], rows, "No current line saved yet. Edit a reel to add current line.");
}

export function renderBaitInventory() {
  const rows = state.lures.filter((lure) => !isFlyLure(lure)).map((lure) => {
    return inventoryRow("lure", lure, [
      inventoryThumb(lure),
      html`<button class="inventory-gear-preview-link" type="button" data-inventory-lure-id="${lure.id}" aria-label="Open preview for ${lure.name || "lure"}">${lure.name || "-"}</button>`,
      ...gearUsageCells("lure", lure.id),
      String(lure.type || "-"),
      String(lure.brand || "-"),
      String(lure.model || "-"),
      String(lure.color || "-"),
      String(lure.quantityAvailable === "" || lure.quantityAvailable === null || lure.quantityAvailable === undefined ? "-" : lure.quantityAvailable),
      html`<button class="button secondary inventory-edit-action" type="button" data-edit-lure="${lure.id}">Edit</button>`
    ]);
  });
  renderInventoryTable(els.baitInventoryTable, ["Photo", "Lure", "Fish caught", "Last used", "Type", "Brand", "Model", "Color", "Owned", ""], rows, "No saved lures yet.");
}

export function renderFlyInventory() {
  const rows = state.lures.filter(isFlyLure).map((fly) => inventoryRow("lure", fly, [
    inventoryThumb(fly),
    html`<button class="inventory-gear-preview-link" type="button" data-inventory-lure-id="${fly.id}" aria-label="Open preview for ${fly.name || "fly"}">${fly.name || "-"}</button>`,
    ...gearUsageCells("lure", fly.id),
    String(fly.flyCategory || "Other"),
    String(fly.flyPattern || "-"),
    String(fly.flyHookSize || "-"),
    String(fly.color || "-"),
    String(fly.quantityAvailable === "" || fly.quantityAvailable === null || fly.quantityAvailable === undefined ? "-" : fly.quantityAvailable),
    html`<button class="button secondary inventory-edit-action" type="button" data-edit-lure="${fly.id}">Edit</button>`
  ]));
  renderInventoryTable(els.flyInventoryTable, ["Photo", "Fly", "Fish caught", "Last used", "Category", "Pattern", "Hook size", "Color", "Owned", ""], rows, "No saved flies yet. Add a fly from any category to build your fly box.");
}

export function renderFlasherInventory() {
  const rows = state.flashers.map((flasher) => {
    return inventoryRow("flasher", flasher, [
      inventoryThumb(flasher),
      String(flasher.name || "-"),
      ...gearUsageCells("flasher", flasher.id),
      String(flasher.type || "-"),
      String(flasher.brand || "-"),
      String(flasher.model || "-"),
      String(flasher.color || "-"),
      html`<button class="button secondary inventory-edit-action" type="button" data-edit-flasher="${flasher.id}">Edit</button>`
    ]);
  });
  renderInventoryTable(els.flasherInventoryTable, ["Photo", "Flasher", "Fish caught", "Last used", "Type", "Brand", "Model", "Color", ""], rows, "No saved flashers yet.");
}

export function setGearTab(tab) {
  ui.activeGearTab = tab;
  document.querySelectorAll("[data-gear-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.gearTab === tab);
  });
  document.querySelectorAll("[data-gear-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.gearPanel !== tab);
  });
  document.querySelectorAll("[data-gear-action-tab]").forEach((button) => {
    button.classList.toggle("hidden", button.dataset.gearActionTab !== tab);
  });
  const controls = document.querySelector(".gear-inventory-controls");
  const activePanel = document.querySelector(`[data-gear-panel="${tab}"]`);
  if (controls && activePanel) activePanel.querySelector(".gear-header")?.append(controls);
  controls?.classList.remove("hidden");
  syncGearFilterFields();
  applyInventoryTableControls();
}

export function renderGearLibrary() {
  renderReelInventory();
  renderRodInventory();
  renderComboInventory();
  renderLineTracker();
  renderBaitInventory();
  renderFlyInventory();
  renderFlasherInventory();
  setGearTab(ui.activeGearTab);
}

