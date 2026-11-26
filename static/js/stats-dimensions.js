import { convertUnitValue } from "./measurement-conversion.js";

export const text = value => String(value ?? "").trim();
export const numeric = value => text(value) !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
export const rounded = value => String(Math.round(value * 100) / 100);
export const clock = value => {
  const m = text(value).match(/(?:^|T)(\d{1,2}):(\d{2})(?:$|:|\s|Z|[+-])/);
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
};
export const ratio = (a, b) => b > 0 ? a / b : null;
const defaultUnits = { depth: "ft", fishLength: "in", fishWeight: "lb", waterTemperature: "F", airTemperature: "C", speed: "mph", windSpeed: "kph", pressure: "hPa", waveHeight: "ft" };
const allowed = { depth: ["ft", "m"], fishLength: ["in", "cm", "m", "ft"], fishWeight: ["lb", "kg"], waterTemperature: ["F", "C"], speed: ["mph", "kph", "kn"], waveHeight: ["ft", "m"] };
const aliases = { feet: "ft", foot: "ft", inches: "in", inch: "in", lbs: "lb", pounds: "lb", knots: "kn", knot: "kn", kts: "kn", "km/h": "kph", kmh: "kph", c: "C", f: "F" };
export function measurement(raw, key, units, from) {
  const m = text(raw).match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*°?([a-z/]*)$/i);
  if (!m) return null;
  const target = units[key], suffix = m[2].toLowerCase(), source = suffix ? aliases[suffix] || suffix : from || target;
  if (!allowed[key]?.includes(source) || (!key.includes("Temperature") && +m[1] < 0)) return null;
  if (key === "speed") {
    const mph = convertUnitValue(m[1], source, "mph");
    if (mph < 0.1 || mph > 15) return null;
  }
  return convertUnitValue(m[1], source, target);
}
function band(value, step, unit) {
  if (value === null) return "";
  const start = Math.floor(value / step) * step;
  return `${rounded(start)}–${rounded(start + step)} ${unit}`;
}
const both = (a, b, join = " + ") => a && b ? `${a}${join}${b}` : "";
export const ratingName = value => ["", "Bad", "Mediocre", "Good", "Outstanding"][Number(value)] || "";
export const contextFor = book => {
  const byId = items => new Map((items || []).map(item => [item.id, item]));
  const maps = Object.fromEntries(["lures", "flashers", "expeditions", "spots", "drifts", "people", "rods", "reels", "rodReelCombos", "locations"].map(key => [key, byId(book[key])]));
  const equipment = item => [item?.brand,item?.name].filter(Boolean).join(" ") || item?.shortName || "";
  const label = (key,id) => {
    const item = maps[key]?.get(id);
    if (!item) return "";
    if (key === "rods") return equipment(item);
    if (key === "rodReelCombos") {
      const reel = maps.reels.get(item.reelId);
      return item.shortName || [equipment(maps.rods.get(item.rodId)), reel?.shortName || equipment(reel)].filter(Boolean).join(" + ");
    }
    return item.name || "";
  };
  return { maps, units: { ...defaultUnits, ...book.settings?.units }, label };
};
export const waterbody = (t, c) => text(t.location) || c.label("locations", t.locationId);
export const launch = (t, c) => text(t.launch) || c.maps.locations.get(t.locationId)?.launches?.find(l => l.id === t.launchId)?.name || "";
export const person = (t, id, c) => (t.people || []).find(p => p.id === id)?.name || c.label("people", id);
const gear = (r, c) => c.maps.lures.get(r.lureId) || {};
const paddle = (r, c) => c.maps.flashers.get(r.flasherId) || {};
const wc = (t, k) => numeric(t.weatherData?.tripWindow?.[k]);
const weatherBand = (t, c, key, pref, from, step) => {
  const v = wc(t, key);
  return v === null ? "" : band(convertUnitValue(v, from, c.units[pref]), step, c.units[pref]);
};
const tempBand = (v, c) => band(measurement(v, "waterTemperature", c.units), c.units.waterTemperature === "C" ? 2 : 5, `°${c.units.waterTemperature}`);
const depth = (r, c) => {
  const values = r.setupLineTarget === "cheater" ? [r.cheaterDepth, r.depthDown, r.estimatedLureDepth, r.estimatedDepth] : [r.depthDown, r.estimatedLureDepth, r.estimatedDepth, r.ballDepth];
  return values.map(v => measurement(v, "depth", c.units)).find(v => v !== null) ?? null;
};
const fow = (r, c) => measurement(r.fowCaught, "depth", c.units) ?? measurement(r.waterDepth, "depth", c.units);
const depthBand = (v, c) => band(v, c.units.depth === "m" ? 3 : 10, c.units.depth);
const speedBand = (r, c, k) => band(measurement(r[k], "speed", c.units), 0.5, c.units.speed);
export function sunWindow(t, minutes, lunar = false) {
  if (minutes === null) return "";
  const sun = t.weatherData?.sunMoon;
  const keys = lunar ? ["moonrise", "moonset"] : ["sunrise", "sunset"];
  const [rise, set] = keys.map(key => clock(sun?.[key]));
  if (rise === null && set === null) return "";
  const near = v => v !== null && Math.abs(((minutes - v + 2160) % 1440) - 720) <= (lunar ? 90 : 60);
  if (near(rise)) return lunar ? "Moonrise" : "Around sunrise";
  if (near(set)) return lunar ? "Moonset" : "Around sunset";
  if (rise === null || set === null) return "";
  return lunar ? "Outside moon windows" : minutes >= rise && minutes < set ? "Daylight" : "Night";
}
// Split clock effort at actual minute boundaries, not once per minute per rod.
export function windowEdges(id, trip) {
  if (id === "hour") return Array.from({length:24}, (_, i) => (i + 1) * 60);
  if (id === "timeOfDay") return [5*60,10*60,14*60,18*60,21*60,1440];
  const lunar = id === "moonWindow", radius = lunar ? 90 : 60, edges = new Set([1440]);
  for (const key of lunar ? ["moonrise","moonset"] : ["sunrise","sunset"]) {
    const minute = clock(trip.weatherData?.sunMoon?.[key]);
    if (minute === null) continue;
    for (const edge of [minute-radius,minute,minute+radius+1]) edges.add((edge + 1440) % 1440);
  }
  return [...edges].sort((a,b) => a-b);
}
function thermocline(t, r, c) {
  const readings = (t.probeTemperatureProfile || []).map(p => [numeric(p.depthFeet), measurement(p.temperature, "waterTemperature", c.units)]).filter(([d, v]) => d !== null && v !== null).sort((a, b) => a[0] - b[0]);
  let gradient = 0, middle = null;
  for (let i = 1; i < readings.length; ++i) {
    const [d, v] = readings[i], [prev, p] = readings[i - 1];
    if (d > prev && (p - v) / (d - prev) > gradient) { gradient = (p - v) / (d - prev); middle = (prev + d) / 2; }
  }
  const down = depth(r, c);
  if (middle === null || down === null) return "";
  const feet = convertUnitValue(down, c.units.depth, "ft");
  return feet < middle - 10 ? "Above" : feet > middle + 10 ? "Below" : `Within ${rounded(convertUnitValue(10,"ft",c.units.depth))} ${c.units.depth}`;
}
const FRONT = { "pre-front": "Pre-front", "during-front": "During front", "post-front": "Post-front", "no-front": "No front" };
const COLORS = [
  ["Chartreuse", /chartreuse|\bchart\b|fire ?tiger/i], ["Green", /green|lime|olive|\bmoss|fire ?tiger/i],
  ["Blue", /blue|navy|cobalt/i], ["Purple", /purple|violet|grape|plum|\bkiwi\b/i], ["Pink", /pink|magenta|bubble ?gum|salmon/i],
  ["Orange", /orange|fire ?tiger|tangerine/i], ["Red", /\bred\b|crimson|blood/i], ["Yellow", /yellow|lemon/i], ["White", /white|pearl|\bbone\b/i],
  ["Black", /black/i], ["Silver", /silver|chrome|nickel|mirror/i], ["Gold", /gold|brass/i], ["Copper", /copper/i],
  ["Brown", /brown|\btan\b|bronze|pumpkin|rootbeer|root beer/i], ["Gray", /gr[ae]y|smoke/i], ["Glow", /glow|lumi/i], ["UV", /\buv\b/i]
];
export function colorFamilies(color, { glow = false } = {}) {
  const names = COLORS.filter(([, re]) => re.test(color || "")).map(([name]) => name);
  if (glow && !names.includes("Glow")) names.push("Glow");
  return names.length ? names : text(color) ? ["Other"] : [];
}
const catalog = [];
function add(group, kind, specs, modes) {
  for (const [id, label, read, chart = "bar"] of specs) catalog.push({ id, label, group, kind, read, chart, modes });
}
const trolling = ["Trolling"], depthMethods = ["Trolling", "Jigging", "Drifting", "Ice Fishing", "Casting", "Bait Fishing", "Shore Fishing", "Fly Fishing"];
add("Gear & rigs", "line", [
  ["lure", "Lure head-to-head", (t, r, c) => gear(r, c).name],
  ["lureColor", "Lure color", (t, r, c) => gear(r, c).color],
  ["lureColorFamily", "Color family", (t, r, c) => colorFamilies(gear(r, c).color, gear(r, c))],
  ["lureType", "Lure type", (t, r, c) => gear(r, c).type],
  ["lureSize", "Lure size", (t, r, c) => { const l = gear(r, c); return both(l.spoonSize || l.beadSize || l.weight, l.type || "lure", " "); }],
  ["lureWeight", "Lure weight", (t, r, c) => gear(r, c).weight],
  ["lureGlow", "Glow vs. non-glow", (t, r, c) => { const l = gear(r, c); return !l.id ? "" : l.glow || /glow|lumi/i.test(l.color) ? "Glow" : "Non-glow"; }],
  ["lureBrand", "Brand", (t, r, c) => gear(r, c).brand], ["bladeType", "Blade type", (t, r, c) => gear(r, c).bladeType],
  ["rigging", "Rigging", (t, r) => r.rigging], ["rod", "Rod / combo", (t, r, c) => c.label("rodReelCombos", r.comboId) || c.label("rods", r.rodId)]
]);
add("Fish & size", "fish", [
  ["species", "Confirmed species", (t, r) => r.lost ? "" : r.species || "Unidentified"],
  ["lostSpecies", "Possible species of lost fish", (t, r) => r.lost ? r.possibleSpecies || "Unidentified" : ""],
  ["outcome", "Kept, released and lost", (t, r) => r.lost ? "Lost" : r.released ? "Released" : "Kept"],
  ["sizes", "Size by species", (t, r) => !r.lost && r.species, "table"],
  ["catchTarget", "Target vs. incidental catch", (t, r) => !r.lost && t.targetSpecies && t.targetSpecies !== "Anything" && r.species ? r.species === t.targetSpecies ? "Target" : "Incidental" : ""]
]);
add("Fish & size", "trip", [["target", "Target success", t => t.targetSpecies && t.targetSpecies !== "Anything" ? t.targetSpecies : "", "table"]]);
add("Water & people", "trip", [
  ["location", "Waterbody", (t, r, c) => waterbody(t, c)], ["launch", "Launch", (t, r, c) => launch(t, c)],
  ["method", "Fishing method", t => t.method], ["expedition", "Expedition", (t, r, c) => c.label("expeditions", t.expeditionId)],
  ["intent", "Trip intent", t => t.intent], ["rating", "Trip rating", t => ratingName(t.tripRating)], ["tripStructure", "Trip structure", t => t.structureType],
  ["tripFow", "Water depth range fished", t => t.structure]
]);
add("Water & people", "fish", [["spot", "Named spot", (t, r, c) => c.label("spots", r.spotId)], ["angler", "Angler on shared trips", (t, r, c) => person(t, r.personId, c), "table"], ["structure", "Structure at the bite", (t, r) => r.structureType]]);
add("Timing", "window", [
  ["hour", "Bites by hour", (t, r) => r.minute === null ? "" : `${String(Math.floor(r.minute / 60)).padStart(2, "0")}:00`, "line"],
  ["timeOfDay", "Time of day", (t, r) => { const h = r.minute === null ? null : r.minute / 60; return h === null ? "" : h < 5 || h >= 21 ? "Night" : h < 10 ? "Morning" : h < 14 ? "Midday" : h < 18 ? "Afternoon" : "Evening"; }],
  ["sunWindow", "Sunrise & sunset", (t, r) => sunWindow(t, r.minute)],
  ["moonWindow", "Moonrise & moonset", (t, r) => sunWindow(t, r.minute, true)]
]);
add("Timing", "trip", [
  ["month", "Month by month", t => /^\d{4}-\d{2}/.test(t.date) ? t.date.slice(0, 7) : "", "line"],
  ["season", "Season vs. last season", t => text(t.date).slice(0, 4), "table"]
]);
add("Conditions", "trip", [
  ["waterClarity", "Water clarity", t => t.waterClarity], ["waterTemp", "Surface temperature", (t, r, c) => tempBand(t.waterTemp, c)],
  ["waveChop", "Wave / chop", t => t.waveChop], ["weather", "Weather tag", t => t.weather],
  ["weatherFront", "Weather front", t => FRONT[t.weatherData?.frontAssessment?.value ?? (t.weatherFrontSource === "automatic" && t.weatherFront)] || "Unclassified"],
  ["frontTag", "Weather pattern tag", t => t.weatherData?.frontTag], ["pressureTrend", "Pressure trend", t => t.weatherData?.trend?.pressureTrend || t.weatherData?.tripWindow?.pressureTrendRateLabel],
  ["windDirection", "Wind direction", t => { const d = wc(t, "windDirectionDegrees"); return d === null ? t.wind : ["N","NE","E","SE","S","SW","W","NW"][Math.round(((d % 360 + 360) % 360) / 45) % 8]; }],
  ["windSpeed", "Wind speed", (t, r, c) => weatherBand(t, c, "windSpeedMph", "windSpeed", "mph", 5)],
  ["pressure", "Barometric pressure", (t, r, c) => weatherBand(t, c, "pressureHpa", "pressure", "hPa", c.units.pressure === "inHg" ? 0.1 : c.units.pressure === "kPa" ? 1 : 10)],
  ["airTemp", "Air temperature", (t, r, c) => weatherBand(t, c, "temperatureC", "airTemperature", "C", 5)],
  ["cloudCover", "Cloud cover", t => { const n = wc(t, "cloudCoverPercent"); return n === null ? "" : n < 25 ? "Clear" : n < 60 ? "Broken cloud" : n < 90 ? "Cloudy" : "Overcast"; }],
  ["sunshine", "Sunshine", t => { const s = numeric(t.weatherData?.daily?.sunshineDurationSeconds); return s === null ? "" : s < 7200 ? "Under 2 h" : s < 21600 ? "2–6 h" : "6 h or more"; }],
  ["moonPhase", "Moon phase", t => t.weatherData?.sunMoon?.phase]
]);
add("Conditions", "fish", [
  ["biteWeather", "Weather at the bite", (t,r,c) => {
    const w = r.weatherData?.hourly;
    if (!w || Array.isArray(w)) return "";
    const wind = numeric(w.windDirectionDegrees), pressure = numeric(w.pressureHpa), clouds = numeric(w.cloudCoverPercent);
    return [wind === null ? "" : `${["N","NE","E","SE","S","SW","W","NW"][Math.round(((wind % 360 + 360) % 360) / 45) % 8]} wind`,
      pressure === null ? "" : `${rounded(convertUnitValue(pressure,"hPa",c.units.pressure))} ${c.units.pressure}`,
      clouds === null ? "" : `${rounded(clouds)}% cloud`].filter(Boolean).join(" · ");
  },"table"]
]);
add("Trolling spread", "line", [
  ["presentation", "Boards, divers & riggers", (t, r) => r.presentation],
  ["lineSide", "Port, center & starboard", (t, r) => r.side], ["lineTarget", "Main vs. cheater", (t, r) => ({main:"Main",cheater:"Cheater"})[r.setupLineTarget]],
  ["flasher", "Flasher", (t, r, c) => paddle(r, c).name], ["flasherColor", "Flasher color", (t, r, c) => paddle(r, c).color],
  ["flasherType", "Flasher type", (t, r, c) => paddle(r, c).type],
  ["lureFlasher", "Lure + flasher", (t, r, c) => both(gear(r, c).name, paddle(r, c).name)],
  ["lureFlasherColor", "Lure + flasher color", (t, r, c) => both(gear(r, c).color, paddle(r, c).color)],
  ["dipseyColor", "Dipsey diver color", (t, r) => r.dipseyDiverColor],
  ["distanceBehind", "Distance behind", (t, r, c) => depthBand(measurement(r.distanceBehind, "depth", c.units), c)],
  ["attachedWeight", "Attached weight", (t, r) => numeric(r.attachedWeightOz) !== null ? `${r.attachedWeightOz} oz` : ""]
], trolling);
add("At the bite", "fish", [
  ["waterColumn", "Depth down over water depth", (t, r, c) => both(depthBand(depth(r, c), c), depthBand(fow(r, c), c), " down over "), "table"],
  ["depthDown", "Fishing depth", (t, r, c) => depthBand(depth(r, c), c)],
  ["fow", "Total water depth", (t, r, c) => depthBand(fow(r, c), c)],
  ["exactFow", "Exact water depth", (t, r, c) => { const v = fow(r, c); return v === null ? "" : `${rounded(v)} ${c.units.depth}`; }]
], depthMethods);
add("At the bite", "fish", [
  ["gpsSpeed", "GPS speed", (t, r, c) => speedBand(r, c, "gpsSpeed")],
  ["ballSpeed", "Speed at the ball", (t, r, c) => speedBand(r, c, "ballSpeed")],
  ["ballTemp", "Temperature at the ball", (t, r, c) => tempBand(r.ballTemp, c)],
  ["direction", "Trolling direction", (t, r) => r.direction],
  ["directionSpeed", "GPS speed by direction", (t, r, c) => { const v = measurement(r.gpsSpeed, "speed", c.units); return both(r.direction, v === null ? "" : `${rounded(v)} ${c.units.speed}`, " · "); }],
  ["speedDelta", "Ball vs. GPS speed", (t, r, c) => { const a = measurement(r.ballSpeed, "speed", c.units), b = measurement(r.gpsSpeed, "speed", c.units); if (a === null || b === null) return ""; const d = convertUnitValue(a - b, c.units.speed, "mph"); return Math.abs(d) <= 0.2 ? "Matched" : d < 0 ? "Ball slower" : "Ball faster"; }],
  ["dipseySetting", "Dipsey setting", (t, r) => r.dipseySetting],
  ["deepestRigger", "Deepest rigger", (t, r) => /^downrigger$/i.test(r.presentation) && r.setupLineTarget !== "cheater" ? r.deepestRigger ? "Marked deepest" : "Other main rigger" : ""],
  ["shaker", "Shaker share", (t, r) => !r.lost ? r.shaker ? "Shaker" : "Not marked shaker" : ""]
], trolling);
add("At the bite", "fish", [["thermocline", "Position vs. estimated thermocline", thermocline]], ["Trolling", "Jigging"]);
add("At the bite", "profile", [["probe", "Probe temperature profile", (t, r) => r.label, "line"]], ["Trolling", "Jigging"]);
add("Technique", "fish", [["drift", "Named drift", (t, r, c) => c.label("drifts", r.driftId)]], ["Drifting"]);
add("Technique", "line", [["beadRig", "Bead rig", (t, r, c) => { const n = Number(r.beadCount) || (gear(r, c).type === "Bead" ? 1 : 0); return n ? [c.label("lures", r.lureId), c.label("lures", r.secondBeadLureId), c.label("lures", r.thirdBeadLureId)].slice(0, n).map(x => x || "?").join(" + ") : ""; }]], ["Drifting","Casting","Fly Fishing","Bait Fishing","Shore Fishing","Ice Fishing","Jigging"]);
add("Technique", "fish", [["retrieve", "Retrieve at the bite", (t, r) => r.retrieve]], ["Casting"]);
add("Technique", "fish", [["flyPresentation", "Fly presentation", (t, r) => r.flyPresentation]], ["Fly Fishing"]);
add("Technique", "trip", [["flyHatch", "Hatch / food activity", t => t.flyHatch], ["waterLevel", "Water level", t => t.waterLevel]], ["Fly Fishing"]);

export { catalog };
