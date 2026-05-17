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
    presentationLabel(gearItem.presentation) || `Setup ${index + 1}`
  ].filter(Boolean);
  const gear = gearComboName(gearItem.lureId, gearItem.flasherId);
  return [pieces.join(" "), gear].filter(Boolean).join(": ") || `Setup ${index + 1}`;
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
    setupLine: line
  };
}

function setupLineTimeMatches(gearItem, time) {
  if (!time || (!gearItem.startTime && !gearItem.endTime)) return false;
  const minutes = timelineTimeValue(time);
  const start = gearItem.startTime ? timelineTimeValue(gearItem.startTime) : 0;
  let end = gearItem.endTime ? timelineTimeValue(gearItem.endTime) : 24 * 60;
  let value = minutes;
  if (end < start) {
    end += 24 * 60;
    if (value < start) value += 24 * 60;
  }
  return value >= start && value <= end;
}

function setupLineGearScore(fish, gearItem, requireTime = false) {
  if (requireTime && !setupLineTimeMatches(gearItem, fish.time)) return -1;
  let score = 0;
  if (fish.lureId && fish.lureId === gearItem.lureId) score += 4;
  if (fish.flasherId && fish.flasherId === gearItem.flasherId) score += 3;
  if (fish.presentation && fish.presentation === gearItem.presentation) score += 2;
  return score;
}

function findBestSetupLineForFish(fish, trip) {
  const lines = (trip.gearUsed || []).filter((gearItem) => gearItem.id);
  if (!lines.length) return "";
  const passes = [
    (gearItem) => setupLineGearScore(fish, gearItem, true),
    (gearItem) => setupLineGearScore(fish, gearItem, false),
    (gearItem) => {
      let score = 0;
      if (fish.lureId && fish.lureId === gearItem.lureId) score += 4;
      if (fish.flasherId && fish.flasherId === gearItem.flasherId) score += 3;
      return score;
    }
  ];
  for (const scoreFn of passes) {
    const ranked = lines
      .map((gearItem) => ({ gearItem, score: scoreFn(gearItem) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (ranked.length) return ranked[0].gearItem.id;
  }
  return "";
}

function defaultSetupLineSide(gearItem, index) {
  if (gearItem.side) return gearItem.side;
  if (["downrigger", "cheater"].includes(gearItem.presentation)) return "center";
  return index % 2 === 0 ? "port" : "starboard";
}

function normalizeTrollingSpreadData(logbook) {
  let changed = false;
  (logbook.trips || []).forEach((trip) => {
    if (!isTrollingTripRecord(trip)) return;
    (trip.gearUsed || []).forEach((gearItem, index) => {
      if (!gearItem.id) {
        gearItem.id = createId();
        changed = true;
      }
      const side = defaultSetupLineSide(gearItem, index);
      if (gearItem.side !== side) {
        gearItem.side = side;
        changed = true;
      }
      if (gearItem.lineLabel === undefined) {
        gearItem.lineLabel = "";
        changed = true;
      }
    });

    [...(trip.catches || []), ...(trip.lostFish || [])].forEach((fish) => {
      const lineExists = fish.setupLineId && (trip.gearUsed || []).some((gearItem) => gearItem.id === fish.setupLineId);
      if (!lineExists) {
        const setupLineId = findBestSetupLineForFish(fish, trip);
        if (setupLineId) {
          fish.setupLineId = setupLineId;
          changed = true;
        }
      }
      if (fish.setupLineId) {
        ["lureId", "flasherId", "presentation"].forEach((key) => {
          if (key in fish) {
            delete fish[key];
            changed = true;
          }
        });
      }
    });
  });
  return changed;
}
