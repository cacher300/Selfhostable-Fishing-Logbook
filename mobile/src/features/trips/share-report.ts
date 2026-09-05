import { tripDurationHours } from "../../domain/logbook";
import { firstNumber } from "../../domain/services/duration";
import { gearName, resolveCatch } from "../../domain/services/setup-resolution";
import type { Catch, FishEvent, Logbook, LostFish, MediaRef, Trip } from "../../domain/types";

export type ShareMode = "image" | "text";
export type ShareTheme = "deep-water" | "clean-light";

export type ImageOption =
  | "landed" | "missed" | "biggest" | "rate" | "hours" | "fow"
  | "notes" | "conditions" | "highlights" | "timeline" | "includeMisses"
  | "bestLure" | "bestFlasher";

export type TextOption =
  | "notes" | "conditions" | "highlights" | "timeline" | "includeMisses"
  | "number" | "time" | "result" | "species" | "size" | "waterDepth"
  | "method" | "depth" | "speed" | "lure" | "flasher" | "catchNotes";

export type SharePalette = { accent: string; background: string; text: string; card: string };
export type SharePreset = SharePalette & { id: string; name: string; theme: ShareTheme };
export type ShareEvent = (Catch | LostFish) & { eventType: string; landed: boolean; number: number };

export const DEFAULT_IMAGE_OPTIONS: Record<ImageOption, boolean> = {
  landed: true, missed: true, biggest: true, rate: true, hours: true, fow: true,
  notes: true, conditions: true, highlights: true, timeline: true, includeMisses: true,
  bestLure: true, bestFlasher: true,
};

export const DEFAULT_TEXT_OPTIONS: Record<TextOption, boolean> = {
  notes: true, conditions: true, highlights: true, timeline: true, includeMisses: true,
  number: true, time: true, result: true, species: true, size: true, waterDepth: true,
  method: true, depth: true, speed: true, lure: true, flasher: true, catchNotes: true,
};

export const palettes: Record<ShareTheme, SharePalette> = {
  "deep-water": { accent: "#42c98a", background: "#131b24", text: "#edf3f8", card: "#141f29" },
  "clean-light": { accent: "#23855c", background: "#f8fafb", text: "#17212b", card: "#ffffff" },
};

export function sharePresets(logbook: Logbook): SharePreset[] {
  const raw = (logbook.settings as Record<string, unknown>).shareAppearancePresets;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const id = String(item.id || "").trim(), name = String(item.name || "").trim();
    if (!id || !name) return [];
    return [{
      id, name,
      theme: item.theme === "clean-light" ? "clean-light" as const : "deep-water" as const,
      accent: validColor(item.accent, "#42c98a"),
      background: validColor(item.background, "#131b24"),
      text: validColor(item.textColor ?? item.text, "#edf3f8"),
      card: validColor(item.cardBackground ?? item.card, "#141f29"),
    }];
  });
}

export function validColor(value: unknown, fallback: string): string {
  const color = String(value || "");
  return /^#[\da-f]{6}$/i.test(color) ? color : fallback;
}

export function launchName(trip: Trip): string { return titleCase(trip.launch || "Launch not logged"); }
export function defaultHeadline(trip: Trip): string { return `${launchName(trip)} fishing report`; }
export function titleCase(value: unknown): string {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function sentence(value: unknown): string {
  const text = String(value || "").trim();
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
}
export function compact(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
export function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
export function formatTime(value: unknown, logbook: Logbook): string {
  const raw = String(value || "").slice(0, 5);
  if (!raw || logbook.settings.timeFormat === "24") return raw;
  const [h, m] = raw.split(":").map(Number);
  if (!Number.isFinite(h)) return raw;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
export function measurement(value: unknown, kind: keyof NonNullable<Logbook["settings"]["units"]>, logbook: Logbook): string {
  if (value === undefined || value === null || value === "") return "";
  return `${value} ${logbook.settings.units?.[kind] || ""}`.trim();
}

export function photoOptions(trip: Trip): Array<{ label: string; media: MediaRef; kind: "trip" | "catch"; fishIndex?: number; weight: number; length: number }> {
  const tripPhotos = (trip.notePhotos || []).filter((photo) => photo.mediaType === "image" && photo.uri).map((media, index) => ({
    label: media.caption?.trim() || `Trip photo ${index + 1}`, media, kind: "trip" as const, weight: 0, length: 0,
  }));
  const catchPhotos = trip.catches.flatMap((fish, fishIndex) => (fish.photos || []).filter((photo) => photo.mediaType === "image" && photo.uri).map((media, index) => ({
    label: media.caption?.trim() || `${fish.species || "Catch"} ${fishIndex + 1} photo ${index + 1}`,
    media, kind: "catch" as const, fishIndex, weight: firstNumber(fish.weight) || 0, length: firstNumber(fish.length) || 0,
  })));
  return [...catchPhotos, ...tripPhotos];
}

export function defaultPhotoId(trip: Trip): string | null {
  const photos = photoOptions(trip);
  const catchPhotos = photos.filter((item) => item.kind === "catch").sort((a, b) => b.weight - a.weight || b.length - a.length || (a.fishIndex || 0) - (b.fishIndex || 0));
  return (catchPhotos[0] || photos[0])?.media.id || null;
}

export function eventRecords(trip: Trip, includeMisses = true): ShareEvent[] {
  const landed = trip.catches.map((item, index) => ({ ...item, eventType: item.released ? "Released" : "Landed", landed: true, number: index + 1 }));
  const missed = includeMisses ? trip.lostFish.map((item, index) => ({ ...item, eventType: /\blost\b/i.test(item.notes || "") ? "Lost" : "Missed", landed: false, number: landed.length + index + 1 })) : [];
  return [...landed, ...missed].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")) || a.number - b.number);
}

export function metrics(trip: Trip) {
  const landed = trip.catches.length, missed = trip.lostFish.length, hours = Number(tripDurationHours(trip)) || 0;
  return { landed, missed, encounters: landed + missed, hours };
}

export function biggestFish(trip: Trip): Catch | null {
  const weighted = trip.catches.filter((fish) => (firstNumber(fish.weight) || 0) > 0);
  const candidates = weighted.length ? weighted : trip.catches.filter((fish) => (firstNumber(fish.length) || 0) > 0);
  return [...candidates].sort((a, b) => weighted.length ? (firstNumber(b.weight) || 0) - (firstNumber(a.weight) || 0) : (firstNumber(b.length) || 0) - (firstNumber(a.length) || 0))[0] || null;
}

export function fishSize(fish: Partial<Catch>, logbook: Logbook): string {
  return [measurement(fish.weight, "fishWeight", logbook), measurement(fish.length, "fishLength", logbook)].filter(Boolean).join(" · ");
}

export function waterDepthRange(trip: Trip): string {
  const depths = trip.catches.map((fish) => firstNumber(fish.fowCaught ?? fish.waterDepth)).filter((value): value is number => value !== null);
  return depths.length ? `${Math.round(Math.min(...depths))}–${Math.round(Math.max(...depths))}` : "Not logged";
}

export function lureFor(logbook: Logbook, trip: Trip, fish: FishEvent): string {
  const resolved = resolveCatch(trip, fish, !trip.catches.some((item) => item.id === fish.id));
  return gearName(logbook, "lure", resolved.lureId) || String((fish as Record<string, unknown>).lureName || (fish as Record<string, unknown>).lure || "").trim();
}
export function flasherFor(logbook: Logbook, trip: Trip, fish: FishEvent): string {
  const resolved = resolveCatch(trip, fish, !trip.catches.some((item) => item.id === fish.id));
  return gearName(logbook, "flasher", resolved.flasherId) || String((fish as Record<string, unknown>).flasherName || (fish as Record<string, unknown>).flasher || "").trim();
}

function tiedLeaders(values: string[]): string[] {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked.length ? ranked.filter(([, count]) => count === ranked[0][1]).map(([value]) => value) : [];
}
export function bestLures(logbook: Logbook, trip: Trip): string[] { return tiedLeaders(trip.catches.map((fish) => lureFor(logbook, trip, fish))); }
export function bestFlashers(logbook: Logbook, trip: Trip): string[] { return tiedLeaders(trip.catches.map((fish) => flasherFor(logbook, trip, fish))); }
export function bestMethods(trip: Trip): string[] { return tiedLeaders(trip.catches.map((fish) => fish.presentation || "")); }
export function speciesCounts(trip: Trip): Array<[string, number]> {
  const counts = new Map<string, number>();
  trip.catches.forEach((fish) => { const name = titleCase(fish.species || "Unspecified"); counts.set(name, (counts.get(name) || 0) + 1); });
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function conditionItems(logbook: Logbook, trip: Trip): Array<[string, string]> {
  const weather = (trip.weatherData?.tripWindow || {}) as Record<string, unknown>;
  return [
    ["Weather", trip.weather || ""], ["Wind", trip.wind || (weather.windSpeedMph != null ? `${Math.round(Number(weather.windSpeedMph))} mph` : "")],
    ["Water temp", measurement(trip.waterTemp, "waterTemperature", logbook)], ["Structure", trip.structureType || ""],
    ["Waves", measurement(trip.waveHeight, "waveHeight", logbook)], ["Air temp", weather.temperatureC != null ? `${Math.round(Number(weather.temperatureC))}°C` : ""],
    ["Clarity", trip.waterClarity || ""],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

export function depthText(fish: FishEvent, logbook: Logbook): string {
  const depth = fish.depthDown ?? fish.estimatedDepth;
  if (depth !== undefined && depth !== null && depth !== "") return `${measurement(depth, "depth", logbook)} down`;
  if (fish.lineOut !== undefined && fish.lineOut !== null && fish.lineOut !== "") return `${measurement(fish.lineOut, "depth", logbook)} back`;
  return fish.leadcoreColors ? `${fish.leadcoreColors} colors` : "";
}

function eventSentence(logbook: Logbook, trip: Trip, fish: ShareEvent, index: number, options: Record<TextOption, boolean>): string {
  const details: string[] = [];
  if (options.time && fish.time) details.push(formatTime(fish.time, logbook));
  if (options.waterDepth && (fish.fowCaught || fish.waterDepth)) details.push(`${measurement(Math.round(firstNumber(fish.fowCaught ?? fish.waterDepth) || 0), "depth", logbook)} water depth`);
  if (options.method && fish.presentation) details.push(titleCase(fish.presentation));
  if (options.depth && depthText(fish, logbook)) details.push(depthText(fish, logbook));
  if (options.speed && fish.speed) details.push(measurement(fish.speed, "speed", logbook));
  if (options.lure && lureFor(logbook, trip, fish)) details.push(lureFor(logbook, trip, fish));
  if (options.flasher && flasherFor(logbook, trip, fish)) details.push(flasherFor(logbook, trip, fish));
  const result: string[] = [];
  if (fish.landed) {
    if (options.species) result.push(fish.shaker ? "Shaker" : titleCase((fish as Catch).species || "Fish"));
    if (options.size && fishSize(fish as Catch, logbook)) result.push(fishSize(fish as Catch, logbook));
    if (options.result) result.push((fish as Catch).released ? "released" : "landed");
  } else {
    if (options.result) result.push(fish.eventType);
    if (options.species && (fish as LostFish).possibleSpecies) result.push(`possible ${titleCase((fish as LostFish).possibleSpecies)}`);
  }
  const number = options.number ? `Fish ${index + 1}` : "";
  const lead = number ? `${number}${details.length ? ` - ${details.join(", ")}.` : " -"}` : details.length ? `${details.join(", ")}.` : "";
  return [lead, result.length ? `${result.join(", ")}.` : "", options.catchNotes && fish.notes ? sentence(fish.notes) : ""].filter(Boolean).join(" ").replace(/\.\./g, ".");
}

export function textReport(logbook: Logbook, trip: Trip, headline: string, subtitle: string, options: Record<TextOption, boolean>): string {
  const stat = metrics(trip), location = [titleCase(trip.launch || "Launch not logged"), trip.location ? titleCase(trip.location) : ""].filter(Boolean).join(" · ");
  const linesSet = trip.linesSetTime || trip.startTime || trip.gearUsed.map((item) => item.startTime).filter(Boolean).sort()[0] || "";
  const linesPulled = trip.linesPulledTime || trip.endTime || "";
  const timing = [
    `Out of ${location}${trip.launchTime ? ` at ${formatTime(trip.launchTime, logbook)}` : ""}`,
    linesSet ? `lines set by ${formatTime(linesSet, logbook)}` : "",
    linesPulled ? `lines pulled at ${formatTime(linesPulled, logbook)}` : "",
  ].filter(Boolean).join(", ");
  const weather = (trip.weatherData?.tripWindow || {}) as Record<string, unknown>;
  const conditions = [trip.weather, weather.temperatureC != null ? `${Math.round(Number(weather.temperatureC))}°C air` : "", trip.wind || (weather.windSpeedMph != null ? `${Math.round(Number(weather.windSpeedMph))} mph wind` : ""), trip.waveHeight ? `Waves ${measurement(trip.waveHeight, "waveHeight", logbook)}` : "", trip.waterTemp ? `Water ${measurement(trip.waterTemp, "waterTemperature", logbook)}` : "", trip.structureType ? `Structure ${trip.structureType}` : "", trip.waterClarity ? `Clarity ${trip.waterClarity}` : ""].filter(Boolean).join(" · ");
  const highlights = [bestLures(logbook, trip).length ? `Best lure: ${bestLures(logbook, trip).join(" / ")}.` : "", bestMethods(trip).length ? `Best method: ${bestMethods(trip).join(" / ")}.` : ""].filter(Boolean).join(" ");
  const events = options.timeline ? eventRecords(trip, options.includeMisses).map((event, index) => eventSentence(logbook, trip, event, index, options)).filter(Boolean).join("\n\n") : "";
  return [
    [`${headline || defaultHeadline(trip)} - ${formatDate(trip.date)}.`, subtitle.trim()].filter(Boolean).join("\n"),
    timing ? `${timing.charAt(0).toUpperCase()}${timing.slice(1)}.` : "",
    `Finished ${stat.landed} for ${stat.encounters}${stat.hours ? ` over ${compact(stat.hours)} hours` : ""}.`,
    options.notes ? sentence(trip.notes) : "",
    options.conditions && conditions ? `Conditions: ${conditions}.` : "",
    options.highlights ? highlights : "",
    events,
  ].filter(Boolean).join("\n\n");
}
