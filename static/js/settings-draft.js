import { createId, isValidSpeciesMapColor } from "./app-defaults.js";
import { slugOptionValue } from "./app-normalization.js";
import { normalizeUnits, validateChopRanges } from "./app-units.js";

const text = (value) => String(value ?? "").trim();
const clone = (value) => (value === undefined ? undefined : structuredClone(value));
const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);

export function predefinedFieldsDraftFromState(groups = [], source = {}) {
  const draft = {};
  groups.forEach((group) => {
    const rows = asArray(source[group.key]);
    draft[group.key] = rows.map((row) => (
      typeof row === "object" && row !== null
        ? clone(row)
        : { label: String(row ?? "") }
    ));
  });
  return draft;
}

export function predefinedFieldsFromDraft(groups = [], draft = {}) {
  const next = {};
  groups.forEach((group) => {
    const rows = Array.isArray(draft[group.key]) ? draft[group.key] : [];
    if (group.choice) {
      next[group.key] = rows.map((row) => {
        const label = text(typeof row === "object" ? row.label : row);
        const value = text(typeof row === "object" ? row.value : "") || slugOptionValue(label);
        return { ...(typeof row === "object" ? row : {}), value, label };
      });
    } else {
      next[group.key] = rows.map((row) => text(typeof row === "object" ? row.label : row));
    }
  });
  return next;
}

export function chopRangesDraftFromState(ranges = []) {
  return asArray(ranges).map((range) => clone(range));
}

export function chopRangesFromDraft(rows = [], current = []) {
  const ranges = (Array.isArray(rows) ? rows : []).map((row, index) => ({
    ...(current[index] || {}),
    ...row,
    id: text(row?.id || current[index]?.id) || `chop-${index + 1}`,
    label: text(row?.label),
    maxFeet: row?.maxFeet === null ? null : Number(row?.maxFeet)
  }));
  validateChopRanges(ranges);
  return ranges;
}

export function unitsDraftFromSettings(settings = {}) {
  return normalizeUnits(settings.units);
}

export function unitsFromDraft(draft = {}, current = {}) {
  return normalizeUnits({ ...current, ...asObject(draft) });
}

export function preferencesDraftFromSettings(settings = {}) {
  return {
    theme: settings.theme === "dark" ? "dark" : "light",
    timeFormat: settings.timeFormat === "12" ? "12" : "24",
    defaultHomeLake: String(settings.defaultHomeLake || ""),
    hasFishHawk: settings.hasFishHawk !== false,
    defaultPeople: asArray(settings.defaultPeople).map((id) => String(id || "")).filter(Boolean),
    defaultTrollingSpreadId: String(settings.defaultTrollingSpreadId || ""),
    defaultSavedSetupIds: clone(asObject(settings.defaultSavedSetupIds))
  };
}

export function preferencesFromDraft(draft = {}, current = {}, availablePeopleIds = null) {
  const available = availablePeopleIds ? new Set(availablePeopleIds) : null;
  const defaultPeople = asArray(draft.defaultPeople)
    .map((id) => String(id || ""))
    .filter((id) => id && (!available || available.has(id)));
  return {
    ...asObject(current),
    theme: draft.theme === "dark" ? "dark" : "light",
    timeFormat: draft.timeFormat === "12" ? "12" : "24",
    defaultHomeLake: String(draft.defaultHomeLake || ""),
    hasFishHawk: draft.hasFishHawk !== false,
    defaultPeople,
    defaultTrollingSpreadId: String(draft.defaultTrollingSpreadId || ""),
    defaultSavedSetupIds: { ...asObject(draft.defaultSavedSetupIds) }
  };
}

export function speciesMapColorsDraftFromSettings(settings = {}) {
  return clone(asObject(settings.speciesMapColors));
}

export function speciesMapColorsFromDraft(draft = {}, current = {}) {
  const next = { ...asObject(current) };
  Object.entries(asObject(draft)).forEach(([species, color]) => {
    const name = text(species);
    const normalized = String(color || "").toLowerCase();
    if (name && isValidSpeciesMapColor(normalized)) next[name] = normalized;
  });
  return next;
}

export function savedSetupFromDraft(draft = {}, existing = {}) {
  return {
    ...existing,
    ...draft,
    id: text(draft.id || existing.id) || createId(),
    method: text(draft.method || existing.method),
    name: text(draft.name),
    rows: (Array.isArray(draft.rows) ? draft.rows : []).map((row, index) => ({
      ...(existing.rows?.[index] || {}),
      ...row,
      comboId: text(row?.comboId)
    }))
  };
}

export function trollingSpreadFromDraft(draft = {}, existing = {}) {
  return {
    ...existing,
    ...draft,
    id: text(draft.id || existing.id) || createId(),
    name: text(draft.name),
    spread: (Array.isArray(draft.spread) ? draft.spread : []).map((row, index) => {
      const existingRow = existing.spread?.[index] || {};
      const presentation = text(row?.presentation);
      const usesColor = ["high-diver", "low-diver"].includes(presentation.toLowerCase().replace(/[\s_]+/g, "-"));
      const untouchedColor = String(row?.presentation ?? "") === String(existingRow.presentation ?? "")
        && String(row?.dipseyDiverColor ?? "") === String(existingRow.dipseyDiverColor ?? "");
      return {
        ...existingRow,
        ...row,
        comboId: text(row?.comboId),
        side: text(row?.side),
        presentation,
        dipseyDiverColor: usesColor || untouchedColor ? text(row?.dipseyDiverColor) : ""
      };
    })
  };
}

export function checklistDraftFromSettings(settings = {}) {
  return asArray(settings.checklists).map((checklist) => clone(checklist));
}

export function checklistsFromDraft(draft = [], current = []) {
  return asArray(draft).map((checklist, index) => {
    const existing = current[index] || {};
    const existingItems = new Map(asArray(existing.items).map((item) => [String(item.id || ""), item]));
    return {
      ...existing,
      ...checklist,
      id: text(checklist?.id || existing.id) || createId(),
      name: String(checklist?.name ?? ""),
      items: asArray(checklist?.items).flatMap((item) => {
        const id = text(item?.id) || createId();
        const label = String(item?.label ?? "");
        if (!label.trim()) return [];
        return [{
          ...(existingItems.get(id) || {}),
          ...item,
          id,
          label,
          done: Boolean(item?.done)
        }];
      })
    };
  });
}
