const setupLineSideLabels = {
  port: "Port",
  center: "Center",
  starboard: "Starboard"
};

function isTrollingTripRecord(trip) {
  return String(trip?.method || "").toLowerCase() === "trolling";
}

function setupLineSideLabel(value) {
  return setupLineSideLabels[value] || "";
}

function setupLineForRecord(record) {
  if (!record?.setupLineId || !record.trip) return null;
  return (record.trip.gearUsed || []).find((gearItem) => gearItem.id === record.setupLineId) || null;
}

function gearComboName(lureId, flasherId) {
  return [lureName(lureId), flasherName(flasherId)].filter(Boolean).join(" + ");
}

function setupLineAutoLabel(gearItem, index = 0) {
  const pieces = [
    setupLineSideLabel(gearItem.side),
    presentationLabel(gearItem.presentation) || `Rod ${index + 1}`
  ].filter(Boolean);
  const rodReel = comboName(gearItem.comboId) || [rodName(gearItem.rodId), reelName(gearItem.reelId)].filter(Boolean).join(" + ");
  const gear = gearComboName(gearItem.lureId, gearItem.flasherId);
  return [pieces.join(" "), rodReel || gear].filter(Boolean).join(": ") || `Rod ${index + 1}`;
}

function setupLineDisplayLabel(trip, gearItem) {
  const index = Math.max(0, (trip.gearUsed || []).findIndex((item) => item.id === gearItem.id));
  return gearItem.lineLabel || setupLineAutoLabel(gearItem, index);
}

function resolveTripLineRecord(record) {
  const line = setupLineForRecord(record);
  if (!line) return record;
  return {
    ...record,
    comboId: line.comboId || record.comboId || "",
    rodId: line.rodId || record.rodId || "",
    reelId: line.reelId || record.reelId || "",
    side: line.side || record.side || "",
    lineLabel: line.lineLabel || record.lineLabel || "",
    lureId: line.lureId || record.lureId || "",
    flasherId: line.flasherId || record.flasherId || "",
    presentation: line.presentation || record.presentation || "",
    speed: record.speed || line.speed || "",
    ballDepth: record.ballDepth || line.ballDepth || "",
    lineBehindBoard: record.lineBehindBoard || line.lineBehindBoard || "",
    estimatedLureDepth: record.estimatedLureDepth || line.estimatedLureDepth || "",
    dipseySetting: record.dipseySetting || line.dipseySetting || "",
    lineOut: record.lineOut || line.lineOut || "",
    estimatedDepth: record.estimatedDepth || line.estimatedDepth || "",
    deepestRigger: line.deepestRigger || record.deepestRigger || false,
    setupLine: line
  };
}

function defaultSetupLineSide(gearItem, index) {
  if (gearItem.side) return gearItem.side;
  if (["downrigger", "cheater"].includes(gearItem.presentation)) return "center";
  return index % 2 === 0 ? "port" : "starboard";
}
