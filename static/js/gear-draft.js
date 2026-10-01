import { createId } from "./app-defaults.js";
import { activeLineEntry, generatedLureName, increasedQuantity, mergeLineHistory } from "./gear-core.js";

const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();
const gearEmptyDefaults = new Map([
  ["arbor", ""],
  ["beadSize", ""],
  ["bladeType", ""],
  ["braidCapacity", ""],
  ["brand", ""],
  ["color", ""],
  ["dateBought", ""],
  ["divingDepth", ""],
  ["flyCategory", ""],
  ["flyHookSize", ""],
  ["flyLineRange", ""],
  ["flyPattern", ""],
  ["flyWeight", ""],
  ["gearRatio", ""],
  ["glow", false],
  ["heroMediaId", ""],
  ["length", ""],
  ["lineHistory", []],
  ["lureRating", ""],
  ["maxDrag", ""],
  ["meatRigType", ""],
  ["media", []],
  ["model", ""],
  ["modelGroupId", ""],
  ["monoCapacity", ""],
  ["name", ""],
  ["notes", ""],
  ["pieces", ""],
  ["power", ""],
  ["purchaseAmount", ""],
  ["quantityAvailable", ""],
  ["reelId", ""],
  ["rodId", ""],
  ["shortName", ""],
  ["size", ""],
  ["softPlasticType", ""],
  ["spoonSize", ""],
  ["style", ""],
  ["type", ""],
  ["weight", ""]
]);

function hasOwn(object, key) {
  return Object.hasOwn(object || {}, key);
}

function sameValue(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function draftHasEmptyDefault(draft, key, emptyValue) {
  if (!hasOwn(draft, key)) return true;
  if (emptyValue === "") return text(draft[key]) === "";
  return sameValue(draft[key], emptyValue);
}

function cleanSourceAware(normalized, draft = {}, source = null) {
  if (source && sameValue(draft, source)) return structuredClone(source);
  const next = { ...normalized };
  if (source) {
    Object.keys(source).forEach((key) => {
      if (sameValue(draft?.[key], source[key])) next[key] = structuredClone(source[key]);
    });
  }
  gearEmptyDefaults.forEach((value, key) => {
    if (!hasOwn(source, key) && sameValue(next[key], value) && draftHasEmptyDefault(draft, key, value)) delete next[key];
  });
  Object.keys(next).forEach((key) => {
    if (next[key] === undefined && !hasOwn(source, key) && !hasOwn(draft, key)) delete next[key];
  });
  return next;
}

function isBladeLureType(type) {
  return ["worm harness", "spinnerbait"].includes(lower(type));
}

function isSpoonType(type) {
  return lower(type) === "spoon";
}

function isBeadType(type) {
  return lower(type) === "bead";
}

function isMeatRigType(type) {
  return lower(type) === "meat rig";
}

function isSoftPlasticType(type) {
  return lower(type) === "soft plastic";
}

function isFlyType(type) {
  return lower(type) === "fly";
}

function normalizeLineEntry(line = {}) {
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

function lineEntryIsNotEmpty(line = {}) {
  return Boolean(line.spooledDate || line.type || line.brand || line.name || line.weight || line.flyWeight || line.flyTaper || line.flyDensity || line.diameterIn || line.diameterMm || line.color || line.monoBacking || line.notes);
}

function lineHistoryFromDraft(lines = [], existingEntries = []) {
  const normalized = (Array.isArray(lines) ? lines : []).map(normalizeLineEntry).filter(lineEntryIsNotEmpty);
  const latest = activeLineEntry({ lineHistory: normalized });
  return mergeLineHistory(existingEntries, latest ? [latest] : []);
}

export function lureFromDraft(draft = {}, context = {}) {
  const existing = context.existing || null;
  const type = text(draft.type);
  const lure = {
    ...(existing || {}),
    ...draft,
    id: text(draft.id) || text(context.editingId) || createId(),
    name: text(draft.name),
    type,
    divingDepth: ["crankbait", "jerkbait"].includes(lower(type)) ? text(draft.divingDepth) : "",
    bladeType: isBladeLureType(type) ? text(draft.bladeType) : "",
    spoonSize: isSpoonType(type) ? text(draft.spoonSize) : "",
    beadSize: isBeadType(type) ? text(draft.beadSize) : "",
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
  return cleanSourceAware(lure, draft, existing);
}

export function flasherFromDraft(draft = {}, context = {}) {
  const existing = context.existing || null;
  return cleanSourceAware({
    ...(existing || {}),
    ...draft,
    id: text(draft.id) || text(context.editingId) || createId(),
    name: text(draft.name),
    type: text(draft.type),
    brand: text(draft.brand),
    model: text(draft.model),
    color: text(draft.color),
    glow: Boolean(draft.glow),
    notes: text(draft.notes)
  }, draft, existing);
}

export function reelFromDraft(draft = {}, context = {}) {
  const existing = context.existing || {};
  const modelGroupId = text(draft.modelGroupId || existing.modelGroupId || (context.duplicateSourceId ? existing.id : ""));
  return cleanSourceAware({
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
  }, draft, context.existing || null);
}

export function rodFromDraft(draft = {}, context = {}) {
  const existing = context.existing || null;
  return cleanSourceAware({
    ...(existing || {}),
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
  }, draft, existing);
}

export function comboFromDraft(draft = {}, context = {}) {
  const existing = context.existing || null;
  return cleanSourceAware({
    ...(existing || {}),
    ...draft,
    id: text(draft.id) || text(context.editingId) || createId(),
    shortName: text(draft.shortName),
    rodId: text(draft.rodId),
    reelId: text(draft.reelId),
    notes: text(draft.notes)
  }, draft, existing);
}
