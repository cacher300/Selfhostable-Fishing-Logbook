import { numericValue } from "./duration";

export type MeasurementKind = "depth" | "distance" | "speed" | "windSpeed" | "pressure" | "airTemperature" | "waterTemperature" | "precipitation" | "waveHeight" | "fishLength" | "fishWeight";
export type UnitSettings = Partial<Record<MeasurementKind, string>>;

const BASE_UNITS: Record<MeasurementKind, string> = { depth: "ft", distance: "km", speed: "mph", windSpeed: "mph", pressure: "hPa", airTemperature: "C", waterTemperature: "F", precipitation: "mm", waveHeight: "ft", fishLength: "in", fishWeight: "lb" };
const FACTORS: Record<string, number> = { ft: 0.3048, m: 1, mi: 1.609344, km: 1, mph: 1.609344, kph: 1, kn: 1.852, in: 2.54, cm: 1, lb: 0.45359237, kg: 1, mm: 1 };

export function preferredUnit(kind: MeasurementKind, settings?: UnitSettings): string {
  return settings?.[kind] || BASE_UNITS[kind];
}

export function convertUnit(value: unknown, from: string, to: string): number | null {
  const number = numericValue(value, NaN);
  if (!Number.isFinite(number)) return null;
  if (from === to) return number;
  if (from === "C" && to === "F") return number * 9 / 5 + 32;
  if (from === "F" && to === "C") return (number - 32) * 5 / 9;
  if (from === "hPa" && to === "kPa") return number / 10;
  if (from === "kPa" && to === "hPa") return number * 10;
  if (from === "hPa" && to === "inHg") return number * 0.0295299830714;
  if (from === "inHg" && to === "hPa") return number / 0.0295299830714;
  if (from === "hPa" && to === "mmHg") return number * 0.750061683;
  if (from === "mmHg" && to === "hPa") return number / 0.750061683;
  const source = FACTORS[from], target = FACTORS[to];
  return source && target ? number * source / target : null;
}

export function chopLabel(feet: unknown, ranges: Array<{ id?: string; label?: string; maxFeet?: number | null }> = []): string {
  const value = numericValue(feet, NaN);
  if (!Number.isFinite(value)) return "";
  const ordered = [...ranges].sort((a, b) => (a.maxFeet ?? Infinity) - (b.maxFeet ?? Infinity));
  return ordered.find(range => range.maxFeet === null || range.maxFeet === undefined || value <= range.maxFeet)?.label || "";
}
