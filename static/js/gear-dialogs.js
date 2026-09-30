import { html, joinHtml, setHtml } from "./html.js";
import { createId } from "./app-defaults.js";
import { state, ui } from "./app-state.js";
import { optionLabels } from "./app-normalization.js";
import { unitSymbol } from "./app-units.js";
import { deleteCombo as deleteComboRecord, deleteFlasher as deleteFlasherRecord, deleteLure as deleteLureRecord, deleteReel as deleteReelRecord, deleteRod as deleteRodRecord, saveRecord, updateLogbook, upsertListValueInDraft } from "./actions.js";
import { els } from "./app-elements.js";
import { beginMediaEditSession, canonicalMediaRef, cleanupReplacedMedia, isVideoMedia, markMediaEditSessionSaved, mediaMarkup } from "./app-media.js";
import { populateOptionSelect, renderAll } from "./dashboard.js";
import { uploadImageFile } from "./photos.js";
import { getValue, setValue } from "./trip-editor.js";
import { updateRowSummary } from "./trip-rows.js";
import { activeLineEntry, baitStats, comboName, duplicateMatchesSource, gearDisplayName, gearPhotos, increasedQuantity, nextReelCopyShortName, renderExistingGearPhotos, renderQueuedGearImage } from "./gear-core.js";
import { populateFlasherSelect, populateLureSelect, populateLuresForType, populateReelSelect, populateRodSelect, prepareInlineGearDialog, renderFlasherPreview, renderLurePreview } from "./gear-pickers.js";
import { comboFromDraft, flasherFromDraft, lureFromDraft, reelFromDraft, rodFromDraft } from "./gear-draft.js";
import { applyGearDraftBindings, createGearDraft, setGearDraftContext, updateGearLineEntry } from "./draft-binding.js";


export function renderLineRows(lines = []) {
  const container = document.querySelector("#reelLineRows");
  if (!container) return;
  setHtml(container, lineRowMarkup(activeLineEntry({ lineHistory: lines }) || {}));
}

function gearDraftContext() {
  return ui.gearDraftContext || {};
}

function resetGearDraftUploads(type) {
  ui.gearDraftUploads = { ...(ui.gearDraftUploads || {}), [type]: [] };
}

function gearDraftUploads(type) {
  return ui.gearDraftUploads?.[type] || [];
}

function gearDraftMedia() {
  return Array.isArray(ui.gearDraft?.media) ? ui.gearDraft.media : [];
}

function setGearDraftMedia(media = []) {
  if (!ui.gearDraft) return;
  ui.gearDraft.media = media.map(canonicalMediaRef).filter(Boolean);
  if (ui.gearDraft.heroMediaId && !ui.gearDraft.media.some((photo) => photo.id === ui.gearDraft.heroMediaId && !isVideoMedia(photo))) {
    ui.gearDraft.heroMediaId = "";
  }
}

function sameGearMedia(first, second) {
  return Boolean(first && second) && (
    (first.id && first.id === second.id)
    || (first.category === second.category && first.filename === second.filename && first.previewFilename === second.previewFilename)
  );
}

async function appendUploadedGearMedia(type, category) {
  const files = gearDraftUploads(type);
  const uploaded = files.length ? await Promise.all(files.map((file) => uploadImageFile(file, category))) : [];
  const pending = {
    lure: ui.pendingLureImage,
    flasher: ui.pendingFlasherImage,
    reel: ui.pendingReelImage,
    rod: ui.pendingRodImage
  }[type];
  const existing = gearDraftMedia();
  const pendingMedia = pending && !existing.some((photo) => sameGearMedia(photo, pending)) ? [pending] : [];
  setGearDraftMedia([...existing, ...uploaded, ...pendingMedia]);
}

function refreshLureSelectors(lure, context = {}) {
  [...document.querySelectorAll(".catch-lure, .trip-gear-lure, .trip-gear-cheater-lure")]
    .forEach((select) => populateLureSelect(select, select.value));
  const rowId = context.pendingRowId || "";
  const row = [...document.querySelectorAll(".catch-row, .gear-used-row")].find((item) => item.dataset.rowId === rowId);
  if (!row) return;
  const targetSelector = context.pendingLureTarget === "cheater"
    ? ".trip-gear-cheater-lure"
    : ".catch-lure, .trip-gear-lure";
  const select = row.querySelector(targetSelector);
  if (select) {
    populateLuresForType(select, lure.type, lure.id);
    select.value = lure.id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  renderLurePreview(row);
  updateRowSummary(row);
}

function refreshFlasherSelectors(flasher, context = {}) {
  [...document.querySelectorAll(".catch-flasher, .trip-gear-flasher")]
    .forEach((select) => populateFlasherSelect(select, select.value));
  const rowId = context.pendingRowId || "";
  const row = [...document.querySelectorAll(".catch-row, .gear-used-row")].find((item) => item.dataset.rowId === rowId);
  if (!row) return;
  const select = row.querySelector(".catch-flasher, .trip-gear-flasher");
  if (select) {
    select.value = flasher.id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  renderFlasherPreview(row);
  updateRowSummary(row);
}

function syncReelGroupQuantityInDraft(reels, groupId, quantity) {
  if (!groupId) return;
  reels.forEach((item) => {
    const itemGroupId = String(item?.modelGroupId || item?.id || "");
    if (item.id === groupId || itemGroupId === groupId) {
      item.modelGroupId = groupId;
      item.quantityAvailable = String(quantity ?? "");
    }
  });
}

export function lineUsesBraid(type) {
  return String(type || "").trim().toLowerCase() === "braid";
}

export function updateMonoBackingVisibility(row) {
  if (!row) return;
  const backingField = row.querySelector(".line-mono-backing-field");
  const backingInput = row.querySelector(".line-mono-backing");
  const lineId = row.dataset?.lineId || "";
  const line = (ui.gearDraft?.lineHistory || []).find((entry) => String(entry.id || "") === String(lineId))
    || activeLineEntry(ui.gearDraft || {})
    || {};
  const lineType = line.type || optionLabels("lineTypes")[0];
  const showBacking = lineUsesBraid(lineType);
  backingField?.classList.toggle("hidden", !showBacking);
  if (!showBacking && backingInput) {
    backingInput.checked = false;
    updateGearLineEntry(row, { monoBacking: false });
  }
}

export function lineRowMarkup(line = {}) {
  const id = line.id || createId();
  const showMonoBacking = lineUsesBraid(line.type || optionLabels("lineTypes")[0]);
  return html`
    <article class="line-editor-row" data-line-id="${id}">
      <label><span>Spooled date</span><input class="line-spooled-date" type="date" value="${line.spooledDate || ""}" /></label>
      <label><span>Type</span><select class="line-type">${joinHtml(optionLabels("lineTypes").map((type) => html`<option value="${type}" ${type === line.type ? "selected" : ""}>${type}</option>`), "")}</select></label>
      <label><span>Brand</span><input class="line-brand" type="text" value="${line.brand || ""}" placeholder="Berkley" /></label>
      <label><span>Name</span><input class="line-name" type="text" value="${line.name || ""}" placeholder="X5" /></label>
      <label><span>Weight (${unitSymbol("fishWeight")})</span><input class="line-weight" type="text" value="${line.weight || ""}" placeholder="30" /></label>
      <label class="fly-line-field hidden"><span>Fly line weight</span><input class="line-fly-weight" type="number" min="0" max="16" step="1" value="${line.flyWeight || ""}" placeholder="5" /></label>
      <label class="fly-line-field hidden"><span>Taper</span><input class="line-fly-taper" type="text" value="${line.flyTaper || ""}" placeholder="Weight forward" /></label>
      <label class="fly-line-field hidden"><span>Density / sink rate</span><input class="line-fly-density" type="text" value="${line.flyDensity || ""}" placeholder="Floating, 3 ips" /></label>
      <label><span>Diameter in</span><input class="line-diameter-in" type="text" value="${line.diameterIn || ""}" placeholder="0.008" /></label>
      <label><span>Diameter mm</span><input class="line-diameter-mm" type="text" value="${line.diameterMm || ""}" placeholder="0.20" /></label>
      <label><span>Color</span><input class="line-color" type="text" value="${line.color || ""}" placeholder="Lo-Vis" /></label>
      <label class="checkbox-label line-mono-backing-field ${showMonoBacking ? "" : "hidden"}"><input class="line-mono-backing" type="checkbox" ${line.monoBacking && showMonoBacking ? "checked" : ""} /><span>Mono backing</span></label>
      <label class="line-notes-field"><span>Notes</span><input class="line-notes" type="text" value="${line.notes || ""}" placeholder="Spooling notes" /></label>
    </article>
  `;
}

export function isFlyType(type) { return String(type || "").trim().toLowerCase() === "fly"; }

export function updateFlyGearVisibility() {
  const rodFly = isFlyType(getValue("rodType"));
  const reelFly = isFlyType(getValue("reelStyle"));
  document.querySelectorAll(".fly-rod-field").forEach((field) => field.classList.toggle("hidden", !rodFly));
  document.querySelectorAll(".fly-reel-field").forEach((field) => field.classList.toggle("hidden", !reelFly));
  document.querySelectorAll(".fly-line-field").forEach((field) => field.classList.toggle("hidden", String(document.querySelector(".line-type")?.value || "").toLowerCase() !== "fly line"));
}

export function openReelDialog(reel = null, { duplicate = false } = {}) {
  beginMediaEditSession("reel");
  resetGearDraftUploads("reel");
  els.reelDialog.dataset.removedPhotoKeys = "[]";
  els.reelForm.reset();
  ui.pendingReelImage = null;
  renderQueuedGearImage("reel");
  populateOptionSelect(document.querySelector("#reelStyle"), optionLabels("reelStyles"), "Select style");
  const editing = Boolean(reel) && !duplicate;
  createGearDraft(editing ? reel : null, {
    id: editing ? reel?.id || "" : "",
    shortName: duplicate ? nextReelCopyShortName(reel) : reel?.shortName || "",
    style: reel?.style || "",
    brand: reel?.brand || "",
    name: reel?.name || "",
    size: reel?.size || "",
    weight: reel?.weight || "",
    gearRatio: reel?.gearRatio || "",
    maxDrag: reel?.maxDrag || "",
    monoCapacity: reel?.monoCapacity || "",
    braidCapacity: reel?.braidCapacity || "",
    flyLineRange: reel?.flyLineRange || "",
    arbor: reel?.arbor || "",
    purchaseAmount: reel?.purchaseAmount || "",
    dateBought: reel?.dateBought || "",
    quantityAvailable: duplicate ? increasedQuantity(reel?.quantityAvailable) : reel?.quantityAvailable ?? "",
    notes: reel?.notes || "",
    lineHistory: [activeLineEntry({ lineHistory: reel?.lineHistory || [] }) || {}]
  });
  setGearDraftContext({ type: "reel", editingId: editing ? reel?.id || "" : "", duplicateSourceId: duplicate ? reel?.id || "" : "" });
  renderExistingGearPhotos("reel", ui.gearDraft);
  document.querySelector("#reelDialog h2").textContent = editing ? "Edit Reel" : duplicate ? "Add Separate Reel" : "Add Reel";
  els.reelDialog.dataset.duplicateFromId = duplicate ? reel?.id || "" : "";
  setValue("editingReelId", editing ? reel?.id || "" : "");
  setValue("reelShortName", duplicate ? nextReelCopyShortName(reel) : reel?.shortName || "");
  setValue("reelStyle", reel?.style || "");
  setValue("reelBrand", reel?.brand || "");
  setValue("reelName", reel?.name || "");
  setValue("reelSize", reel?.size || "");
  setValue("reelWeight", reel?.weight || "");
  setValue("reelGearRatio", reel?.gearRatio || "");
  setValue("reelMaxDrag", reel?.maxDrag || "");
  setValue("reelMonoCapacity", reel?.monoCapacity || "");
  setValue("reelBraidCapacity", reel?.braidCapacity || "");
  setValue("reelFlyLineRange", reel?.flyLineRange || "");
  setValue("reelArbor", reel?.arbor || "");
  setValue("reelPurchaseAmount", reel?.purchaseAmount || "");
  setValue("reelDateBought", reel?.dateBought || "");
  setValue("reelQuantityAvailable", duplicate ? increasedQuantity(reel?.quantityAvailable) : reel?.quantityAvailable ?? "");
  setValue("reelNotes", reel?.notes || "");
  renderLineRows(reel?.lineHistory || []);
  updateFlyGearVisibility();
  els.deleteReelButton.classList.toggle("hidden", !editing);
  applyGearDraftBindings(els.reelDialog);
  els.reelDialog.showModal();
}

export function openRodDialog(rod = null, { duplicate = false } = {}) {
  beginMediaEditSession("rod");
  resetGearDraftUploads("rod");
  els.rodDialog.dataset.removedPhotoKeys = "[]";
  els.rodForm.reset();
  ui.pendingRodImage = null;
  renderQueuedGearImage("rod");
  populateOptionSelect(document.querySelector("#rodType"), optionLabels("rodTypes"), "Select type");
  const editing = Boolean(rod) && !duplicate;
  createGearDraft(editing ? rod : null, {
    id: editing ? rod?.id || "" : "",
    shortName: rod?.shortName || "",
    type: rod?.type || "",
    brand: rod?.brand || "",
    name: rod?.name || "",
    length: rod?.length || "",
    power: rod?.power || "",
    action: rod?.action || "",
    flyWeight: rod?.flyWeight || "",
    pieces: rod?.pieces || "",
    lureRating: rod?.lureRating || "",
    purchaseAmount: rod?.purchaseAmount || "",
    dateBought: rod?.dateBought || "",
    quantityAvailable: rod?.quantityAvailable ?? "",
    notes: rod?.notes || ""
  });
  setGearDraftContext({ type: "rod", editingId: editing ? rod?.id || "" : "", duplicateSourceId: duplicate ? rod?.id || "" : "" });
  renderExistingGearPhotos("rod", ui.gearDraft);
  document.querySelector("#rodDialog h2").textContent = editing ? "Edit Rod" : duplicate ? "Duplicate Rod" : "Add Rod";
  els.rodDialog.dataset.duplicateFromId = duplicate ? rod?.id || "" : "";
  setValue("editingRodId", editing ? rod?.id || "" : "");
  setValue("rodShortName", rod?.shortName || "");
  setValue("rodType", rod?.type || "");
  setValue("rodBrand", rod?.brand || "");
  setValue("rodName", rod?.name || "");
  setValue("rodLength", rod?.length || "");
  setValue("rodPower", rod?.power || "");
  setValue("rodAction", rod?.action || "");
  setValue("rodFlyWeight", rod?.flyWeight || "");
  setValue("rodPieces", rod?.pieces || "");
  setValue("rodLureRating", rod?.lureRating || "");
  setValue("rodPurchaseAmount", rod?.purchaseAmount || "");
  setValue("rodDateBought", rod?.dateBought || "");
  setValue("rodQuantityAvailable", rod?.quantityAvailable ?? "");
  setValue("rodNotes", rod?.notes || "");
  updateFlyGearVisibility();
  els.deleteRodButton.classList.toggle("hidden", !editing);
  applyGearDraftBindings(els.rodDialog);
  els.rodDialog.showModal();
}

export function openComboDialog(combo = null) {
  els.comboForm.reset();
  const editing = Boolean(combo);
  createGearDraft(combo, {
    id: combo?.id || "",
    shortName: combo?.shortName || "",
    rodId: combo?.rodId || "",
    reelId: combo?.reelId || "",
    notes: combo?.notes || ""
  });
  setGearDraftContext({ type: "combo", editingId: editing ? combo?.id || "" : "" });
  document.querySelector("#comboDialog h2").textContent = editing ? "Edit Combo" : "Add Combo";
  setValue("editingComboId", combo?.id || "");
  setValue("comboShortName", combo?.shortName || "");
  document.querySelector("#comboShortName").dataset.autoName = "";
  populateRodSelect(document.querySelector("#comboRod"), combo?.rodId || "");
  populateReelSelect(document.querySelector("#comboReel"), combo?.reelId || "");
  setValue("comboNotes", combo?.notes || "");
  els.deleteComboButton.classList.toggle("hidden", !editing);
  applyGearDraftBindings(els.comboDialog);
  els.comboDialog.showModal();
}

export function openLureDialog(lure = null, pendingRowId = "", pendingLureTarget = "", initialType = "") {
  beginMediaEditSession("lure");
  prepareInlineGearDialog("lure", pendingRowId);
  resetGearDraftUploads("lure");
  els.lureDialog.dataset.removedPhotoKeys = "[]";
  els.lureDialog.dataset.pendingLureTarget = pendingLureTarget;
  els.lureForm.reset();
  ui.pendingLureImage = null;
  renderQueuedGearImage("lure");
  populateOptionSelect(document.querySelector("#lureType"), state.lureTypes, "Select lure type");
  populateOptionSelect(document.querySelector("#lureBladeType"), optionLabels("lureBladeTypes"), "Select blade type");
  populateOptionSelect(document.querySelector("#lureSpoonSize"), optionLabels("lureSpoonSizes"), "Select spoon size");
  populateOptionSelect(document.querySelector("#lureMeatRigType"), optionLabels("meatRigTypes"), "Select meat rig type");
  populateOptionSelect(document.querySelector("#lureSoftPlasticType"), [...new Set([...optionLabels("softPlasticTypes"), ...(lure?.softPlasticType ? [lure.softPlasticType] : [])])], "Select soft plastic style");
  populateOptionSelect(document.querySelector("#flyCategory"), optionLabels("flyCategories"), "Select category");
  const editing = Boolean(lure);
  createGearDraft(lure, {
    id: lure?.id || "",
    name: lure?.name || "",
    type: lure?.type || initialType,
    divingDepth: lure?.divingDepth || "",
    bladeType: lure?.bladeType || "",
    spoonSize: lure?.spoonSize || "",
    meatRigType: lure?.meatRigType || "",
    softPlasticType: lure?.softPlasticType || "",
    flyCategory: lure?.flyCategory || "",
    flyPattern: lure?.flyPattern || "",
    flyHookSize: lure?.flyHookSize || "",
    brand: lure?.brand || "",
    model: lure?.model || "",
    color: lure?.color || "",
    weight: lure?.weight || "",
    quantityAvailable: lure?.quantityAvailable ?? "",
    glow: Boolean(lure?.glow),
    notes: lure?.notes || ""
  });
  setGearDraftContext({ type: "lure", editingId: lure?.id || "", pendingRowId, pendingLureTarget });
  renderExistingGearPhotos("lure", ui.gearDraft);
  const gearLabel = String(lure?.type || initialType).toLowerCase() === "fly" ? "Fly" : "Lure";
  document.querySelector("#lureDialog h2").textContent = editing ? `Edit ${gearLabel}` : `Add ${gearLabel}`;
  setValue("pendingCatchRow", pendingRowId);
  setValue("editingLureId", lure?.id || "");
  setValue("lureName", lure?.name || "");
  setValue("lureType", lure?.type || initialType);
  setValue("lureDivingDepth", lure?.divingDepth || "");
  setValue("lureBladeType", lure?.bladeType || "");
  setValue("lureSpoonSize", lure?.spoonSize || "");
  setValue("lureMeatRigType", lure?.meatRigType || "");
  setValue("lureSoftPlasticType", lure?.softPlasticType || "");
  setValue("flyCategory", lure?.flyCategory || "");
  setValue("flyPattern", lure?.flyPattern || "");
  setValue("flyHookSize", lure?.flyHookSize || "");
  updateLureDivingDepthField();
  setValue("lureBrand", lure?.brand || "");
  setValue("lureModel", lure?.model || "");
  setValue("lureColor", lure?.color || "");
  setValue("lureWeight", lure?.weight || "");
  setValue("lureQuantityAvailable", lure?.quantityAvailable ?? "");
  document.querySelector("#lureGlow").checked = Boolean(lure?.glow);
  setValue("lureNotes", lure?.notes || "");
  els.deleteLureButton.classList.toggle("hidden", !editing);
  applyGearDraftBindings(els.lureDialog);
  els.lureDialog.showModal();
}

export function openLureInfoDialog(lure, pendingRowId = "") {
  if (!lure) return;
  prepareInlineGearDialog("lureInfo", pendingRowId);
  const stats = baitStats("lure", lure.id);
  const hasDivingDepth = ["crankbait", "jerkbait"].includes(lure.type?.toLowerCase());
  const hasBladeType = isWormHarnessType(lure.type);
  const hasSpoonSize = isSpoonType(lure.type);
  const hasMeatRigType = isMeatRigType(lure.type);
  const hasSoftPlasticType = isSoftPlasticType(lure.type);
  const details = [
    ["Type", lure.type],
    ["Diving depth", hasDivingDepth ? lure.divingDepth : ""],
    ["Blade type", hasBladeType ? lure.bladeType : ""],
    ["Spoon size", hasSpoonSize ? lure.spoonSize : ""],
    ["Meat rig type", hasMeatRigType ? lure.meatRigType : ""],
    ["Soft plastic style", hasSoftPlasticType ? lure.softPlasticType : ""],
    ["Brand", lure.brand],
    ["Model", lure.model],
    ["Color", lure.color],
    ["Lure weight", lure.weight],
    ["Quantity owned", lure.quantityAvailable],
    ["Glow", lure.glow ? "Yes" : "No"],
    ["Fish lost", stats.lost],
    ["Trips used", stats.trips],
    ["Last used", stats.lastUsed]
  ].filter(([, value]) => value !== "" && value !== null && value !== undefined);
  document.querySelector("#lureInfoTitle").textContent = lure.name || "Lure";
  els.lureInfoDialog.dataset.lureId = lure.id;
  setHtml(els.lureInfoContent, html`
    ${gearPhotos(lure).length ? html`<div class="lure-info-media">${mediaMarkup(gearPhotos(lure)[0], "", { download: false })}</div>` : ""}
    <dl class="lure-info-list">
      ${joinHtml(details.map(([label, value]) => html`
        <div><dt>${label}</dt><dd>${String(value)}</dd></div>
      `), "")}
    </dl>
    ${lure.notes ? html`<div class="lure-info-notes"><strong>Notes</strong><p>${lure.notes}</p></div>` : ""}
  `);
  els.lureInfoDialog.showModal();
}

export function updateLureDivingDepthField() {
  const lureType = getValue("lureType");
  const hasDivingDepth = ["crankbait", "jerkbait"].includes(lureType.toLowerCase());
  const fly = lureType.toLowerCase() === "fly";
  document.querySelector("#lureDivingDepthField").classList.toggle("hidden", !hasDivingDepth);
  document.querySelector("#lureBladeTypeField").classList.toggle("hidden", !isWormHarnessType(lureType));
  document.querySelector("#lureSpoonSizeField").classList.toggle("hidden", !isSpoonType(lureType));
  document.querySelector("#lureMeatRigTypeField").classList.toggle("hidden", !isMeatRigType(lureType));
  document.querySelector("#lureSoftPlasticTypeField").classList.toggle("hidden", !isSoftPlasticType(lureType));
  document.querySelectorAll("#flyCategoryField, #flyPatternField, #flyHookSizeField").forEach((field) => field.classList.toggle("hidden", !fly));
}

export function isWormHarnessType(type) {
  return String(type || "").trim().toLowerCase() === "worm harness";
}

export function isSpoonType(type) {
  return String(type || "").trim().toLowerCase() === "spoon";
}

export function isMeatRigType(type) {
  return String(type || "").trim().toLowerCase() === "meat rig";
}

export function isSoftPlasticType(type) {
  return String(type || "").trim().toLowerCase() === "soft plastic";
}

export function openFlasherDialog(flasher = null, pendingRowId = "") {
  beginMediaEditSession("flasher");
  prepareInlineGearDialog("flasher", pendingRowId);
  resetGearDraftUploads("flasher");
  els.flasherDialog.dataset.removedPhotoKeys = "[]";
  els.flasherForm.reset();
  ui.pendingFlasherImage = null;
  renderQueuedGearImage("flasher");
  populateOptionSelect(document.querySelector("#flasherType"), state.flasherTypes, "Select flasher type");
  const editing = Boolean(flasher);
  createGearDraft(flasher, {
    id: flasher?.id || "",
    name: flasher?.name || "",
    type: flasher?.type || "",
    brand: flasher?.brand || "",
    model: flasher?.model || "",
    color: flasher?.color || "",
    glow: Boolean(flasher?.glow),
    notes: flasher?.notes || ""
  });
  setGearDraftContext({ type: "flasher", editingId: flasher?.id || "", pendingRowId });
  renderExistingGearPhotos("flasher", ui.gearDraft);
  document.querySelector("#flasherDialog h2").textContent = editing ? "Edit Flasher" : "Add Flasher";
  setValue("pendingFlasherCatchRow", pendingRowId);
  setValue("editingFlasherId", flasher?.id || "");
  setValue("flasherName", flasher?.name || "");
  setValue("flasherType", flasher?.type || "");
  setValue("flasherBrand", flasher?.brand || "");
  setValue("flasherModel", flasher?.model || "");
  setValue("flasherColor", flasher?.color || "");
  document.querySelector("#flasherGlow").checked = Boolean(flasher?.glow);
  setValue("flasherNotes", flasher?.notes || "");
  els.deleteFlasherButton.classList.toggle("hidden", !editing);
  applyGearDraftBindings(els.flasherDialog);
  els.flasherDialog.showModal();
}

export function openFlasherInfoDialog(flasher, pendingRowId = "") {
  if (!flasher) return;
  prepareInlineGearDialog("flasherInfo", pendingRowId);
  const stats = baitStats("flasher", flasher.id);
  const details = [
    ["Type", flasher.type],
    ["Brand", flasher.brand],
    ["Model", flasher.model],
    ["Color", flasher.color],
    ["Glow", flasher.glow ? "Yes" : "No"],
    ["Fish lost", stats.lost],
    ["Trips used", stats.trips],
    ["Last used", stats.lastUsed]
  ].filter(([, value]) => value !== "" && value !== null && value !== undefined);
  document.querySelector("#flasherInfoTitle").textContent = flasher.name || "Flasher";
  els.flasherInfoDialog.dataset.flasherId = flasher.id;
  setHtml(els.flasherInfoContent, html`
    ${gearPhotos(flasher).length ? html`<div class="lure-info-media">${mediaMarkup(gearPhotos(flasher)[0], "", { download: false })}</div>` : ""}
    <dl class="lure-info-list">
      ${joinHtml(details.map(([label, value]) => html`
        <div><dt>${label}</dt><dd>${String(value)}</dd></div>
      `), "")}
    </dl>
    ${flasher.notes ? html`<div class="lure-info-notes"><strong>Notes</strong><p>${flasher.notes}</p></div>` : ""}
  `);
  els.flasherInfoDialog.showModal();
}

export async function saveReel(event) {
  event.preventDefault();
  try {
    const context = gearDraftContext();
    const editingId = context.editingId || "";
    const duplicateSourceId = context.duplicateSourceId || "";
    const existing = state.reels.find((item) => item.id === editingId || item.id === duplicateSourceId);
    const modelGroupId = existing?.modelGroupId || (duplicateSourceId ? existing?.id || "" : "");
    await appendUploadedGearMedia("reel", "reels");
    const reel = reelFromDraft({
      ...(ui.gearDraft || {}),
      id: editingId || ui.gearDraft?.id || "",
      modelGroupId
    }, { existing, editingId, duplicateSourceId });
    await updateLogbook((draft) => {
      const index = draft.reels.findIndex((item) => item.id === reel.id);
      if (index >= 0) draft.reels[index] = reel;
      else draft.reels.push(reel);
      if (modelGroupId) syncReelGroupQuantityInDraft(draft.reels, modelGroupId, reel.quantityAvailable);
      upsertListValueInDraft(draft, "reelStyles", reel.style);
      reel.lineHistory.forEach((line) => upsertListValueInDraft(draft, "lineTypes", line.type));
    });
    markMediaEditSessionSaved("reel");
    await cleanupReplacedMedia(editingId ? existing : null, reel);
    els.reelDialog.close();
    els.reelForm.reset();
    ui.pendingReelImage = null;
    resetGearDraftUploads("reel");
    renderAll();
  } catch (error) {
    console.error("Could not save reel.", error);
    alert(error.message || "The reel could not be saved.");
  }
}

export async function saveRod(event) {
  event.preventDefault();
  try {
    const context = gearDraftContext();
    const editingId = context.editingId || "";
    const duplicateSourceId = context.duplicateSourceId || "";
    const existing = state.rods.find((item) => item.id === editingId || item.id === duplicateSourceId);
    await appendUploadedGearMedia("rod", "rods");
    const rod = rodFromDraft({
      ...(ui.gearDraft || {}),
      id: editingId || ui.gearDraft?.id || ""
    }, { existing, editingId });
    const duplicatedUnchanged = !editingId && Boolean(duplicateSourceId)
      && duplicateMatchesSource(existing, rod, [
        "shortName", "type", "brand", "name", "length", "power", "action", "lureRating",
        "purchaseAmount", "dateBought", "quantityAvailable", "notes"
      ]);
    await updateLogbook((draft) => {
      const index = draft.rods.findIndex((item) => item.id === rod.id);
      if (duplicatedUnchanged) {
        const draftExisting = draft.rods.find((item) => item.id === existing.id);
        if (draftExisting) draftExisting.quantityAvailable = increasedQuantity(draftExisting.quantityAvailable);
      } else if (index >= 0) draft.rods[index] = rod;
      else draft.rods.push(rod);
      upsertListValueInDraft(draft, "rodTypes", rod.type);
    });
    markMediaEditSessionSaved("rod");
    await cleanupReplacedMedia(editingId ? existing : null, rod);
    els.rodDialog.close();
    els.rodForm.reset();
    ui.pendingRodImage = null;
    resetGearDraftUploads("rod");
    renderAll();
  } catch (error) {
    console.error("Could not save rod.", error);
    alert(error.message || "The rod could not be saved.");
  }
}

export async function saveCombo(event) {
  event.preventDefault();
  try {
    const context = gearDraftContext();
    const editingId = context.editingId || "";
    const existing = state.rodReelCombos.find((item) => item.id === editingId);
    const combo = comboFromDraft({
      ...(ui.gearDraft || {}),
      id: editingId || ui.gearDraft?.id || ""
    }, { existing, editingId });
    await saveRecord("rodReelCombos", combo);
    els.comboDialog.close();
    renderAll();
  } catch (error) {
    console.error("Could not save combo.", error);
    alert(error.message || "The combo could not be saved.");
  }
}

export async function saveLure(event) {
  event.preventDefault();
  try {
    const context = gearDraftContext();
    const editingId = context.editingId || "";
    const existing = state.lures.find((item) => item.id === editingId);
    await appendUploadedGearMedia("lure", "lures");
    const lure = lureFromDraft({
      ...(ui.gearDraft || {}),
      id: editingId || ui.gearDraft?.id || ""
    }, { existing, editingId });
    await updateLogbook((draft) => {
      const lureIndex = draft.lures.findIndex((item) => item.id === lure.id);
      if (lureIndex >= 0) draft.lures[lureIndex] = lure;
      else draft.lures.push(lure);
      upsertListValueInDraft(draft, "lureTypes", lure.type);
      upsertListValueInDraft(draft, "flyCategories", lure.flyCategory);
    });
    markMediaEditSessionSaved("lure");
    await cleanupReplacedMedia(existing, lure);
    refreshLureSelectors(lure, context);
    els.lureDialog.close();
    els.lureForm.reset();
    ui.pendingLureImage = null;
    resetGearDraftUploads("lure");
    renderQueuedGearImage("lure");
    renderAll();
  } catch (error) {
    console.error("Could not save lure.", error);
    alert(error.message || "The lure could not be saved.");
  }
}

export async function saveFlasher(event) {
  event.preventDefault();
  try {
    const context = gearDraftContext();
    const editingId = context.editingId || "";
    const existing = state.flashers.find((item) => item.id === editingId);
    await appendUploadedGearMedia("flasher", "flashers");
    const flasher = flasherFromDraft({
      ...(ui.gearDraft || {}),
      id: editingId || ui.gearDraft?.id || ""
    }, { existing, editingId });
    await updateLogbook((draft) => {
      const flasherIndex = draft.flashers.findIndex((item) => item.id === flasher.id);
      if (flasherIndex >= 0) draft.flashers[flasherIndex] = flasher;
      else draft.flashers.push(flasher);
      upsertListValueInDraft(draft, "flasherTypes", flasher.type);
    });
    markMediaEditSessionSaved("flasher");
    await cleanupReplacedMedia(existing, flasher);
    refreshFlasherSelectors(flasher, context);
    els.flasherDialog.close();
    els.flasherForm.reset();
    ui.pendingFlasherImage = null;
    resetGearDraftUploads("flasher");
    renderQueuedGearImage("flasher");
    renderAll();
  } catch (error) {
    console.error("Could not save flasher.", error);
    alert(error.message || "The flasher could not be saved.");
  }
}

export async function deleteReel() {
  const reelId = getValue("editingReelId");
  const reel = state.reels.find((item) => item.id === reelId);
  if (!reel || !confirm(`Delete ${gearDisplayName(reel, "this reel")}? This clears it from combos and trips.`)) return;
  const modelGroupId = reel.modelGroupId || "";
  const nextGroupQuantity = Math.max(0, (Number(reel.quantityAvailable) || 1) - 1);
  await deleteReelRecord(reelId, modelGroupId, nextGroupQuantity);
  await cleanupReplacedMedia(reel, null);
  els.reelDialog.close();
  renderAll();
}

export async function deleteRod() {
  const rodId = getValue("editingRodId");
  const rod = state.rods.find((item) => item.id === rodId);
  if (!rod || !confirm(`Delete ${gearDisplayName(rod, "this rod")}? This clears it from combos and trips.`)) return;
  await deleteRodRecord(rodId);
  await cleanupReplacedMedia(rod, null);
  els.rodDialog.close();
  renderAll();
}

export async function deleteCombo() {
  const comboId = getValue("editingComboId");
  const combo = state.rodReelCombos.find((item) => item.id === comboId);
  if (!combo || !confirm(`Delete ${comboName(comboId) || "this combo"}? Trips keep their selected rod and reel.`)) return;
  await deleteComboRecord(comboId);
  els.comboDialog.close();
  renderAll();
}

export async function deleteLure() {
  const lureId = getValue("editingLureId");
  const lure = state.lures.find((item) => item.id === lureId);
  if (!lure || !confirm(`Delete ${lure.name}? This removes it from saved lures and clears it from catches.`)) return;
  await deleteLureRecord(lureId);
  await cleanupReplacedMedia(lure, null);
  els.lureDialog.close();
  renderAll();
}

export async function deleteFlasher() {
  const flasherId = getValue("editingFlasherId");
  const flasher = state.flashers.find((item) => item.id === flasherId);
  if (!flasher || !confirm(`Delete ${flasher.name}? This removes it from saved flashers and clears it from catches.`)) return;
  await deleteFlasherRecord(flasherId);
  await cleanupReplacedMedia(flasher, null);
  els.flasherDialog.close();
  renderAll();
}
