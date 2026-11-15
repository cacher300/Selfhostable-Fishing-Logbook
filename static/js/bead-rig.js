export const BEAD_RIG_FIELDS = ["beadCount", "secondBeadLureId", "thirdBeadLureId", "beadToHookDistance", "beadAttachment", "beadSpacing", "thirdBeadSpacing"];

export function beadRigPatch(record = {}) {
  if (!BEAD_RIG_FIELDS.some((key) => Object.hasOwn(record, key))) return {};
  const count = Math.max(1, Math.min(3, Math.trunc(Number(record.beadCount) || 1)));
  return {
    beadCount: count,
    secondBeadLureId: count >= 2 ? String(record.secondBeadLureId || "").trim() : "",
    thirdBeadLureId: count >= 3 ? String(record.thirdBeadLureId || "").trim() : "",
    beadToHookDistance: String(record.beadToHookDistance || "").trim(),
    beadAttachment: String(record.beadAttachment || "").trim(),
    beadSpacing: count >= 2 ? String(record.beadSpacing || "").trim() : "",
    thirdBeadSpacing: count >= 3 ? String(record.thirdBeadSpacing || "").trim() : ""
  };
}

export function beadRigDetails(record = {}, name = (id) => id) {
  if (!record.beadCount) return [];
  return [
    ["Beads on rig", String(record.beadCount)],
    ["Bead 2", record.beadCount >= 2 ? name(record.secondBeadLureId) : ""],
    ["Bead 3", record.beadCount >= 3 ? name(record.thirdBeadLureId) : ""],
    ["Nearest bead to hook", record.beadToHookDistance],
    ["Bead attachment", record.beadAttachment],
    ["Bead 1–2 spacing", record.beadCount >= 2 ? record.beadSpacing : ""],
    ["Bead 2–3 spacing", record.beadCount >= 3 ? record.thirdBeadSpacing : ""]
  ].filter(([, value]) => value);
}
