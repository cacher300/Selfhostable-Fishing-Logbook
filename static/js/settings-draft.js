import { createId } from "./app-defaults.js";
import { slugOptionValue } from "./app-normalization.js";
import { validateChopRanges } from "./app-units.js";

const text = (value) => String(value ?? "").trim();

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
      const presentation = text(row?.presentation);
      const usesColor = ["high-diver", "low-diver"].includes(presentation.toLowerCase().replace(/[\s_]+/g, "-"));
      return {
        ...(existing.spread?.[index] || {}),
        ...row,
        comboId: text(row?.comboId),
        side: text(row?.side),
        presentation,
        dipseyDiverColor: usesColor ? text(row?.dipseyDiverColor) : ""
      };
    })
  };
}
