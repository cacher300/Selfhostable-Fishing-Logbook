function isTrollingTripRecord(trip) {
  return String(trip?.method || "").toLowerCase() === "trolling";
}

function setupLineSideLabel(value) {
  return choiceLabel("setupLineSides", value) || "";
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
  const onCheater = record.setupLineTarget === "cheater";
  return {
    ...record,
    comboId: line.comboId || record.comboId || "",
    rodId: line.rodId || record.rodId || "",
    reelId: line.reelId || record.reelId || "",
    side: line.side || record.side || "",
    lineLabel: line.lineLabel || record.lineLabel || "",
    lureId: onCheater ? (line.cheaterLureId || record.lureId || "") : (line.lureId || record.lureId || ""),
    flasherId: onCheater ? "" : (line.flasherId || record.flasherId || ""),
    presentation: line.presentation || record.presentation || "",
    speed: record.speed || line.speed || "",
    ballDepth: record.ballDepth || line.ballDepth || "",
    lineBehindBoard: record.lineBehindBoard || line.lineBehindBoard || "",
    estimatedLureDepth: record.estimatedLureDepth || line.estimatedLureDepth || "",
    dipseySetting: record.dipseySetting || line.dipseySetting || "",
    lineOut: record.lineOut || line.lineOut || "",
    estimatedDepth: record.estimatedDepth || line.estimatedDepth || "",
    deepestRigger: record.deepestRigger || false,
    setupLine: line
  };
}

function defaultSetupLineSide(gearItem, index) {
  if (gearItem.side) return gearItem.side;
  if (["Chute Rod", "downrigger", "cheater"].includes(gearItem.presentation)) return "Center";
  return index % 2 === 0 ? "Port" : "Starboard";
}

const SPREAD_SLOT_CONFIG = {
  portOutsideBoard: { side: "port", order: 0, markerType: "board", label: "Outside Board" },
  portInsideBoard: { side: "port", order: 1, markerType: "board", label: "Inside Board" },
  portHighDiver: { side: "port", order: 2, markerType: "diver", label: "High Diver" },
  portLowDiver: { side: "port", order: 3, markerType: "diver", label: "Low Diver" },
  portDownRigger: { side: "port", order: 4, markerType: "downRigger", label: "Downrigger" },
  chuteRod: { side: "center", order: 5, markerType: "chute", label: "Chute Rod" },
  starboardDownRigger: { side: "starboard", order: 6, markerType: "downRigger", label: "Downrigger" },
  starboardLowDiver: { side: "starboard", order: 7, markerType: "diver", label: "Low Diver" },
  starboardHighDiver: { side: "starboard", order: 8, markerType: "diver", label: "High Diver" },
  starboardInsideBoard: { side: "starboard", order: 9, markerType: "board", label: "Inside Board" },
  starboardOutsideBoard: { side: "starboard", order: 10, markerType: "board", label: "Outside Board" }
};

const SPREAD_ANCHORS = {
  upperHighBoard: { xPct: 25.51, yPct: 31.44 },
  upperLowBoard: { xPct: 37.97, yPct: 30.13 },
  upperHighDiver: { xPct: 47.41, yPct: 30.13 },
  upperLowDiver: { xPct: 57.02, yPct: 30.13 },
  lowerHighBoard: { xPct: 25.51, yPct: 67.90 },
  lowerLowBoard: { xPct: 37.97, yPct: 69.65 },
  lowerHighDiver: { xPct: 47.41, yPct: 69.76 },
  lowerLowDiver: { xPct: 57.02, yPct: 69.76 },
  upperDownRigger: { xPct: 86.78, yPct: 9.61 },
  lowerDownRigger: { xPct: 86.78, yPct: 90.72 },
  chuteRod: { xPct: 60.86, yPct: 50 }
};

const SLOT_ANCHORS = {
  portOutsideBoard: SPREAD_ANCHORS.upperHighBoard,
  portInsideBoard: SPREAD_ANCHORS.upperLowBoard,
  portHighDiver: SPREAD_ANCHORS.upperHighDiver,
  portLowDiver: SPREAD_ANCHORS.upperLowDiver,
  portDownRigger: SPREAD_ANCHORS.upperDownRigger,
  chuteRod: SPREAD_ANCHORS.chuteRod,
  starboardDownRigger: SPREAD_ANCHORS.lowerDownRigger,
  starboardLowDiver: SPREAD_ANCHORS.lowerLowDiver,
  starboardHighDiver: SPREAD_ANCHORS.lowerHighDiver,
  starboardInsideBoard: SPREAD_ANCHORS.lowerLowBoard,
  starboardOutsideBoard: SPREAD_ANCHORS.lowerHighBoard
};

const SLOT_ENDPOINTS = {
  portOutsideBoard: { xPct: 155, yPct: -38 },
  portInsideBoard: { xPct: 155, yPct: -29 },
  portHighDiver: { xPct: 155, yPct: -20 },
  portLowDiver: { xPct: 155, yPct: -8 },
  starboardLowDiver: { xPct: 155, yPct: 108 },
  starboardHighDiver: { xPct: 155, yPct: 120 },
  starboardInsideBoard: { xPct: 155, yPct: 129 },
  starboardOutsideBoard: { xPct: 155, yPct: 138 }
};

const SLOT_LANES = {
  portOutsideBoard: { xPct: 62, yPct: -38 },
  portInsideBoard: { xPct: 66, yPct: -29 },
  portHighDiver: { xPct: 70, yPct: -20 },
  portLowDiver: { xPct: 72, yPct: -8 },
  starboardLowDiver: { xPct: 72, yPct: 108 },
  starboardHighDiver: { xPct: 70, yPct: 120 },
  starboardInsideBoard: { xPct: 66, yPct: 129 },
  starboardOutsideBoard: { xPct: 62, yPct: 138 }
};

const DOWNRIGGER_LINES = {
  portDownRigger: {
    start: { xPct: 86.78, yPct: 9.61 },
    end: { xPct: 155, yPct: 9.61 }
  },
  starboardDownRigger: {
    start: { xPct: 86.78, yPct: 90.72 },
    end: { xPct: 155, yPct: 90.72 }
  },
  chuteRod: {
    start: { xPct: 60.86, yPct: 50 },
    end: { xPct: 155, yPct: 50 }
  }
};

const SLOT_LABELS = {
  portOutsideBoard: { xPct: 158, yPct: -38 },
  portInsideBoard: { xPct: 158, yPct: -29 },
  portHighDiver: { xPct: 158, yPct: -20 },
  portLowDiver: { xPct: 158, yPct: -8 },
  portDownRigger: { xPct: 158, yPct: 9.61 },
  chuteRod: { xPct: 158, yPct: 50 },
  starboardDownRigger: { xPct: 158, yPct: 90.72 },
  starboardLowDiver: { xPct: 158, yPct: 108 },
  starboardHighDiver: { xPct: 158, yPct: 120 },
  starboardInsideBoard: { xPct: 158, yPct: 129 },
  starboardOutsideBoard: { xPct: 158, yPct: 138 }
};

const LEGACY_TROLLING_METHODS = {
  downrigger: "Downrigger",
  cheater: "Downrigger",
  flatline: "Chute Rod",
  "flatline-leadcore": "Outside Board",
  "dipsey-diver": "High Diver"
};

const LEGACY_LINE_SIDES = {
  port: "Port",
  center: "Center",
  starboard: "Starboard"
};

function canonicalTrollingMethod(value) {
  const method = String(value || "");
  return LEGACY_TROLLING_METHODS[method] || method;
}

function canonicalLineSide(value) {
  const side = String(value || "");
  return LEGACY_LINE_SIDES[side] || side;
}

function getSpreadSlot(rod) {
  const method = canonicalTrollingMethod(rod?.trollingMethod ?? rod?.presentation);
  const side = canonicalLineSide(rod?.lineSide ?? rod?.side);
  if (method === "Chute Rod") return "chuteRod";

  const slots = {
    "Port|Outside Board": "portOutsideBoard",
    "Port|Inside Board": "portInsideBoard",
    "Port|High Diver": "portHighDiver",
    "Port|Low Diver": "portLowDiver",
    "Port|Downrigger": "portDownRigger",
    "Starboard|Downrigger": "starboardDownRigger",
    "Starboard|Low Diver": "starboardLowDiver",
    "Starboard|High Diver": "starboardHighDiver",
    "Starboard|Inside Board": "starboardInsideBoard",
    "Starboard|Outside Board": "starboardOutsideBoard"
  };
  return slots[`${side}|${method}`] || null;
}

function uniqueText(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].join(", ");
}

function buildSpreadGroups(rods = []) {
  const grouped = new Map();
  rods.forEach((rod) => {
    const slot = getSpreadSlot(rod);
    if (!slot) return;
    if (!grouped.has(slot)) grouped.set(slot, []);
    grouped.get(slot).push(rod);
  });

  return [...grouped.entries()]
    .map(([slot, slotRods]) => {
      const config = SPREAD_SLOT_CONFIG[slot];
      return {
        slot,
        label: config.label,
        rods: slotRods,
        side: config.side,
        markerType: config.markerType,
        fishCount: slotRods.reduce((sum, rod) => sum + (Number(rod.fishCount) || 0), 0),
        lostCount: slotRods.reduce((sum, rod) => sum + (Number(rod.lostCount) || 0), 0),
        lureSummary: uniqueText(slotRods.map((rod) => rod.lureName)),
        flasherSummary: uniqueText(slotRods.map((rod) => rod.flasherName)),
        lureIds: [...new Set(slotRods.map((rod) => rod.lureId).filter(Boolean))],
        flasherIds: [...new Set(slotRods.map((rod) => rod.flasherId).filter(Boolean))],
        hasCheater: config.markerType === "downRigger" && slotRods.some((rod) => Boolean(rod.hasCheater)),
        cheaterSummary: uniqueText(slotRods.filter((rod) => rod.hasCheater).map((rod) => rod.cheaterLureName)),
        cheaterLureIds: [...new Set(slotRods.filter((rod) => rod.hasCheater).map((rod) => rod.cheaterLureId).filter(Boolean))],
        cheaterFishCount: slotRods
          .filter((rod) => rod.hasCheater)
          .reduce((sum, rod) => sum + (Number(rod.cheaterFishCount) || 0), 0)
      };
    })
    .sort((a, b) => SPREAD_SLOT_CONFIG[a.slot].order - SPREAD_SLOT_CONFIG[b.slot].order);
}

function getSpreadLayout(groups = []) {
  return groups.map((group) => {
    const specialLine = DOWNRIGGER_LINES[group.slot];
    return {
      ...group,
      start: specialLine?.start || SLOT_ANCHORS[group.slot],
      bend: specialLine?.lane || SLOT_LANES[group.slot] || null,
      end: specialLine?.end || SLOT_ENDPOINTS[group.slot],
      labelPoint: SLOT_LABELS[group.slot],
      boomStart: null
    };
  });
}

function spreadGroupStats(group) {
  const stats = [
    group.fishCount > 0 ? `${group.fishCount} fish` : "",
    group.lostCount > 0 ? `${group.lostCount} lost` : ""
  ].filter(Boolean).join(" \u00b7 ");
  return stats;
}

function spreadGearMarkup(group) {
  const tokens = [];
  const seen = new Set();
  group.rods.forEach((rod) => {
    [
      { type: "lure", id: rod.lureId, name: rod.lureName },
      { type: "flasher", id: rod.flasherId, name: rod.flasherName }
    ].forEach((gear) => {
      if (!gear.name) return;
      const key = `${gear.type}:${gear.id || gear.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      tokens.push(gear);
    });
  });
  return tokens.map((gear, index) => {
    const separator = index ? `<span class="spread-gear-separator"> + </span>` : "";
    if (!gear.id) return `${separator}<span>${escapeHtml(gear.name)}</span>`;
    const attribute = gear.type === "flasher" ? "data-spread-flasher-id" : "data-spread-lure-id";
    return `${separator}<button class="spread-lure-link" type="button" ${attribute}="${escapeHtml(gear.id)}">${escapeHtml(gear.name)}</button>`;
  }).join("");
}

function percentPointStyle(point) {
  return `left:${point.xPct}%;top:${point.yPct}%`;
}

function spreadCssLine(start, end, className = "") {
  const left = Math.min(start.xPct, end.xPct);
  const top = Math.min(start.yPct, end.yPct);
  const width = Math.abs(end.xPct - start.xPct);
  const height = Math.abs(end.yPct - start.yPct);
  const dx = end.xPct - start.xPct;
  const dy = end.yPct - start.yPct;
  const direction = height < 0.3 ? "is-horizontal" : dx * dy < 0 ? "is-rising" : "is-falling";
  return `<div class="spread-css-line ${direction} ${className}" style="left:${left}%;top:${top}%;width:${width}%;height:${Math.max(height, 0.3)}%"></div>`;
}

function spreadMarkerMarkup(group) {
  if (["downRigger", "chute"].includes(group.markerType)) return "";
  const markerPoint = ["board", "diver"].includes(group.markerType) ? group.bend : group.end;
  return `<span class="spread-end-marker spread-marker-${group.markerType}" style="${percentPointStyle(markerPoint)}"></span>`;
}

function renderCheater(group) {
  if (!group.hasCheater) return "";
  const fishingLineStart = group.start;
  const midpoint = {
    xPct: (fishingLineStart.xPct + group.end.xPct) / 2,
    yPct: (fishingLineStart.yPct + group.end.yPct) / 2
  };
  const cheaterEnd = {
    xPct: midpoint.xPct + 14,
    yPct: midpoint.yPct + (group.side === "port" ? -7 : 7)
  };
  const cheaterText = [
    group.cheaterSummary ? `Cheater: ${group.cheaterSummary}` : "Cheater",
    group.cheaterFishCount > 0 ? `${group.cheaterFishCount} fish` : ""
  ].filter(Boolean).join(" \u00b7 ");
  const cheaterContent = group.cheaterLureIds.length === 1
    ? `<button class="spread-lure-link" type="button" data-spread-lure-id="${escapeHtml(group.cheaterLureIds[0])}">${escapeHtml(cheaterText)}</button>`
    : escapeHtml(cheaterText);
  return `
    ${spreadCssLine(midpoint, cheaterEnd, "spread-cheater-line")}
    <span class="spread-cheater-label" style="${percentPointStyle(cheaterEnd)}">
      ${cheaterContent}
    </span>
  `;
}

function renderMainSpreadLine(group) {
  if (["board", "diver"].includes(group.markerType)) {
    return `
      ${spreadCssLine(group.start, group.bend, "spread-outward-line")}
      ${spreadCssLine(group.bend, group.end, "spread-main-line")}
    `;
  }
  return spreadCssLine(group.start, group.end, "spread-main-line");
}

function spreadNamePoint(group) {
  return {
    xPct: (SLOT_LANES.portOutsideBoard.xPct + SLOT_ENDPOINTS.portOutsideBoard.xPct) / 2,
    yPct: group.end.yPct
  };
}

function renderSpreadDiagram(rods = []) {
  const layouts = getSpreadLayout(buildSpreadGroups(rods));
  const renderedLines = layouts.map((group) => {
    const stats = spreadGroupStats(group);
    const gearMarkup = spreadGearMarkup(group);
    const hasDetails = group.rods.length > 1 || gearMarkup || stats;
    return `
      <div class="spread-group spread-${group.side} spread-${group.markerType}" data-spread-slot="${group.slot}">
        ${group.boomStart ? spreadCssLine(group.boomStart, group.start, "spread-downrigger-boom") : ""}
        ${renderMainSpreadLine(group)}
        ${renderCheater(group)}
        ${spreadMarkerMarkup(group)}
        <strong class="spread-inline-name" style="${percentPointStyle(spreadNamePoint(group))}">${escapeHtml(group.label)}</strong>
        ${hasDetails ? `
          <div class="spread-html-label" style="${percentPointStyle(group.labelPoint)}">
            ${group.rods.length > 1 ? `<span>${group.rods.length} rods</span>` : ""}
            ${group.rods.length > 1 && gearMarkup ? `<span class="spread-detail-separator">·</span>` : ""}
            ${gearMarkup ? `<span class="spread-gear-list">${gearMarkup}</span>` : ""}
            ${stats ? `<span class="spread-stat-text">${escapeHtml(stats)}</span>` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  return `
    <div class="spread-diagram-wrap">
      <div class="spread-diagram" role="img" aria-label="Trolling spread diagram">
        <div class="spread-water">
          <div class="spread-design-stage">
            <img class="spread-boat-image" src="/static/img/boat_rotated_90ccw_bg_223_243_251.png" alt="" />
            <div class="spread-overlay">${renderedLines}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function tripRodsForSpread(trip) {
  return (trip?.gearUsed || []).map((gearItem) => {
    const counts = typeof setupLineCounts === "function"
      ? setupLineCounts(trip, gearItem)
      : { fish: 0, lost: 0 };
    return {
      ...gearItem,
      lineSide: gearItem.side,
      trollingMethod: gearItem.presentation,
      lureName: lureName(gearItem.lureId),
      flasherName: flasherName(gearItem.flasherId),
      fishCount: counts.fish,
      lostCount: counts.lost,
      hasCheater: Boolean(gearItem.hasCheater),
      lureId: gearItem.lureId || "",
      cheaterLureName: lureName(gearItem.cheaterLureId) || gearItem.cheaterLureName || "",
      cheaterLureId: gearItem.cheaterLureId || "",
      cheaterFishCount: typeof setupLineCheaterFishCount === "function"
        ? setupLineCheaterFishCount(trip, gearItem)
        : (Number(gearItem.cheaterFishCount) || 0)
    };
  });
}

function renderTrollingSpread(trip) {
  if (!isTrollingTripRecord(trip)) return "";
  return renderSpreadDiagram(tripRodsForSpread(trip));
}

function liveSetupLineCounts(setupLineId) {
  if (!setupLineId) return { fish: 0, lost: 0 };
  const fish = [...els.catchRows.querySelectorAll(".catch-row")]
    .filter((row) => row.querySelector(".catch-setup-line")?.value === setupLineId)
    .length;
  const lost = [...els.lostFishRows.querySelectorAll(".catch-row")]
    .filter((row) => row.querySelector(".catch-setup-line")?.value === setupLineId)
    .length;
  return { fish, lost };
}

function liveCheaterFishCount(setupLineId) {
  if (!setupLineId) return 0;
  return [...els.catchRows.querySelectorAll(".catch-row")]
    .filter((row) => row.querySelector(".catch-setup-line")?.value === `${setupLineId}::cheater`)
    .length;
}

function liveTripRodsForSpread() {
  return [...els.tripGearRows.querySelectorAll(".gear-used-row")].map((row) => {
    if (!row.dataset.gearId) row.dataset.gearId = createId();
    const counts = liveSetupLineCounts(row.dataset.gearId);
    return {
      id: row.dataset.gearId,
      lineSide: row.querySelector(".trip-gear-side")?.value || "",
      trollingMethod: row.querySelector(".catch-presentation")?.value || "",
      lureId: row.querySelector(".trip-gear-lure")?.value || "",
      lureName: lureName(row.querySelector(".trip-gear-lure")?.value),
      flasherId: row.querySelector(".trip-gear-flasher")?.value || "",
      flasherName: flasherName(row.querySelector(".trip-gear-flasher")?.value),
      fishCount: counts.fish,
      lostCount: counts.lost,
      hasCheater: Boolean(row.querySelector(".trip-gear-cheater")?.checked),
      cheaterLureId: row.querySelector(".trip-gear-cheater-lure")?.value || "",
      cheaterLureName: selectedText(row.querySelector(".trip-gear-cheater-lure")).replace("No lure selected", ""),
      cheaterFishCount: liveCheaterFishCount(row.dataset.gearId)
    };
  });
}

function renderLiveTrollingSpread() {
  const section = document.querySelector("#tripTrollingSpreadPreview");
  const canvas = document.querySelector("#tripTrollingSpreadCanvas");
  if (!section || !canvas) return;
  const trolling = isTrollingTrip();
  section.classList.toggle("hidden", !trolling);
  if (trolling) canvas.innerHTML = renderSpreadDiagram(liveTripRodsForSpread());
}
