import { createId } from "./app-defaults.js";
import { generatedLureName, increasedQuantity, mergeLineHistory } from "./gear-core.js";

const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();

export function isWormHarnessType(type) {
  return lower(type) === "worm harness";
}

export function isSpoonType(type) {
  return lower(type) === "spoon";
}

export function isMeatRigType(type) {
  return lower(type) === "meat rig";
}

export function isSoftPlasticType(type) {
  return lower(type) === "soft plastic";
}

export function isFlyType(type) {
  return lower(type) === "fly";
}

export function normalizeLineEntry(line = {}) {
  const type = text(line.type);
  const braid = lower(type) === "braid";
  return {
    ...line,
    id: text(line.id) || createId(),
    spooledDate: text(line.spooledDate),
    type,
    brand: text(line.brand),
    name: text(line.name),
    weight: text(line.weight),
    flyWeight: text(line.flyWeight),
    flyTaper: text(line.flyTaper),
    flyDensity: text(line.flyDensity),
    diameterIn: text(line.diameterIn),
    diameterMm: text(line.diameterMm),
    color: text(line.color),
    monoBacking: braid ? Boolean(line.monoBacking) : false,
    notes: text(line.notes)
  };
}

export function lineEntryIsNotEmpty(line = {}) {
  return Boolean(line.spooledDate || line.type || line.brand || line.name || line.weight || line.diameterIn || line.diameterMm || line.color || line.monoBacking || line.notes);
}

export function lineHistoryFromDraft(lines = [], existingEntries = []) {
  const latest = (Array.isArray(lines) ? lines : []).map(normalizeLineEntry).filter(lineEntryIsNotEmpty).slice(0, 1);
  return mergeLineHistory(existingEntries, latest);
}

export function lureFromDraft(draft = {}, context = {}) {
  const type = text(draft.type);
  const lure = {
    ...(context.existing || {}),
    ...draft,
    id: text(draft.id) || text(context.editingId) || createId(),
    name: text(draft.name),
    type,
    divingDepth: ["crankbait", "jerkbait"].includes(lower(type)) ? text(draft.divingDepth) : "",
    bladeType: isWormHarnessType(type) ? text(draft.bladeType) : "",
    spoonSize: isSpoonType(type) ? text(draft.spoonSize) : "",
    meatRigType: isMeatRigType(type) ? text(draft.meatRigType) : "",
    softPlasticType: isSoftPlasticType(type) ? text(draft.softPlasticType) : "",
    flyCategory: isFlyType(type) ? text(draft.flyCategory) : "",
    flyPattern: isFlyType(type) ? text(draft.flyPattern) : "",
    flyHookSize: isFlyType(type) ? text(draft.flyHookSize) : "",
    brand: text(draft.brand),
    model: text(draft.model),
    color: text(draft.color),
    weight: text(draft.weight),
    quantityAvailable: text(draft.quantityAvailable),
    glow: Boolean(draft.glow),
    notes: text(draft.notes)
  };
  lure.name = lure.name || generatedLureName(lure) || "Unnamed Lure";
  return lure;
}

export function flasherFromDraft(draft = {}, context = {}) {
  return {
    ...(context.existing || {}),
    ...draft,
    id: text(draft.id) || text(context.editingId) || createId(),
    name: text(draft.name),
    type: text(draft.type),
    brand: text(draft.brand),
    model: text(draft.model),
    color: text(draft.color),
    glow: Boolean(draft.glow),
    notes: text(draft.notes)
  };
}

export function reelFromDraft(draft = {}, context = {}) {
  const existing = context.existing || {};
  const modelGroupId = text(draft.modelGroupId || existing.modelGroupId || (context.duplicateSourceId ? existing.id : ""));
  return {
    ...existing,
    ...draft,
    id: text(draft.id) || text(context.editingId) || createId(),
    shortName: text(draft.shortName),
    style: text(draft.style),
    brand: text(draft.brand),
    name: text(draft.name),
    size: text(draft.size),
    weight: text(draft.weight),
    gearRatio: text(draft.gearRatio),
    maxDrag: text(draft.maxDrag),
    monoCapacity: text(draft.monoCapacity),
    braidCapacity: text(draft.braidCapacity),
    flyLineRange: text(draft.flyLineRange),
    arbor: text(draft.arbor),
    purchaseAmount: text(draft.purchaseAmount),
    dateBought: text(draft.dateBought),
    quantityAvailable: context.duplicateSourceId && draft.quantityAvailable === undefined ? increasedQuantity(existing.quantityAvailable) : text(draft.quantityAvailable),
    modelGroupId,
    notes: text(draft.notes),
    lineHistory: lineHistoryFromDraft(draft.lineHistory, existing.lineHistory || [])
  };
}

export function rodFromDraft(draft = {}, context = {}) {
  return {
    ...(context.existing || {}),
    ...draft,
    id: text(draft.id) || text(context.editingId) || createId(),
    shortName: text(draft.shortName),
    type: text(draft.type),
    brand: text(draft.brand),
    name: text(draft.name),
    length: text(draft.length),
    power: text(draft.power),
    action: text(draft.action),
    flyWeight: isFlyType(draft.type) ? text(draft.flyWeight) : "",
    pieces: isFlyType(draft.type) ? text(draft.pieces) : "",
    lureRating: text(draft.lureRating),
    purchaseAmount: text(draft.purchaseAmount),
    dateBought: text(draft.dateBought),
    quantityAvailable: text(draft.quantityAvailable),
    notes: text(draft.notes)
  };
}

export function comboFromDraft(draft = {}, context = {}) {
  return {
    ...(context.existing || {}),
    ...draft,
    id: text(draft.id) || text(context.editingId) || createId(),
    shortName: text(draft.shortName),
    rodId: text(draft.rodId),
    reelId: text(draft.reelId),
    notes: text(draft.notes)
  };
}

export function syncReelGroupQuantity(reels = [], groupId = "", quantity = "") {
  if (!groupId) return reels;
  return reels.map((item) => {
    const itemGroupId = String(item?.modelGroupId || item?.id || "");
    if (item.id !== groupId && itemGroupId !== groupId) return item;
    return { ...item, modelGroupId: groupId, quantityAvailable: String(quantity ?? "") };
  });
}
