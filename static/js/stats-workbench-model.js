import { catalog, clock, contextFor, launch, measurement, numeric, person, ratingName, ratio, rounded, text, waterbody, windowEdges } from "./stats-dimensions.js";
import { convertUnitValue } from "./measurement-conversion.js";
import { calendarDate, dateKey, datePresets, inDateRange, monthName, statsDateWindow, statsMonthNames } from "./stats-calendar.js";

const options = values => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const valueOf = v => !v || /^All /.test(v) ? "" : v;
const matches = (filter, value) => !valueOf(filter) || filter === value;
const choice = v => typeof v === "string" ? v : v?.label || v?.value;
export const catchQuantity = r => r.quantity === undefined || r.quantity === "" ? 1 : Math.max(0, numeric(r.quantity) ?? 0);
const completed = t => !t.isDraft && t.liveStatus !== "active" && t.liveStatus !== "paused" &&
  (t.liveStatus === "completed" || t.linesPulledTime || !t.liveEvents?.some(e => e.kind === "trip-started") || t.liveEvents.some(e => e.kind === "trip-ended"));
const labels = (dim, t, r, c) => {
  const v = dim.read(t, r, c);
  const names = (Array.isArray(v) ? v : [v]).filter(x => x !== false && text(x)).map(text);
  if (!["lureColor","flasherColor","lureFlasherColor","dipseyColor"].includes(dim.id)) return names;
  return names.map(name => {
    const clean = name.replace(/\s+/g," ").replace(/\s*\/\s*/g,"/"), key = pairKey(dim.id,clean.toLowerCase());
    if (!c.colorLabels.has(key)) c.colorLabels.set(key,clean);
    return c.colorLabels.get(key);
  });
};
const supports = (dim, method) => !dim.modes || dim.modes.includes(method);
const shift = (minute, origin) => minute === null ? null : minute < origin ? minute + 1440 : minute;
const interval = (start, end, origin) => {
  const s = shift(clock(start), origin), rawEnd = clock(end);
  if (s === null || rawEnd === null) return null;
  const e = shift(rawEnd, s % 1440) + (s >= 1440 ? 1440 : 0);
  return e > s ? [s, e] : null;
};
function tripTime(t) {
  const start = t.linesSetTime || t.launchTime, origin = clock(start) ?? 0;
  const span = interval(start, t.linesPulledTime, origin);
  const idle = Math.max(0, numeric(t.idleHours) ?? 0);
  const hours = span ? Math.max(0, (span[1] - span[0]) / 60 - idle) : Math.max(0, numeric(t.hours) ?? 0);
  return { origin, span, hours: span || hours > 0 ? hours : null, idle };
}
export const usedStatsMethods = trips => options(trips.filter(completed).map(t => t.method));
export function statsDateOptions(trips) {
  const years = options(trips.filter(t => completed(t) && calendarDate(t.date)).map(t => t.date.slice(0,4))).reverse();
  return [...datePresets,...years.map(id => ({id,label:id}))];
}
function lastYear(key) {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y - 1, m - 1, Math.min(d, new Date(y - 1, m, 0).getDate())));
}
export const filterLabels = { method: "Fishing method", targetSpecies: "Trip target", species: "Catch species", location: "Waterbody", launch: "Launch", person: "Angler", lure: "Lure", flasher: "Flasher", waterClarity: "Water clarity", weather: "Weather tag", month: "Month", rating: "Trip rating" };
export function reportForMethod(method) {
  return ({ Trolling:"presentation", Casting:"retrieve", Drifting:"drift", Jigging:"waterColumn", "Fly Fishing":"flyPresentation", "Ice Fishing":"depthDown", "Bait Fishing":"rigging", "Shore Fishing":"structure" })[method] || "lureColor";
}
export function statsFilterOptions(book) {
  const ts = book.trips || [], c = contextFor(book);
  return {
    method: usedStatsMethods(ts),
    targetSpecies: options([...(book.species || []), ...ts.map(t => t.targetSpecies)]),
    species: options([...(book.species || []), ...ts.flatMap(t => [...(t.catches || []).map(r => r.species), ...(t.lostFish || []).map(r => r.possibleSpecies || r.species)])]).filter(x => x !== "Anything"),
    location: options([...(book.locations || []).map(l => l.name), ...ts.map(t => waterbody(t, c))]),
    launch: options(ts.map(t => launch(t, c))), person: options([...(book.people || []), ...ts.flatMap(t => t.people || [])].map(p => p.name)),
    lure: options((book.lures || []).map(l => l.name)), flasher: options((book.flashers || []).map(l => l.name)),
    waterClarity: options([...(book.waterClarities || []).map(choice), ...ts.map(t => t.waterClarity)]),
    weather: options([...(book.weatherTypes || []).map(choice), ...ts.map(t => t.weather)]),
    month: [...statsMonthNames], rating: ["Bad", "Mediocre", "Good", "Outstanding"]
  };
}

function tripFacts(t, scope, c) {
  const time = tripTime(t), rawLines = t.gearUsed || [], byId = new Map(rawLines.map(l => [l.id, l]));
  const trolling = t.method === "Trolling";
  const recordMatch = r => matches(scope.lure, c.label("lures", r.lureId)) && matches(scope.flasher, c.label("flashers", r.flasherId)) && matches(scope.person, person(t, r.personId, c));
  const lines = [];
  for (const l of rawLines) {
    const span = interval(l.startTime, l.endTime, time.origin);
    lines.push({ ...l, span, setupLineTarget: "main" });
    if (trolling && l.hasCheater) lines.push({ ...l, span, setupLineTarget: "cheater", presentation: "Cheater", lureId: l.cheaterLureId, flasherId: "", flasherMinutes: 0 });
  }
  const events = [];
  for (const [list, lost] of [[t.catches, false], [t.lostFish, true]]) for (const r of list || []) {
    const l = byId.get(r.setupLineId);
    const cheater = trolling && r.setupLineTarget === "cheater";
    const e = { ...r, lost, count: catchQuantity(r), minute: r.timeUnknown ? null : clock(r.time),
      possibleSpecies: lost ? r.possibleSpecies || r.species : undefined,
      personId: r.personId || l?.personId, setupLineTarget: cheater ? "cheater" : l || r.setupLineTarget === "main" ? "main" : "",
      lureId: trolling && l ? (cheater ? l.cheaterLureId : l.lureId) || r.lureId : r.lureId || l?.lureId,
      flasherId: cheater ? "" : (trolling ? l?.flasherId || r.flasherId : r.flasherId || l?.flasherId),
      presentation: cheater ? "Cheater" : trolling ? l?.presentation || r.presentation : r.presentation || l?.presentation };
    // Only setup configuration is inherited. Old setup rows can contain retired
    // speed/depth fields; those are not observations of a fish at the bite.
    for (const key of ["comboId","rodId","reelId","side","dipseyDiverColor","distanceBehind","attachedWeightOz"]) {
      if (text(l?.[key])) e[key] = l[key];
    }
    if (l && typeof l.hasLeadcore === "boolean") e.hasLeadcore = l.hasLeadcore;
    if (!text(e.rigging) && text(l?.rigging)) e.rigging = l.rigging;
    if (!numeric(r.beadCount) && l) {
      for (const key of ["beadCount","secondBeadLureId","thirdBeadLureId","beadAttachment","beadSpacing","thirdBeadSpacing","beadToHookDistance"]) {
        if (!text(e[key]) && text(l[key])) e[key] = l[key];
      }
    }
    if (e.count > 0) events.push(e);
  }
  const participants = new Set([...(t.people || []).map(p => p.name), ...events.map(r => person(t, r.personId, c)), ...lines.map(l => person(t, l.personId, c))].filter(Boolean));
  if (valueOf(scope.person) && !participants.has(scope.person)) return null;
  if ((valueOf(scope.lure) || valueOf(scope.flasher)) && ![...lines, ...events].some(recordMatch)) return null;
  return { t, ...time, participants, lines: lines.filter(recordMatch), events: events.filter(e => recordMatch(e) && matches(scope.species, e.lost ? e.possibleSpecies : e.species)) };
}

function initial() {
  return { ids: new Set(), timedIds: new Set(), producing: new Set(), targetHit: new Set(), sole: new Set(), otherHit: new Set(),
    hours: 0, hasHours: false, fish: 0, lost: 0, timedFish: 0, timedLost: 0, released: 0, lengths: [], weights: [], temperatures: [] };
}
function effort(g, id, hours) {
  g.ids.add(id);
  if (hours != null) g.hasHours = true;
  if (hours > 0) { g.hours += hours; g.timedIds.add(id); }
}
function addEvent(g, e, t, c, timed) {
  g.ids.add(t.id);
  if (e.lost) { g.lost += e.count; if (timed) g.timedLost += e.count; return; }
  g.fish += e.count;
  if (timed) g.timedFish += e.count;
  g.producing.add(t.id);
  if (t.targetSpecies === e.species) g.targetHit.add(t.id);
  if (e.released) g.released += e.count;
  for (const [field, key, list] of [["length","fishLength",g.lengths], ["weight","fishWeight",g.weights]]) {
    const v = measurement(e[field], key, c.units);
    // A grouped catch supplies one measurement, not N independently measured fish.
    if (v !== null && v > 0) list.push(v);
  }
}
const median = values => {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return (values[mid] + values[Math.floor((values.length - 1) / 2)]) / 2;
};
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const pct = (a, b) => b > 0 ? a / b * 100 : null;
function finish(g, threshold) {
  const trips = g.ids.size, strikes = g.fish + g.lost;
  return { fish: g.fish, lost: g.lost, strikes, trips, hours: g.hasHours ? g.hours : null, timedTrips: g.timedIds.size,
    fishPerHour: ratio(g.timedFish, g.hours), strikesPerHour: ratio(g.timedFish + g.timedLost, g.hours),
    timedFish: g.timedFish, timedStrikes: g.timedFish + g.timedLost, landingPercentage: pct(g.fish, strikes),
    fishPerTrip: ratio(g.fish, trips), strikesPerTrip: ratio(strikes, trips), skunk: pct(trips - g.producing.size, trips), produce: pct(g.producing.size, trips),
    released: g.released, kept: g.fish - g.released, releaseRate: pct(g.released, g.fish), targetRate: pct(g.targetHit.size, trips),
    sole: g.sole.size, quiet: g.otherHit.size, measured: g.lengths.length, weighed: g.weights.length,
    meanLength: mean(g.lengths), medianLength: median(g.lengths), minLength: g.lengths[0] ?? null, maxLength: g.lengths.at(-1) ?? null,
    meanWeight: mean(g.weights), medianWeight: median(g.weights), minWeight: g.weights[0] ?? null, maxWeight: g.weights.at(-1) ?? null,
    over: threshold > 0 ? pct(g.lengths.filter(v => v >= threshold).length, g.lengths.length) : null,
    readings: g.temperatures.length, temperature: ratio(g.temperatures.reduce((a, b) => a + b, 0), g.temperatures.length),
    minTemp: g.temperatures.length ? Math.min(...g.temperatures) : null, maxTemp: g.temperatures.length ? Math.max(...g.temperatures) : null };
}
function legMinutes(l, ids) {
  const duration = l.span ? l.span[1] - l.span[0] : 0;
  const lure = Math.max(0, numeric(l.lureMinutes) || duration), flasher = Math.max(0, numeric(l.flasherMinutes) || duration);
  if (ids.some(id => id.startsWith("lureFlasher")) || (ids.some(id => id.startsWith("flasher")) && ids.some(id => id.startsWith("lure")))) return Math.min(lure, flasher);
  if (ids.some(id => id.startsWith("flasher"))) return flasher;
  if (ids.some(id => id.startsWith("lure") || id.startsWith("bead") || ["bladeType", "flyCategory"].includes(id))) return lure;
  return duration || Math.max(lure, flasher);
}
function intersections(span, others) {
  if (!span) return [];
  const clips = others.map(s => [Math.max(span[0], s[0]), Math.min(span[1], s[1])]).filter(([a,b]) => b > a).sort((a,b) => a[0] - b[0]);
  const merged = [];
  for (const [a,b] of clips) {
    if (merged.length && a <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(b, merged.at(-1)[1]);
    else merged.push([a,b]);
  }
  return merged;
}
const pairKey = (a, b) => JSON.stringify([a, b]);
const metricLabels = { fish: "Landed", lost: "Lost", strikes: "Logged strikes", trips: "Trips", hours: "Hours", timedTrips: "Timed trips",
  fishPerHour: "Fish / hour", strikesPerHour: "Strikes / hour", timedFish: "Landed on timed effort", timedStrikes: "Strikes on timed effort",
  landingPercentage: "Landing %", fishPerTrip: "Fish / trip", strikesPerTrip: "Strikes / trip", skunk: "Skunk %", produce: "Trips producing %", released: "Released", kept: "Kept",
  releaseRate: "Released %", targetRate: "Target success %", catchShare: "Catch share %", timedCatchShare: "Timed catch share %", timeShare: "Effort share %", efficiencyIndex: "Timed catch / effort share",
  sole: "Sole producer trips", quiet: "Quiet while others hit", measured: "Lengths logged", weighed: "Weights logged", over: "At / above size %",
  readings: "Readings", temperature: "Mean", minTemp: "Minimum", maxTemp: "Maximum" };
function reportRows(facts, d, split, c, opts) {
  const dims = [d, split].filter(Boolean), ids = dims.map(x => x.id);
  const isFish = dims.some(x => x.kind === "fish"), isLine = !isFish && dims.some(x => x.kind === "line"), win = dims.find(x => x.kind === "window");
  const groupMap = new Map(), names = new Set();
  let overlappingGroups = false;
  const pairEnabled = d.kind === "line" && !isFish && d.id !== "lureColorFamily";
  const matched = opts.matched && pairEnabled;
  const shareSide = ids.some(id => /^(rod|reel)/.test(id) || ["lineSide","distanceBehind","attachedWeight","dipseyColor","leadcoreUse"].includes(id))
    && !ids.some(id => /^(lure|flasher|lineTarget|presentation|bead)/.test(id) || ["bladeType","flyCategory"].includes(id));
  function group(name, secondary) {
    const key = pairKey(name, secondary);
    if (!groupMap.has(key)) groupMap.set(key, { name, secondary, key, ...initial() });
    return groupMap.get(key);
  }
  for (const f of facts) {
    const {t} = f;
    if (!dims.every(dim => supports(dim, t.method))) continue;
    if (d.id === "angler" && (f.participants.size < 2 || (opts.a && !f.participants.has(opts.a)) || (opts.b && !f.participants.has(opts.b)))) {
      if (f.participants.size >= 2) for (const p of f.participants) names.add(p);
      continue;
    }
    function keys(r) {
      const first = labels(d,t,r,c), second = split ? labels(split,t,r,c) : [""];
      if (first.length * second.length > 1) overlappingGroups = true;
      return first.flatMap(a => second.map(b => [a,b]));
    }
    const inPair = a => (!opts.a && !opts.b) || a === opts.a || a === opts.b;
    const get = r => keys(r).flatMap(([a,b]) => { names.add(a); return inPair(a) ? [group(a,b)] : []; });
    if (d.kind === "profile") {
      for (const p of t.probeTemperatureProfile || []) {
        const feet = numeric(p.depthFeet), v = measurement(p.temperature, "waterTemperature", c.units);
        if (feet === null || v === null) continue;
        const label = `${rounded(convertUnitValue(feet, "ft", c.units.depth))} ${c.units.depth}`;
        for (const g of get({ label })) { g.ids.add(t.id); g.temperatures.push(v); }
      }
      continue;
    }
    if (d.id === "angler") for (const p of f.participants) {
      names.add(p);
      if (inPair(p)) group(p, "").ids.add(t.id);
    }
    if (!isFish && !isLine && !win) for (const g of get({})) effort(g, t.id, f.hours);
    // Each item is one fishing interval. Counterpart intervals are unioned before
    // intersections so two simultaneously deployed comparison rods don't double our hours.
    const legs = isLine ? f.lines.map(l => ({ l, span: l.span, minutes: legMinutes(l, ids), sides: labels(d, t, l, c) })) : [];
    const timedLines = new Map();
    const edges = win && !isFish ? windowEdges(win.id,t) : [];
    const exposure = (r, span, minutes) => {
      if (!win) { for (const g of get(r)) effort(g,t.id, minutes > 0 ? minutes / 60 : null); return; }
      if (!span || f.idle || Math.abs(minutes - (span[1] - span[0])) > 0.001) return;
      // Clock effort can only be allocated when the entire interval is accounted for.
      for (let m = span[0]; m < span[1];) {
        const minute = m % 1440, count = Math.min(span[1] - m, edges.find(edge => edge > minute) - minute);
        for (const g of get({ ...r, minute })) effort(g,t.id,count / 60);
        m += count;
      }
    };
    if (isLine) {
      for (const {l, span, minutes, sides} of legs) {
        sides.forEach(a => names.add(a));
        if (shareSide && l.setupLineTarget === "cheater") continue;
        let clips = span ? [span] : [];
        if (matched) {
          if (!opts.a || !opts.b || opts.a === opts.b || f.idle || !span || minutes !== span[1] - span[0]) continue;
          const other = sides.includes(opts.a) ? opts.b : sides.includes(opts.b) ? opts.a : "";
          if (!other) continue;
          clips = intersections(span, legs.filter(x => x.l !== l && x.span && x.minutes === x.span[1] - x.span[0] && x.sides.includes(other)).map(x => x.span));
          if (!clips.length) continue;
          for (const clip of clips) exposure(l, clip, clip[1] - clip[0]);
        } else exposure(l, span, minutes);
        if (minutes > 0 && (!win || (span && !f.idle && minutes === span[1] - span[0]))) timedLines.set(l, clips);
      }
    } else if (!isFish && win && f.span) exposure({}, f.span, f.hours * 60);
    for (const e of f.events) {
      const point = shift(e.minute, f.origin);
      let timed = Boolean(f.hours);
      if (isLine) {
        const available = f.lines.filter(l => {
          if (e.setupLineId ? e.setupLineId !== l.id : (!e.lureId || e.lureId !== l.lureId)) return false;
          if (!shareSide && e.setupLineTarget && e.setupLineTarget !== l.setupLineTarget) return false;
          if (shareSide && l.setupLineTarget === "cheater") return false;
          if (!timedLines.has(l)) return false;
          const spans = timedLines.get(l);
          if (point === null) return !matched && !win && !!e.setupLineId;
          if (!spans.length) return !matched && !win;
          return spans.some(([a,b]) => point >= a && point < b);
        });
        if (matched && !available.length) continue;
        for (const g of get(e)) {
          const attributed = available.some(l => keys({ ...l, minute: e.minute }).some(([a,b]) => a === g.name && b === g.secondary));
          if (!matched || attributed) addEvent(g,e,t,c,attributed);
        }
        continue;
      }
      if (win) timed = !!f.span && !f.idle && point !== null && point >= f.span[0] && point < f.span[1];
      for (const g of get(e)) addEvent(g,e,t,c,!isFish && timed);
    }
  }
  const groups = [...groupMap.values()];
  if (isLine && !split && !matched) {
    const producers = new Map();
    for (const g of groups) for (const id of g.producing) producers.set(id,(producers.get(id) || 0) + 1);
    for (const g of groups) for (const id of g.ids) {
      if (g.producing.has(id) && producers.get(id) === 1) g.sole.add(id);
      if (!g.producing.has(id) && producers.has(id)) g.otherHit.add(id);
    }
  }
  const totals = new Map();
  for (const g of groups) {
    const total = totals.get(g.secondary) || { fish: 0, strikes: 0, timedFish: 0, hours: 0 };
    total.fish += g.fish; total.strikes += g.fish + g.lost; total.timedFish += g.timedFish; total.hours += g.hours; totals.set(g.secondary, total);
  }
  const rows = groups.map(g => {
    const values = finish(g, opts.threshold), total = totals.get(g.secondary);
    values.catchShare = pct(g.fish,total.fish); values.strikeShare = pct(values.strikes,total.strikes);
    values.timeShare = g.timedIds.size ? pct(g.hours,total.hours) : null;
    values.timedCatchShare = g.timedIds.size ? pct(g.timedFish,total.timedFish) : null;
    values.efficiencyIndex = values.timedCatchShare === null ? null : ratio(values.timedCatchShare, values.timeShare);
    return { key: g.key, name: g.name, secondary: g.secondary, values, tripIds: [...g.ids] };
  }).filter(r => r.values.trips >= (opts.minTrips || 0) && (isFish || d.kind === "profile" || (r.values.hours || 0) >= (opts.minHours || 0)));
  const columns = d.kind === "profile" ? ["temperature","minTemp","maxTemp","readings","trips"]
    : d.id === "sizes" ? ["medianLength","meanLength","minLength","maxLength","measured","over","medianWeight","meanWeight","minWeight","maxWeight","weighed","fish","trips"]
    : isFish ? ["fish","fishPerTrip","lost","strikes","strikesPerTrip","landingPercentage","catchShare","strikeShare","trips", ...(d.id === "species" ? ["kept","released","releaseRate"] : []), "medianLength","medianWeight"]
    : ["fishPerHour","fish","lost","strikes","hours","trips","strikesPerHour","landingPercentage","fishPerTrip",
      ...(isLine ? ["timeShare","catchShare","timedCatchShare","efficiencyIndex","produce", ...(!split && !matched && !opts.a && !opts.b ? ["sole","quiet"] : [])]
        : win ? [] : ["skunk", ...(d.id === "target" ? ["targetRate"] : [])]), "timedFish","timedStrikes","timedTrips"];
  if (d.id === "target" && !isFish && !isLine && !win) columns.unshift(columns.splice(columns.indexOf("targetRate"),1)[0]);
  const columnLabel = id => ({
    hours: isLine ? "Line-hours" : "Fishing hours", fishPerHour: isLine ? "Fish / line-hour" : "Fish / hour", strikesPerHour: isLine ? "Strikes / line-hour" : "Strikes / hour",
    medianLength: `Median length (${c.units.fishLength})`, meanLength: `Average length (${c.units.fishLength})`, minLength: `Shortest (${c.units.fishLength})`, maxLength: `Longest (${c.units.fishLength})`,
    medianWeight: `Median weight (${c.units.fishWeight})`, meanWeight: `Average weight (${c.units.fishWeight})`, minWeight: `Lightest (${c.units.fishWeight})`, maxWeight: `Heaviest (${c.units.fishWeight})`,
    strikeShare: "Strike share %", temperature: `Mean (°${c.units.waterTemperature})`, minTemp: `Min (°${c.units.waterTemperature})`, maxTemp: `Max (°${c.units.waterTemperature})`
  }[id] || metricLabels[id]);
  const preferred = { lostSpecies:"lost", outcome:"strikes", shaker:"catchShare", gpsSpeed:"fishPerTrip", ballSpeed:"fishPerTrip", deepestRigger:"fishPerTrip", directionSpeed:"fishPerTrip", speedDelta:"fishPerTrip", hour:"strikesPerHour", timeOfDay:"strikesPerHour", sunWindow:"strikesPerHour", moonWindow:"strikesPerHour" }[d.id];
  const availableColumns = columns.filter(id => rows.some(r => Number.isFinite(r.values[id])));
  const requestedMetric = columns.includes(opts.metric) ? opts.metric : columns.includes(preferred) ? preferred : columns[0] || "";
  const countMetric = {fishPerHour:"fish", strikesPerHour:"strikes"}[requestedMetric];
  const missingEffort = Boolean(countMetric && rows.length && rows.every(r => r.values[requestedMetric] === null));
  const metric = missingEffort && availableColumns.includes(countMetric) ? countMetric
    : availableColumns.includes(requestedMetric) ? requestedMetric
      : availableColumns.includes(preferred) ? preferred : availableColumns[0] || "";
  rows.sort((a,b) => d.chart === "line" ? a.name.localeCompare(b.name, undefined, { numeric: true }) : (b.values[metric] ?? -Infinity) - (a.values[metric] ?? -Infinity) || a.name.localeCompare(b.name, undefined, { numeric: true }) || a.secondary.localeCompare(b.secondary));
  const productionNotes = [];
  if (ids.some(id => ["gpsSpeed","ballSpeed","directionSpeed","speedDelta"].includes(id))) productionNotes.push("Speed is recorded on individual fish; GPS and ball reports use 0.5-unit bands. Per-trip rates use only trips with a logged event in that band because time at each speed is not recorded.");
  if (ids.includes("deepestRigger")) productionNotes.push("Compares catches marked as the deepest main downrigger with other main downriggers; cheater catches are excluded.");
  const note = d.kind === "profile" ? "Saved probe readings, grouped by depth. Model-imported and manual profiles are included."
    : d.id === "sizes" ? "Each recorded measurement counts once. Missing lengths and weights are excluded, not treated as zero."
    : d.id === "angler" ? "Attributed fish on trips with at least two known anglers. Select two people to use only their shared trips."
    : matched ? "Only overlapping, explicitly timed deployments and timed bites count. Trips with unallocated idle time are excluded."
    : productionNotes.length ? productionNotes.join(" ")
    : isFish ? ""
    : isLine ? "One line-hour is one setup fishing for one hour. Rates use attributable fish on timed setups, including setups that caught nothing."
    : win ? "Rates use only clock windows with fully accounted fishing time. Unknown catch times and unallocated idle time cannot be assigned to a window."
    : "Rates use landed fish on timed trips divided by their net fishing hours. Trips with no landed fish still count.";
  return { rows, columns: availableColumns.map(id => ({ id, label: columnLabel(id) })), metric, names: options([...names]), pairEnabled, overlappingGroups,
    note: isLine ? "" : missingEffort ? `${note} No attributable hours in this selection; showing counts instead.` : note };
}

function scopedStats(book, scope, today, includeSeason = false) {
  const c = { ...contextFor(book),colorLabels:new Map() }, all = book.trips || [];
  const dateWindow = statsDateWindow(scope,today), range = dateWindow.bounds;
  const seasonRange = range || [`${today.getFullYear()}-01-01`, dateKey(today)];
  const periods = includeSeason ? [seasonRange,seasonRange.map(lastYear)] : [];
  const seasonLabels = new Map();
  const facts = [], seasonFacts = [], summary = initial(), fishByTrip = new Map();
  for (const t of all) {
    if (dateWindow.error) break;
    const current = inDateRange(t.date,range);
    const labels = periods.filter(p => inDateRange(t.date,p)).map(p => p.join(" to "));
    const compare = labels.length > 0;
    if ((!current && !compare) || !completed(t) || !matches(scope.method,t.method) || !matches(scope.targetSpecies,t.targetSpecies)
      || !matches(scope.location,waterbody(t,c)) || !matches(scope.launch,launch(t,c)) || !matches(scope.waterClarity,t.waterClarity)
      || !matches(scope.weather,t.weather) || !matches(scope.month,monthName(t.date)) || !matches(scope.rating,ratingName(t.tripRating))) continue;
    const f = tripFacts(t,scope,c);
    if (!f) continue;
    if (compare) { seasonFacts.push(f); seasonLabels.set(t,labels); }
    if (!current) continue;
    facts.push(f);
    effort(summary,t.id,f.hours);
    const before = summary.fish;
    for (const e of f.events) addEvent(summary,e,t,c,!!f.hours);
    fishByTrip.set(t.id,summary.fish - before);
  }
  const totals = finish(summary, 0);
  const best = facts.reduce((leader, { t }) => {
    const fish = fishByTrip.get(t.id);
    return !leader || fish > leader.fish ? { id: t.id, fish } : leader;
  }, null);
  const overview = { dateWindow, trips: facts.map(f => f.t), fishByTrip, totals, units: c.units,
    bestTripId: best?.id || "", bestFish: best?.fish ?? null };
  return { c, facts, seasonFacts, seasonLabels, overview };
}

export function buildBasicStats(book, scope = {}, today = new Date()) {
  const { c, facts, overview } = scopedStats(book, scope, today);
  const groups = [
    { id: "species", label: "Top species", byFish: true, read: (t, e) => e.species || "Unidentified" },
    { id: "lostSpecies", label: "Most missed fish by possible species", byFish: true, read: (t, e) => e.possibleSpecies || "Unidentified" },
    { id: "method", label: "Fishing methods", read: t => t.method },
    { id: "location", label: "Waterbodies", read: t => waterbody(t, c) },
    { id: "clarity", label: "Water clarity", read: t => t.waterClarity },
    { id: "weather", label: "Weather tags", read: t => t.weather },
    { id: "weatherFront", label: "Weather fronts", read: catalog.find(report => report.id === "weatherFront").read },
    { id: "chop", label: "Wave chop", read: t => t.waveChop }
  ];
  const breakdowns = groups.map(({ id, label, byFish = false, read }) => {
    const rows = new Map();
    function credit(name, id, fish, hours = null) {
      const key = text(name);
      if (!key) return;
      const row = rows.get(key) || { name: key, fish: 0, hours: null, timedFish: 0, tripIds: new Set() };
      row.fish += fish;
      if (hours !== null) row.hours = (row.hours ?? 0) + hours;
      if (hours > 0) row.timedFish += fish;
      row.tripIds.add(id);
      rows.set(key, row);
    }
    for (const { t, events, hours } of facts) {
      if (byFish) {
        for (const e of events) if (e.lost === (id === "lostSpecies")) credit(read(t, e), t.id, e.count);
      } else credit(read(t), t.id, overview.fishByTrip.get(t.id), hours);
    }
    return { id, label, byFish, rows: [...rows.values()]
      .map(row => ({ name:row.name, fish:row.fish, hours:row.hours, trips:row.tripIds.size, rate:ratio(row.timedFish, row.hours) }))
      .sort((a, b) => b.fish - a.fish || b.trips - a.trips || a.name.localeCompare(b.name)) };
  });
  const sizes = { longest:null, shortest:null, heaviest:null, lightest:null };
  for (const { events } of facts) for (const e of events) {
    if (e.lost) continue;
    for (const [field, unit, smallest, largest] of [
      ["length","fishLength","shortest","longest"], ["weight","fishWeight","lightest","heaviest"]
    ]) {
      const value = measurement(e[field], unit, c.units);
      if (!(value > 0)) continue;
      const fish = { value, species:text(e.species) };
      if (!sizes[smallest] || value < sizes[smallest].value) sizes[smallest] = fish;
      if (!sizes[largest] || value > sizes[largest].value) sizes[largest] = fish;
    }
  }
  const mostProductiveTrips = facts.map(({ t, hours }) => {
    const fish = overview.fishByTrip.get(t.id);
    return { name:t.title || waterbody(t,c) || "Fishing trip", date:t.date, location:waterbody(t,c), fish, hours, rate:ratio(fish,hours) };
  }).filter(row => row.fish > 0).sort((a,b) => b.fish - a.fish || text(b.date).localeCompare(text(a.date))).slice(0,5);
  const lureReport = catalog.find(report => report.id === "lure");
  const lureStats = reportRows(facts,lureReport,null,c,{ threshold:0 }).rows.map(({ name, values }) => ({
    name, fish:values.fish, timedFish:values.timedFish, hours:values.hours, rate:values.fishPerHour
  }));
  const daysFished = new Set(facts.map(({ t }) => t.date).filter(calendarDate)).size;
  return { ...overview, breakdowns, daysFished, ...sizes, mostProductiveTrips, lureStats };
}

export function basicSizeStats(model, hideEmpty = false) {
  const metric = (label, record, key, detail = record?.species) => ({
    label, value:record ? `${formatStat(record.value)} ${model.units[key]}` : "—", detail
  });
  const mean = value => value == null ? null : { value };
  return [
    metric("Longest fish", model.longest, "fishLength"),
    metric("Shortest fish", model.shortest, "fishLength"),
    metric("Average length", mean(model.totals.meanLength), "fishLength", `${model.totals.measured} measured`),
    metric("Heaviest fish", model.heaviest, "fishWeight"),
    metric("Lightest fish", model.lightest, "fishWeight"),
    metric("Average weight", mean(model.totals.meanWeight), "fishWeight", `${model.totals.weighed} weighed`)
  ].filter(stat => !hideEmpty || stat.value !== "—");
}

export function basicStatsTables(model, hideEmpty = false) {
  const table = (id, label, columns, rows, summary, note = "") => ({
    id, label, columns, note, rows:rows.slice(0,5).map(row => ({
      name:row.name, detail:row.detail, values:summary(row)
    }))
  });
  const byCatch = model.lureStats.filter(row => row.fish > 0)
    .sort((a,b) => b.fish - a.fish || a.name.localeCompare(b.name));
  const byRate = model.lureStats.filter(row => row.rate !== null && (!hideEmpty || row.rate > 0))
    .sort((a,b) => b.rate - a.rate || b.timedFish - a.timedFish || a.name.localeCompare(b.name));
  const tripRows = model.mostProductiveTrips.map(row => ({
    ...row, detail:[row.date, row.location === row.name ? "" : row.location].filter(Boolean).join(" · ")
  }));
  const tables = [
    table("trips","Most productive trips",["Trip","Landed","Hours","Fish / hr"],tripRows,
      row => [formatStat(row.fish),formatStat(row.hours),formatStat(row.rate)]),
    table("lures","Top 5 lures by catch",["Lure","Landed","Line-hours","Fish / line-hour"],byCatch,
      row => [formatStat(row.fish),formatStat(row.hours),formatStat(row.rate)]),
    table("lureRates","Top 5 lures by rate",["Lure","Fish / line-hour","Timed catch","Line-hours"],byRate,
      row => [formatStat(row.rate),formatStat(row.timedFish),formatStat(row.hours)],
      "Uses catches attributed to timed setups.")
  ];
  for (const group of model.breakdowns) {
    const rows = group.rows.filter(row => !hideEmpty || row.fish > 0);
    if (group.byFish) {
      const lost = group.id === "lostSpecies";
      tables.push(table(group.id,group.label,[lost ? "Possible species" : "Species",lost ? "Lost" : "Landed","Trips","Share"],rows,
        row => [formatStat(row.fish),formatStat(row.trips),formatStat(pct(row.fish,lost ? model.totals.lost : model.totals.fish),"%")]));
    } else {
      tables.push(table(group.id,group.label,["Group","Landed","Trips","Fish / hr"],rows,
        row => [formatStat(row.fish),formatStat(row.trips),formatStat(row.rate)]));
    }
  }
  return hideEmpty ? tables.filter(item => item.rows.length) : tables;
}

export function buildStats(book, scope = {}, opts = {}, today = new Date()) {
  const { c, facts, seasonFacts, seasonLabels, overview } = scopedStats(book, scope, today, true);
  const methods = valueOf(scope.method) ? [scope.method] : usedStatsMethods(book.trips || []);
  const reports = catalog.filter(d => !d.modes || methods.some(m => supports(d,m)));
  const requestedReport = reports.find(x => x.id === opts.report);
  const defaultReport = reportForMethod(scope.method);
  const reportFactsFor = report => report.id === "season" ? seasonFacts : facts;
  const reportDimension = report => report.id === "season" ? { ...report, read: t => seasonLabels.get(t) } : report;
  const evaluate = (report, split = null, reportOptions = opts) => reportRows(reportFactsFor(report),reportDimension(report),split,c,reportOptions);
  const independentOptions = { ...opts, a:"", b:"", matched:false, minTrips:0, minHours:0 };
  const groupCounts = new Map(reports.map(report => [report, evaluate(report,null,independentOptions).rows.length]));
  const withData = reports.filter(report => groupCounts.get(report) > 0);
  const comparable = withData.filter(report => groupCounts.get(report) > 1);
  const d = requestedReport
    || comparable.find(report => report.id === defaultReport)
    || comparable[0]
    || withData.find(report => report.id === defaultReport)
    || withData[0]
    || reports[0];
  const compareOptions = reports.filter(report => report === requestedReport || withData.includes(report));
  const special = ["target","season","sizes","angler","probe"];
  const splitCandidates = special.includes(d.id) ? [] : reports.filter(report => report !== d && !special.includes(report.id)
    && !(d.kind === "window" && report.kind === "window")
    && (!d.modes || !report.modes || d.modes.some(method => report.modes.includes(method))));
  const splits = withData.includes(d) ? splitCandidates.filter(report => {
    const rows = evaluate(d,report,independentOptions).rows;
    return new Set(rows.map(row => row.secondary)).size > 1 || (report.id === opts.split && rows.length > 0);
  }) : [];
  const split = splits.find(report => report.id === opts.split) || null;
  // A multi-year custom range can overlap its own comparison period.
  const reportFacts = reportFactsFor(d);
  const report = evaluate(d,split,opts);
  if (d.id === "season") report.note = "Same calendar dates, one year apart. " + report.note;
  if (d.id === "lureColorFamily" || split?.id === "lureColorFamily") report.note += " Multicolor lures contribute to each family; shares are of category credits, not distinct fish.";
  if (valueOf(scope.species)) report.note += " Catch species filters outcomes, not trips or fishing hours; use Trip target to restrict effort.";
  const personal = valueOf(scope.person) || valueOf(scope.lure) || valueOf(scope.flasher);
  if (personal) report.note += " Summary hours are whole-trip hours, not individual angler or gear time.";
  return { ...overview, evidence: reportFacts.map(f => f.t), reports, compareOptions, splits, active: d,
    split: split?.id || "", chart: split || report.rows.length <= 1 ? "table" : d.chart, ...report };
}
export function formatStat(value, label = "") {
  if (!Number.isFinite(value)) return "—";
  const display = rounded(value);
  return `${display === "0" && value !== 0 ? (value > 0 ? "<0.01" : ">-0.01") : display}${label.includes("%") ? "%" : ""}`;
}

const pieMeasures = new Set(["fish","lost","strikes","hours","trips","timedTrips","timedFish","timedStrikes","kept","released","measured","weighed","readings"]);
const shareBase = {catchShare:"fish",strikeShare:"strikes",timeShare:"hours",timedCatchShare:"timedFish"};
const pieColors = ["#36a985","#5595da","#e4a84f","#b08cce","#db7772","#60bfc9","#8995a6"];
const pieColor = (index, count) => count <= pieColors.length ? pieColors[index] : `hsl(${Math.round(index * 360 / count)} 62% 58%)`;

function piePath(start,end) {
  if (start === 0 && end === 1) return "M50 2a48 48 0 1 1 0 96a48 48 0 1 1 0 -96Z";
  const point = turn => `${50+48*Math.sin(turn*2*Math.PI)} ${50-48*Math.cos(turn*2*Math.PI)}`;
  return `M50 50L${point(start)}A48 48 0 ${end-start > .5 ? 1 : 0} 1 ${point(end)}Z`;
}

export function piePlot(m) {
  const column = id => m.columns.find(c => c.id === id);
  const unavailable = (message,suggestion,suitable = false) => ({slices:[],caption:"",message,suggestion,suitable});
  if (m.active.id === "year") return unavailable("Year-over-year results are a trend over time.");
  if (m.overlappingGroups) return unavailable("The same record can appear in more than one group here. Use a bar chart or table to compare them.");
  if (!column(m.metric)) return unavailable("There are no compatible values for a pie chart in this comparison.");
  const id = shareBase[m.metric] || m.metric;
  const tripCount = id === "trips" || id === "timedTrips";
  const tripGroups = m.active.kind === "trip" && (!m.split || m.splits.find(d => d.id === m.split)?.kind === "trip");
  if (!pieMeasures.has(id) || (tripCount && !tripGroups) || (m.split && shareBase[m.metric])) {
    const suggested = shareBase[m.metric] || ({strikesPerHour:"strikes",landingPercentage:"strikes",medianWeight:"weighed",maxWeight:"weighed",medianLength:"measured",maxLength:"measured"})[m.metric];
    const suggestion = column(suggested) || column(m.active.kind === "profile" ? "readings" : m.active.id === "lostSpecies" ? "lost" : "fish");
    return unavailable(tripCount ? "One trip can count in several groups here. Trip counts are not slices of a single total."
      : m.split && shareBase[m.metric] ? "Each split has its own percentage total. Choose a count to see shares across all groups."
      : `${column(m.metric).label} does not add up across groups. Choose a count or fishing effort for a pie chart.`,suggestion);
  }
  const label = column(id).label;
  const groups = m.rows.filter(r => Number.isFinite(r.values[id]) && r.values[id] > 0).map(r => ({
    key:r.key,name:r.secondary ? `${r.name} · ${r.secondary}` : r.name,value:r.values[id],tripIds:r.tripIds
  })).sort((a,b) => b.value-a.value || a.name.localeCompare(b.name));
  if (!groups.length) return unavailable(`No positive values for ${label} in this comparison.`,undefined,true);
  const total = groups.reduce((n,r) => n+r.value,0);
  let cumulative = 0;
  const slices = groups.map((r,i) => {
    const start = cumulative / total, percent = r.value / total * 100;
    cumulative += r.value;
    return {...r,share:percent < .01 ? "<0.01%" : formatStat(percent,"%"),color:pieColor(i,groups.length),path:piePath(start,i === groups.length-1 ? 1 : cumulative/total)};
  });
  return {slices,caption:`${label}: ${formatStat(total)} total in these groups`,suitable:true};
}

const nonzero = value => Number.isFinite(value) && value !== 0;
export function comparisonRows(m, hideEmpty = false) {
  return hideEmpty ? m.rows.filter(r => nonzero(r.values[m.metric])) : m.rows;
}

/** A missing split cell is not a zero. Both layouts render these same evidence cells. */
export function comparisonGrid(m, a, b, hideEmpty = false) {
  const cell = (r, col, detail = "") => r ? { key: r.key, value: r.values[col.id], text: formatStat(r.values[col.id],col.label), detail } : null;
  const metric = m.columns.find(c => c.id === m.metric);
  if (!m.split) {
    if (!a || !b || a === b) return null;
    const byName = new Map(m.rows.map(r => [r.name,r]));
    const rows = [metric,...m.columns.filter(c => c !== metric)].map(col => ({label:col.label, cells:[a,b].map(k => cell(byName.get(k),col))}));
    return {heading:"Measure", columns:[a,b], available:rows.length, rows:hideEmpty ? rows.filter(r => r.cells.some(c => nonzero(c?.value))) : rows};
  }
  const visible = comparisonRows(m,hideEmpty), columns = options(visible.map(r => r.secondary)), names = [...new Set(visible.map(r => r.name))];
  // Hide empty axes, not individual cells: a recorded zero still has supporting trips.
  const byKey = new Map(m.rows.map(r => [r.key,r]));
  return { heading:m.active.label, columns, available:hideEmpty ? new Set(m.rows.map(r => r.name)).size : names.length, rows:names.map(label => ({ label, cells:columns.map(col => {
    const r = byKey.get(pairKey(label,col));
    return r ? cell(r, metric, `${r.values.trips} ${r.values.trips === 1 ? "trip" : "trips"}${r.values.hours === null ? "" : ` · ${rounded(r.values.hours)} h`}`) : null;
  }) })) };
}

export function nextTableSort(current, key) {
  const ascending = current?.key === key ? current.direction === "descending" : key === "group";
  return { key, direction: ascending ? "ascending" : "descending" };
}

const tableNames = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function orderedTableRows(rows, sort, read) {
  if (!sort) return rows;
  const missing = v => v == null || (typeof v === "number" && !Number.isFinite(v));
  return [...rows].sort((a,b) => {
    const x = read(a), y = read(b);
    if (missing(x) || missing(y)) return Number(missing(x)) - Number(missing(y));
    const delta = typeof x === "number" ? x - y : tableNames.compare(x,y);
    return sort.direction === "ascending" ? delta : -delta;
  });
}

/** Sort all filtered rows by their raw values before formatting the visible page. */
export function comparisonTable(m, a, b, requested, limit = Infinity, hideEmpty = false) {
  const grid = comparisonGrid(m,a,b,hideEmpty);
  const groups = grid ? [] : comparisonRows(m,hideEmpty);
  const fields = grid ? grid.columns.map(label => ({id:`group:${label}`,label}))
    : [m.columns.find(c => c.id === m.metric), ...m.columns.filter(c => c.id !== m.metric && (!hideEmpty || groups.some(r => nonzero(r.values[c.id])))), {id:"sample",label:"Sample"}];
  const columns = [{id:"group",label:grid?.heading ?? "Group"}, ...fields];
  const order = requested && columns.some(c => c.id === requested.key) ? requested : null;
  if (grid) {
    const index = fields.findIndex(c => c.id === order?.key);
    const rows = orderedTableRows(grid.rows,order,r => index < 0 ? r.label : r.cells[index]?.value);
    return {matrix:true,columns,sort:order,available:grid.available,total:rows.length,rows:rows.slice(0,limit).map(r => ({...r,key:r.label}))};
  }
  const sort = order ?? (m.active.chart === "line" ? {key:"group",direction:"ascending"} : {key:m.metric,direction:"descending"});
  const rows = orderedTableRows(groups,order,r => sort.key === "group" ? r.name : r.values[sort.key === "sample" ? "trips" : sort.key]);
  return {matrix:false,columns,sort,available:m.rows.length,total:rows.length,rows:rows.slice(0,limit).map(r => ({
    key:r.key,label:r.name,cells:fields.map(c => ({text:c.id === "sample"
      ? `${r.values.trips} ${r.values.trips === 1 ? "trip" : "trips"}` : formatStat(r.values[c.id],c.label)}))
  }))};
}

export function comparisonCount(m, visible, table) {
  if (!m.rows.length) return "0 groups";
  const count = table?.total ?? visible.length, available = table?.available ?? m.rows.length;
  const unit = table?.matrix && !m.split ? "measure" : "group";
  return `${count === available ? count : `${count} of ${available}`} ${unit}${available === 1 ? "" : "s"}`;
}

export function trendPlot(rows, metric, reportId, hideEmpty = false) {
  const index = name => {
    if (reportId === "month") { const [y,m] = name.split("-").map(Number); return y * 12 + m - 1; }
    return parseFloat(name);
  };
  const samples = rows.map(r => ({name:r.name, key:r.key, x:index(r.name), value:hideEmpty && !nonzero(r.values[metric]) ? null : r.values[metric]})).filter(p => Number.isFinite(p.x));
  const valid = samples.filter(p => p.value !== null);
  if (!valid.length) return null;
  const left = samples[0].x, right = samples.at(-1).x;
  const lo = Math.min(0,...valid.map(p => p.value)), hi = Math.max(0,...valid.map(p => p.value));
  const points = [], segments = [];
  let segment = [], prior = null;
  for (const s of samples) {
    if (s.value === null || (reportId !== "probe" && prior !== null && s.x - prior > 1)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    prior = s.x;
    if (s.value === null) continue;
    const p = { ...s, x: right === left ? 0.5 : (s.x-left)/(right-left), y: hi === lo ? 0.5 : (hi-s.value)/(hi-lo) };
    points.push(p); segment.push(p);
  }
  if (segment.length) segments.push(segment);
  return { points, segments, lo, hi, first: samples[0].name, last: samples.at(-1).name };
}
export function overviewStats(model, hideEmpty = false) {
  const v = model.totals, best = model.trips.find(t => t.id === model.bestTripId);
  const stats = [
    ["Trips", v.trips, "Completed trips"], ["Fishing hours", v.hours, `${v.timedTrips} timed ${v.timedTrips === 1 ? "trip" : "trips"}`],
    ["Landed fish", v.fish, `${v.released} released · ${v.kept} kept`], ["Lost fish", v.lost, `${v.strikes} logged ${v.strikes === 1 ? "strike" : "strikes"}`],
    ["Fish / hour", v.fishPerHour, `${formatStat(v.fishPerTrip)} fish / trip`],
    ["Landing rate", v.landingPercentage, "Landed / logged strikes", "%"], ["Skunk rate", v.skunk, "Trips with no landed fish", "%"],
    ["Best trip", model.bestFish, best?.date || "No trips in scope"]
  ].filter(([,value]) => !hideEmpty || nonzero(value)).map(([label,value,detail,unit]) => ({ label, value: formatStat(value,unit), detail }));
  const sizeValue = (value, unit) => value == null ? "—" : `${formatStat(value)} ${unit}`;
  const sizeRange = (min, max, unit) => min == null || max == null ? "—" : `${formatStat(min)}–${formatStat(max)} ${unit}`;
  if (v.measured > 0) stats.push(
    { label: "Length measurements", value: formatStat(v.measured), detail: "Landed catch rows with a recorded length" },
    { label: "Average length", value: sizeValue(v.meanLength, model.units.fishLength), detail: "Mean of recorded lengths" },
    { label: "Median length", value: sizeValue(v.medianLength, model.units.fishLength), detail: "Middle recorded length" },
    { label: "Length range", value: sizeRange(v.minLength, v.maxLength, model.units.fishLength), detail: "Shortest to longest recorded" }
  );
  if (v.weighed > 0) stats.push(
    { label: "Weight measurements", value: formatStat(v.weighed), detail: "Landed catch rows with a recorded weight" },
    { label: "Average weight", value: sizeValue(v.meanWeight, model.units.fishWeight), detail: "Mean of recorded weights" },
    { label: "Median weight", value: sizeValue(v.medianWeight, model.units.fishWeight), detail: "Middle recorded weight" },
    { label: "Weight range", value: sizeRange(v.minWeight, v.maxWeight, model.units.fishWeight), detail: "Lightest to heaviest recorded" }
  );
  return stats;
}

export function basicOverviewStats(model, hideEmpty = false) {
  const v = model.totals;
  return [
    ["Trips", v.trips, "Completed trips"], ["Days fished", model.daysFished, ""],
    ["Fishing hours", v.hours, `${v.timedTrips} timed ${v.timedTrips === 1 ? "trip" : "trips"}`],
    ["Landed fish", v.fish, ""], ["Lost fish", v.lost, ""], ["Released", v.released, ""], ["Kept", v.kept, ""],
    ["Fish / trip", v.fishPerTrip, ""], ["Fish / hour", v.fishPerHour, ""],
    ["Landing rate", v.landingPercentage, "Landed / logged strikes", "%"],
    ["Skunk rate", v.skunk, "Trips with no landed fish", "%"]
  ].filter(([, value]) => !hideEmpty || nonzero(value))
    .map(([label, value, detail, unit]) => ({ label, value: formatStat(value, unit), detail }));
}
