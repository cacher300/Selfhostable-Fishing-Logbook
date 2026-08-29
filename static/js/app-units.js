function themePreference() {
  return state.settings?.theme === "dark" ? "dark" : "light";
}

function timeFormatPreference() {
  return state.settings?.timeFormat === "12" ? "12" : "24";
}

function normalizeUnits(units = {}) {
  const normalized = { ...defaultUnits };
  Object.keys(defaultUnits).forEach((key) => {
    const allowed = unitOptions[key]?.map((item) => item.value) || [];
    const value = units && typeof units === "object" ? units[key] : "";
    if (allowed.includes(value)) normalized[key] = value;
  });
  return normalized;
}

function unitPreference(key) {
  return normalizeUnits(state.settings?.units)[key] || defaultUnits[key] || "";
}

function unitSymbol(key) {
  const unit = unitPreference(key);
  if (unit === "C" || unit === "F") return `\u00b0${unit}`;
  return unit;
}

function convertUnitValue(value, fromUnit, toUnit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (fromUnit === toUnit) return number;
  if (fromUnit === "C" && toUnit === "F") return (number * 9 / 5) + 32;
  if (fromUnit === "F" && toUnit === "C") return (number - 32) * 5 / 9;
  const conversions = [
    { units: { kph: 1, mph: 1.609344, kn: 1.852 } },
    { units: { m: 1, ft: 0.3048, km: 1000, mi: 1609.344, in: 0.0254, mm: 0.001, cm: 0.01 } },
    { units: { kg: 1, lb: 0.45359237 } },
    { units: { hPa: 1, kPa: 10, inHg: 33.8638866667, mmHg: 1.33322387415 } }
  ];
  const conversion = conversions.find((item) => fromUnit in item.units && toUnit in item.units);
  if (conversion) return number * conversion.units[fromUnit] / conversion.units[toUnit];
  return number;
}

const measurementUnitAliases = {
  feet: "ft", foot: "ft", ft: "ft",
  meter: "m", meters: "m", metre: "m", metres: "m", m: "m",
  kilometer: "km", kilometers: "km", kilometre: "km", kilometres: "km", km: "km",
  mile: "mi", miles: "mi", mi: "mi",
  inch: "in", inches: "in", in: "in",
  millimeter: "mm", millimeters: "mm", millimetre: "mm", millimetres: "mm", mm: "mm",
  centimeter: "cm", centimeters: "cm", centimetre: "cm", centimetres: "cm", cm: "cm",
  pound: "lb", pounds: "lb", lbs: "lb", lb: "lb",
  kilogram: "kg", kilograms: "kg", kg: "kg",
  c: "C", f: "F", kph: "kph", mph: "mph", kn: "kn",
  hpa: "hPa", kpa: "kPa", inhg: "inHg", mmhg: "mmHg"
};

function explicitMeasurementUnit(suffix) {
  return measurementUnitAliases[String(suffix || "").trim().replace(/^°/, "").toLowerCase()] || "";
}

function convertedMeasurementText(value, fromUnit, toUnit) {
  if (value === null || value === undefined || value === "" || fromUnit === toUnit) return value;
  const text = String(value).trim();
  const range = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*-\s*(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z°]+))?$/);
  if (range) {
    const explicitUnit = explicitMeasurementUnit(range[3]);
    const first = convertUnitValue(range[1], explicitUnit || fromUnit, toUnit);
    const second = convertUnitValue(range[2], explicitUnit || fromUnit, toUnit);
    if (first === null || second === null) return value;
    const suffix = explicitUnit ? ` ${unitSymbolForValue(toUnit)}` : (range[3] ? ` ${range[3]}` : "");
    return `${trimConvertedMeasurement(first)}-${trimConvertedMeasurement(second)}${suffix}`;
  }
  const match = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z°]+))?$/);
  if (!match) return value;
  const explicitUnit = explicitMeasurementUnit(match[2]);
  const converted = convertUnitValue(match[1], explicitUnit || fromUnit, toUnit);
  if (converted === null) return value;
  const number = trimConvertedMeasurement(converted);
  if (explicitUnit) return `${number} ${unitSymbolForValue(toUnit)}`;
  return match[2] ? `${number} ${match[2]}` : number;
}

function unitSymbolForValue(unit) {
  return unit === "C" || unit === "F" ? `°${unit}` : unit;
}

function trimConvertedMeasurement(value) {
  return String(Math.round(Number(value) * 1000) / 1000);
}

function displayStoredMeasurement(value, key) {
  const text = String(value || "").trim();
  if (!text) return "";
  const range = text.match(/^-?(?:\d+(?:\.\d+)?|\.\d+)\s*-\s*-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*([a-zA-Z°]+))?$/);
  if (range) {
    if (explicitMeasurementUnit(range[1])) return text;
    return String(range[1] || "").toUpperCase() === "FOW" ? `${text} (${unitSymbol(key)})` : `${text} ${unitSymbol(key)}`;
  }
  const match = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z°]+))?$/);
  if (!match) return text;
  if (explicitMeasurementUnit(match[2])) return text;
  if (String(match[2] || "").toUpperCase() === "FOW") return `${text} (${unitSymbol(key)})`;
  return `${text} ${unitSymbol(key)}`;
}

function convertStoredMeasurements(previousUnits, nextUnits) {
  const tripMeasurements = [
    ["waterTemp", "waterTemperature"],
    ["waveHeight", "waveHeight"],
    ["structure", "depth"]
  ];
  const catchMeasurements = [
    ["length", "fishLength"],
    ["weight", "fishWeight"],
    ["waterDepth", "depth"],
    ["depthDown", "depth"],
    ["fowCaught", "depth"],
    ["gpsSpeed", "speed"],
    ["ballSpeed", "speed"],
    ["ballDepth", "depth"],
    ["lineBehindBoard", "depth"],
    ["estimatedLureDepth", "depth"],
    ["lineOut", "depth"],
    ["estimatedDepth", "depth"]
  ];
  const convertRecord = (record, measurements) => {
    if (!record || typeof record !== "object") return;
    measurements.forEach(([field, unitKey]) => {
      const fromUnit = previousUnits[unitKey];
      const toUnit = nextUnits[unitKey];
      if (fromUnit !== toUnit) record[field] = convertedMeasurementText(record[field], fromUnit, toUnit);
    });
  };

  state.trips.forEach((trip) => {
    convertRecord(trip, tripMeasurements);
    if (previousUnits.waterTemperature !== nextUnits.waterTemperature) {
      (Array.isArray(trip.probeTemperatureProfile) ? trip.probeTemperatureProfile : []).forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        entry.temperature = convertedMeasurementText(entry.temperature, previousUnits.waterTemperature, nextUnits.waterTemperature);
      });
    }
    if (previousUnits.windSpeed !== nextUnits.windSpeed && trip.wind) {
      trip.wind = String(trip.wind).replace(/(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(kph|mph|kn)\b/gi, (match, number, sourceUnit) => {
        const converted = convertUnitValue(number, explicitMeasurementUnit(sourceUnit), nextUnits.windSpeed);
        return converted === null ? match : `${trimConvertedMeasurement(converted)} ${unitSymbolForValue(nextUnits.windSpeed)}`;
      });
    }
    (trip.catches || []).forEach((catchItem) => convertRecord(catchItem, catchMeasurements));
    (trip.lostFish || []).forEach((fishItem) => convertRecord(fishItem, catchMeasurements));
    // Older imports can put the same measurements on a setup line.
    (trip.gearUsed || []).forEach((gearItem) => convertRecord(gearItem, catchMeasurements));
  });
  (state.reels || []).forEach((reel) => {
    convertRecord(reel, [["maxDrag", "fishWeight"]]);
    (reel.lineHistory || []).forEach((line) => convertRecord(line, [["weight", "fishWeight"]]));
  });
}

function formatUnitValue(value, key, fromUnit, options = {}) {
  const toUnit = unitPreference(key);
  const converted = convertUnitValue(value, fromUnit, toUnit);
  if (converted === null) return "Not logged";
  const decimals = options.decimals ?? (Math.abs(converted) < 10 && !Number.isInteger(converted) ? 1 : 0);
  return `${trimNumber(Math.round(converted * (10 ** decimals)) / (10 ** decimals))} ${unitSymbol(key)}`;
}

function formatDisplayTime(value, format = timeFormatPreference()) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  if (format === "24") return `${hour}:${String(minute).padStart(2, "0")}`;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDisplayTimeRange(startTime, endTime, format = timeFormatPreference()) {
  const start = formatDisplayTime(startTime, format);
  const end = formatDisplayTime(endTime, format);
  return [start, end].filter(Boolean).join("-");
}

function normalizeChopRanges(ranges = []) {
  const source = Array.isArray(ranges) && ranges.length ? ranges : defaultChopRanges;
  const normalized = source
    .map((range, index) => {
      const fallback = defaultChopRanges[index] || defaultChopRanges.at(-1);
      const label = String(range?.label || fallback.label || "").trim();
      const maxFeet = range?.maxFeet === null || range?.maxFeet === ""
        ? null
        : Number(range?.maxFeet);
      return {
        id: String(range?.id || fallback.id || `chop-${index + 1}`),
        label: label || fallback.label,
        maxFeet: Number.isFinite(maxFeet) ? Math.max(0, Math.round(maxFeet * 100) / 100) : null
      };
    })
    .filter((range) => range.label);
  if (!normalized.length) return structuredClone(defaultChopRanges);
  if (!normalized.some((range) => range.maxFeet === null)) {
    normalized.push({ id: "rough", label: "rough", maxFeet: null });
  }
  return normalized;
}
