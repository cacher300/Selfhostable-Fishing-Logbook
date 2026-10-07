import { html } from "./html.js";
import { state } from "./app-state.js";
import { unitSymbol } from "./app-units.js";
import { fishCount, number } from "./dashboard.js";
import { comboName, rodName } from "./gear-core.js";
import { trimNumber } from "./form-utils.js";
import { tripMonthName } from "./stats-scope.js";
import { setupLineSideLabel } from "./trolling-spread.js";
import { calculateMinutes, comboMinutes, presentationLabel, timeBucket } from "./stats.js";
import {
  cloudCoverBucket,
  filterPerformanceItems,
  makePerformanceItems,
  numericRangeLabel,
  performanceRow,
  saneStatsNumber,
  setupLineMinutes,
  sortPerformanceItems,
  windSpeedBucket
} from "./stats-performance.js";

const TIME_OF_DAY_ORDER = ["Morning", "Midday", "Afternoon", "Evening", "Night"];
const MONTH_ORDER = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Free-text colors are grouped into families so "Blue/Silver" and "Silver Blue
// Glow" both contribute to Blue and Silver. A lure can belong to several.
const COLOR_FAMILIES = [
  ["Chartreuse", /chartreuse|\bchart\b|fire ?tiger/],
  ["Green", /green|lime|olive|\bmoss|fire ?tiger/],
  ["Blue", /blue|navy|cobalt/],
  ["Purple", /purple|violet|grape|plum|\bkiwi\b/],
  ["Pink", /pink|magenta|bubble ?gum|salmon/],
  ["Orange", /orange|fire ?tiger|tangerine/],
  ["Red", /\bred\b|crimson|blood/],
  ["Yellow", /yellow|lemon/],
  ["White", /white|pearl|\bbone\b/],
  ["Black", /black/],
  ["Silver", /silver|chrome|nickel|mirror/],
  ["Gold", /gold|brass/],
  ["Copper", /copper/],
  ["Brown", /brown|\btan\b|bronze|pumpkin|rootbeer|root beer/],
  ["Gray", /gr[ae]y|smoke/],
  ["Glow", /glow|lumi/],
  ["UV", /\buv\b/]
];

export const COMPARISON_METRICS = [
  { id: "fishPerHour", label: "Fish / hr" },
  { id: "strikesPerHour", label: "Strikes / hr" },
  { id: "fish", label: "Landed" },
  { id: "fishPerTrip", label: "Fish / trip" },
  { id: "landingPercentage", label: "Landing %" }
];

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/");
}

function lineValue(record, key) {
  return record?.setupLine?.[key] || record?.[key] || "";
}

function tripWeatherNumber(trip, key) {
  const value = Number(trip?.weatherData?.tripWindow?.[key]);
  return Number.isFinite(value) ? value : null;
}

export function colorFamilies(color, { glow = false } = {}) {
  const text = cleanText(color).toLowerCase();
  const families = COLOR_FAMILIES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  if (glow && !families.includes("Glow")) families.push("Glow");
  if (!families.length && text) families.push("Other");
  return families;
}

export function lureSizeLabel(lure) {
  if (!lure) return "";
  const type = cleanText(lure.type) || "Lure";
  const size = cleanText(lure.spoonSize) || cleanText(lure.beadSize) || cleanText(lure.weight);
  return size ? `${size} ${type}` : "";
}

export function timeOfDaySlices(record, minutes) {
  const start = record.startTime || record.trip?.launchTime || "";
  const end = record.endTime || record.trip?.linesPulledTime || "";
  const windowMinutes = Math.round(calculateMinutes(start, end));
  if (!windowMinutes || !(minutes > 0)) return [];
  const [startHour, startMinute] = String(start).split(":").map(Number);
  const startOfWindow = startHour * 60 + startMinute;
  const totals = new Map();
  for (let offset = 0; offset < windowMinutes; offset += 1) {
    const minuteOfDay = (startOfWindow + offset) % 1440;
    const label = timeBucket(`${Math.floor(minuteOfDay / 60)}:${String(minuteOfDay % 60).padStart(2, "0")}`);
    totals.set(label, (totals.get(label) || 0) + 1);
  }
  return [...totals].map(([label, count]) => ({ label, minutes: (count / windowMinutes) * minutes }));
}

const lureOf = (record, ctx) => ctx.lure(record.lureId);
const flasherOf = (record, ctx) => ctx.flasher(record.flasherId);

export const COMPARISON_DIMENSIONS = [
  { id: "lureColor", label: "Lure color", header: "Lure Color", group: "Lure", effort: "lure", value: (record, ctx) => cleanText(lureOf(record, ctx)?.color) },
  {
    id: "lureColorFamily",
    label: "Lure color family",
    header: "Color Family",
    group: "Lure",
    effort: "lure",
    multi: true,
    value: (record, ctx) => {
      const lure = lureOf(record, ctx);
      return lure ? colorFamilies(lure.color, { glow: lure.glow }) : [];
    }
  },
  { id: "lureSize", label: "Lure size", header: "Lure Size", group: "Lure", effort: "lure", value: (record, ctx) => lureSizeLabel(lureOf(record, ctx)) },
  { id: "lureWeight", label: "Lure weight", header: "Lure Weight", group: "Lure", effort: "lure", value: (record, ctx) => cleanText(lureOf(record, ctx)?.weight) },
  { id: "lureType", label: "Lure type", header: "Lure Type", group: "Lure", effort: "lure", value: (record, ctx) => cleanText(lureOf(record, ctx)?.type) },
  {
    id: "lureGlow",
    label: "Glow vs non-glow",
    header: "Glow",
    group: "Lure",
    effort: "lure",
    value: (record, ctx) => {
      const lure = lureOf(record, ctx);
      if (!lure) return "";
      return lure.glow || /glow|lumi/i.test(lure.color || "") ? "Glow" : "Non-glow";
    }
  },
  { id: "bladeType", label: "Blade type", header: "Blade Type", group: "Lure", effort: "lure", value: (record, ctx) => cleanText(lureOf(record, ctx)?.bladeType) },
  { id: "lureBrand", label: "Lure brand", header: "Brand", group: "Lure", effort: "lure", value: (record, ctx) => cleanText(lureOf(record, ctx)?.brand) },
  { id: "lure", label: "Lure", header: "Lure", group: "Lure", effort: "lure", value: (record, ctx) => cleanText(lureOf(record, ctx)?.name) },

  { id: "dipseyColor", label: "Dipsey diver color", header: "Dipsey Color", group: "Trolling", effort: "line", trolling: true, value: (record) => cleanText(lineValue(record, "dipseyDiverColor")) },
  { id: "dipseySetting", label: "Dipsey setting", header: "Dipsey Setting", group: "Trolling", trolling: true, catchOnly: true, value: (record) => cleanText(record.dipseySetting) },
  { id: "flasherColor", label: "Flasher color", header: "Flasher Color", group: "Trolling", effort: "flasher", trolling: true, value: (record, ctx) => cleanText(flasherOf(record, ctx)?.color) },
  { id: "flasherType", label: "Flasher type", header: "Flasher Type", group: "Trolling", effort: "flasher", trolling: true, value: (record, ctx) => cleanText(flasherOf(record, ctx)?.type) },
  {
    id: "lureFlasherColor",
    label: "Lure color + flasher color",
    header: "Color Combo",
    group: "Trolling",
    effort: "combo",
    trolling: true,
    value: (record, ctx) => {
      const lureColor = cleanText(lureOf(record, ctx)?.color);
      const flasherColor = cleanText(flasherOf(record, ctx)?.color);
      return lureColor && flasherColor ? `${lureColor} + ${flasherColor}` : "";
    }
  },
  { id: "presentation", label: "Trolling method", header: "Method", group: "Trolling", effort: "line", trolling: true, value: (record) => presentationLabel(record.presentation) },
  { id: "lineSide", label: "Line side", header: "Line Side", group: "Trolling", effort: "line", trolling: true, value: (record) => setupLineSideLabel(lineValue(record, "side")) },
  {
    id: "distanceBehind",
    label: "Distance behind",
    header: "Distance",
    group: "Trolling",
    effort: "line",
    trolling: true,
    value: (record) => {
      const distance = saneStatsNumber(lineValue(record, "distanceBehind"), { min: 0, max: 1000 });
      return distance === null ? "" : numericRangeLabel(distance, 25, ` ${unitSymbol("depth")}`);
    }
  },
  {
    id: "attachedWeight",
    label: "Attached weight",
    header: "Weight",
    group: "Trolling",
    effort: "line",
    trolling: true,
    value: (record) => {
      const weight = cleanText(lineValue(record, "attachedWeightOz"));
      return weight ? `${weight} oz` : "";
    }
  },

  { id: "rigging", label: "Rigging", header: "Rigging", group: "Setup", effort: "line", value: (record) => cleanText(lineValue(record, "rigging")) },
  { id: "rod", label: "Rod / combo", header: "Rod", group: "Setup", effort: "line", value: (record) => comboName(lineValue(record, "comboId")) || rodName(lineValue(record, "rodId")) },

  {
    id: "timeOfDay",
    label: "Time of day",
    header: "Time Of Day",
    group: "Conditions",
    effort: "line",
    order: TIME_OF_DAY_ORDER,
    value: (record) => (record.time ? timeBucket(record.time) : ""),
    effortSlices: timeOfDaySlices
  },
  { id: "waterClarity", label: "Water clarity", header: "Water Clarity", group: "Conditions", effort: "line", order: () => (state.waterClarities || []).map((item) => (typeof item === "object" ? item?.label || item?.value : item)), value: (record) => cleanText(record.trip?.waterClarity) },
  { id: "weather", label: "Weather", header: "Weather", group: "Conditions", effort: "line", value: (record) => cleanText(record.trip?.weather) },
  { id: "cloudCover", label: "Cloud cover", header: "Cloud Cover", group: "Conditions", effort: "line", order: ["Clear <25%", "Broken 25-60%", "Cloudy 60-90%", "Overcast 90%+"], value: (record) => cloudCoverBucket(tripWeatherNumber(record.trip, "cloudCoverPercent")) },
  { id: "windSpeed", label: "Wind speed", header: "Wind Speed", group: "Conditions", effort: "line", value: (record) => windSpeedBucket(tripWeatherNumber(record.trip, "windSpeedMph")) },
  { id: "month", label: "Month", header: "Month", group: "Conditions", effort: "line", order: MONTH_ORDER, value: (record) => (record.trip?.date ? tripMonthName(record.trip) : "") },
  { id: "location", label: "Location", header: "Location", group: "Conditions", effort: "line", value: (record) => cleanText(record.trip?.location) },
  { id: "method", label: "Fishing method", header: "Fishing Method", group: "Conditions", effort: "line", value: (record) => cleanText(record.trip?.method) },

  { id: "species", label: "Species", header: "Species", group: "Catch", catchOnly: true, value: (record) => cleanText(record.species || record.possibleSpecies) }
];

const DIMENSIONS_BY_ID = new Map(COMPARISON_DIMENSIONS.map((dimension) => [dimension.id, dimension]));

export function comparisonDimension(id) {
  return DIMENSIONS_BY_ID.get(id) || null;
}

export function comparisonContext() {
  const lures = new Map((state.lures || []).map((lure) => [lure.id, lure]));
  const flashers = new Map((state.flashers || []).map((flasher) => [flasher.id, flasher]));
  return {
    lure: (id) => (id ? lures.get(id) || null : null),
    flasher: (id) => (id ? flashers.get(id) || null : null)
  };
}

function asLabels(value) {
  return (Array.isArray(value) ? value : [value]).map(cleanText).filter(Boolean);
}

function effortMinutes(dimension, record) {
  if (dimension.effort === "lure") return record.lureId ? (number(record.lureMinutes) || setupLineMinutes(record)) : 0;
  if (dimension.effort === "flasher") return record.flasherId ? (number(record.flasherMinutes) || setupLineMinutes(record)) : 0;
  if (dimension.effort === "combo") return comboMinutes(record) || setupLineMinutes(record);
  return setupLineMinutes(record);
}

function effortEntries(dimension, record, ctx) {
  if (dimension.catchOnly) return [];
  const minutes = Math.max(0, effortMinutes(dimension, record));
  if (dimension.effortSlices) return dimension.effortSlices(record, minutes);
  return asLabels(dimension.value(record, ctx)).map((label) => ({ label, minutes }));
}

function catchLabels(dimension, record, ctx) {
  return asLabels(dimension.value(record, ctx));
}

function crossLabels(left, right) {
  if (!right) return left.map((label) => [label]);
  return left.flatMap((a) => right.map((b) => [a, b]));
}

/**
 * Summarize catch performance for one comparison dimension, optionally split
 * by a second dimension. Time comes from timed setup lines; landed and lost
 * fish come from catch records that resolve to those lines.
 */
export function summarizeComparison({ effortRecords = [], catchRecords = [], lostRecords = [] }, compareId, splitId = "") {
  const compare = comparisonDimension(compareId);
  if (!compare) return [];
  const split = splitId && splitId !== compareId ? comparisonDimension(splitId) : null;
  const ctx = comparisonContext();
  const groups = new Map();
  const ensure = (labels) => {
    const key = labels.map((label) => label.toLowerCase()).join("\u0000");
    let group = groups.get(key);
    if (!group) {
      group = { name: labels.join(" · "), compareLabel: labels[0], splitLabel: labels[1] || "", fish: 0, lost: 0, minutes: 0, trips: new Set(), uses: 0 };
      groups.set(key, group);
    }
    return group;
  };

  let totalMinutes = 0;
  effortRecords.forEach((record) => {
    const compareEntries = effortEntries(compare, record, ctx);
    if (!compareEntries.length) return;
    totalMinutes += compare.multi ? compareEntries[0].minutes : compareEntries.reduce((sum, entry) => sum + entry.minutes, 0);
    const splitEntries = split ? effortEntries(split, record, ctx) : [null];
    compareEntries.forEach((compareEntry) => {
      splitEntries.forEach((splitEntry) => {
        const group = ensure(splitEntry ? [compareEntry.label, splitEntry.label] : [compareEntry.label]);
        group.minutes += splitEntry ? Math.min(compareEntry.minutes, splitEntry.minutes) : compareEntry.minutes;
        group.trips.add(record.trip?.id);
        group.uses += 1;
      });
    });
  });

  let totalFish = 0;
  catchRecords.forEach((record) => {
    const count = fishCount(record);
    totalFish += count;
    const labels = crossLabels(catchLabels(compare, record, ctx), split ? catchLabels(split, record, ctx) : null);
    labels.forEach((pair) => {
      const group = ensure(pair);
      group.fish += count;
      group.trips.add(record.trip?.id);
    });
  });

  lostRecords.forEach((record) => {
    const labels = crossLabels(catchLabels(compare, record, ctx), split ? catchLabels(split, record, ctx) : null);
    labels.forEach((pair) => {
      const group = ensure(pair);
      group.lost += 1;
      group.trips.add(record.trip?.id);
    });
  });

  const items = [...groups.values()].map((group) => ({
    ...group,
    trips: new Set([...group.trips].filter(Boolean)),
    hasTimeSample: !compare.catchOnly && !split?.catchOnly
  }));
  return makePerformanceItems(items, totalMinutes / 60, totalFish);
}

export function sampleLabel(item) {
  const strikes = number(item.fish) + number(item.lost);
  const hoursOk = !item.hasUsableTime || item.hours >= 10;
  if (item.trips >= 5 && strikes >= 10 && hoursOk) return "Strong";
  if (item.trips >= 2 && strikes >= 3) return "Fair";
  return "Thin";
}

export const COMPARISON_PERFORMANCE_HEADERS = ["Landed", "Lost", "Strikes", "Hours", "Fish / hr", "Strikes / hr", "Landing %", "Trips", "Fish / trip", "Time %", "Fish %", "Efficiency", "Delta", "Sample"];

export function comparisonHeaders(dimensionId) {
  const dimension = comparisonDimension(dimensionId);
  return [dimension?.header || "Name", ...COMPARISON_PERFORMANCE_HEADERS];
}

export function comparisonRows(items, labelHeader = "Name") {
  return filterPerformanceItems(sortPerformanceItems(items)).map((item) => [...performanceRow(item, labelHeader), sampleLabel(item)]);
}

function metricValue(item, metric) {
  if (!item) return null;
  if (["fishPerHour", "strikesPerHour"].includes(metric)) return item.hasUsableTime ? item[metric] : null;
  if (metric === "landingPercentage") return item.landingPercentage === null ? null : item.landingPercentage * 100;
  return item[metric] ?? null;
}

function metricText(value, metric) {
  if (value === null) return "—";
  if (metric === "landingPercentage") return `${trimNumber(value)}%`;
  if (["fishPerHour", "strikesPerHour"].includes(metric)) return `${trimNumber(value)}/hr`;
  return String(trimNumber(value));
}

function matrixCell(item, metric, best) {
  const value = metricValue(item, metric);
  if (!item || value === null) return { html: html`<span class="stats-matrix-empty">—</span>`, value: -1 };
  const detail = item.hasUsableTime ? `${item.fish} fish · ${trimNumber(item.hours)} hr` : `${item.fish} fish · ${item.lost} lost`;
  return {
    html: html`<span class="stats-matrix-cell${best ? " is-best" : ""}"><strong>${metricText(value, metric)}</strong><small>${detail}</small></span>`,
    value
  };
}

function orderedLabels(items, labelKey, order) {
  const totals = new Map();
  items.forEach((item) => {
    const key = item[labelKey].toLowerCase();
    const current = totals.get(key) || { label: item[labelKey], fish: 0, minutes: 0 };
    current.fish += item.fish + item.lost;
    current.minutes += item.hours;
    totals.set(key, current);
  });
  const entries = [...totals.values()];
  const byActivity = (a, b) => b.fish - a.fish || b.minutes - a.minutes || a.label.localeCompare(b.label);
  const orderList = typeof order === "function" ? order() : order;
  if (Array.isArray(orderList) && orderList.length) {
    const position = new Map(orderList.map((label, index) => [String(label).toLowerCase(), index]));
    return entries.sort((a, b) => ((position.get(a.label.toLowerCase()) ?? 999) - (position.get(b.label.toLowerCase()) ?? 999)) || byActivity(a, b)).map((entry) => entry.label);
  }
  return entries.sort(byActivity).map((entry) => entry.label);
}

/**
 * Build a pivot table: one row per compared value, one column per split value.
 */
export function comparisonMatrix(splitItems, overallItems, { compareId, splitId, metric = "fishPerHour", rowLimit = 12, columnLimit = 6 } = {}) {
  const compare = comparisonDimension(compareId);
  const split = comparisonDimension(splitId);
  const rowsInOrder = filterPerformanceItems(sortPerformanceItems(overallItems)).slice(0, rowLimit);
  const columns = orderedLabels(splitItems, "splitLabel", split?.order).slice(0, columnLimit);
  const cellFor = (rowLabel, columnLabel) => splitItems.find((item) => (
    item.compareLabel.toLowerCase() === rowLabel.toLowerCase() && item.splitLabel.toLowerCase() === columnLabel.toLowerCase()
  ));
  const bestByColumn = columns.map((column) => {
    const values = rowsInOrder.map((row) => metricValue(cellFor(row.name, column), metric)).filter((value) => value !== null);
    const best = values.length > 1 ? Math.max(...values) : null;
    return best > 0 ? best : null;
  });
  const rows = rowsInOrder.map((row) => [
    row.name,
    ...columns.map((column, index) => {
      const item = cellFor(row.name, column);
      const value = metricValue(item, metric);
      return matrixCell(item, metric, value !== null && bestByColumn[index] !== null && value === bestByColumn[index]);
    }),
    matrixCell(row, metric, false)
  ]);
  return { headers: [compare?.header || "Name", ...columns, "Overall"], rows };
}

export function comparisonHighlights(sources, dimensionIds) {
  return dimensionIds.map((id) => {
    const dimension = comparisonDimension(id);
    if (!dimension) return null;
    const timed = summarizeComparison(sources, id).filter((item) => item.hasUsableTime && item.hours > 0);
    if (timed.length < 2) return null;
    const qualified = timed.filter((item) => item.trips >= 2 && item.fish + item.lost >= 2);
    const pool = qualified.length ? qualified : timed.filter((item) => item.fish > 0);
    if (!pool.length) return null;
    const totalFish = timed.reduce((sum, item) => sum + item.fish, 0);
    const totalHours = timed.reduce((sum, item) => sum + item.hours, 0);
    const average = totalHours ? totalFish / totalHours : 0;
    const ranked = [...pool].sort((a, b) => b.fishPerHour - a.fishPerHour || b.fish - a.fish);
    const best = ranked[0];
    const trailing = ranked.length > 1 ? ranked.at(-1) : null;
    const lift = average ? ((best.fishPerHour / average) - 1) * 100 : null;
    return [
      dimension.label,
      best.name,
      `${trimNumber(best.fishPerHour)}/hr`,
      lift === null ? "n/a" : `${lift >= 0 ? "+" : ""}${trimNumber(lift)}%`,
      best.fish,
      trimNumber(best.hours),
      trailing ? `${trailing.name} (${trimNumber(trailing.fishPerHour)}/hr)` : "—",
      sampleLabel(best)
    ];
  }).filter(Boolean);
}

export function comparisonNote(compareId, splitId = "") {
  const compare = comparisonDimension(compareId);
  const split = splitId ? comparisonDimension(splitId) : null;
  if (!compare) return "";
  const notes = [];
  if (compare.catchOnly || split?.catchOnly) {
    const name = (compare.catchOnly ? compare : split).label.toLowerCase();
    notes.push(`${name[0].toUpperCase()}${name.slice(1)} is recorded per catch, so there is no time to compare. Use landed, lost, and landing % instead.`);
  } else {
    notes.push("Hours are rod hours from timed setup lines. Fish and lost fish come from catches tied to those lines.");
  }
  if (compare.multi || split?.multi) notes.push("A lure that mixes colors counts toward every color family it matches, so shares can add up past 100%.");
  if (compare.id === "timeOfDay" || split?.id === "timeOfDay") notes.push("Line time is split across morning, midday, afternoon, evening, and night using each line's start and end times.");
  return notes.join(" ");
}
