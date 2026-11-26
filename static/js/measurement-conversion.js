export function convertUnitValue(value, fromUnit, toUnit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (fromUnit === toUnit) return number;
  if (fromUnit === "C" && toUnit === "F") return (number * 9 / 5) + 32;
  if (fromUnit === "F" && toUnit === "C") return (number - 32) * 5 / 9;
  const conversion = CONVERSIONS.find((units) => fromUnit in units && toUnit in units);
  return conversion ? number * conversion[fromUnit] / conversion[toUnit] : number;
}

const CONVERSIONS = [
  { kph: 1, mph: 1.609344, kn: 1.852 },
  { m: 1, ft: 0.3048, fm: 1.8288, km: 1000, mi: 1609.344, in: 0.0254, mm: 0.001, cm: 0.01 },
  { kg: 1, lb: 0.45359237 },
  { hPa: 1, kPa: 10, inHg: 33.8638866667, mmHg: 1.33322387415 }
];
