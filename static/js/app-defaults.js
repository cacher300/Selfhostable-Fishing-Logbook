const defaultWaterClarityOptions = [
  "Crystal Clear",
  "Clear",
  "Slightly Stained",
  "Stained",
  "Muddy",
  "Algae Bloom"
];

const defaultWeatherOptions = [
  "Sunny",
  "Partly Cloudy",
  "Overcast",
  "Light Rain",
  "Heavy Rain",
  "Thunderstorms",
  "Fog",
  "Snow",
  "Mixed"
];

const defaultReelStyleOptions = ["Baitcaster", "Spinning", "Centerpin", "Fly"];
const defaultRodTypeOptions = ["Baitcaster", "Spinning", "Downrigging", "Dipsey", "Centerpin", "Fly", "Tipup"];
const defaultLineTypeOptions = ["Braid", "Mono", "Fluorocarbon", "Leadcore", "Wire", "Copper", "Other"];
const defaultTrollingPresentationOptions = [
  { value: "Outside Board", label: "Outside Board" },
  { value: "Inside Board", label: "Inside Board" },
  { value: "High Diver", label: "High Diver" },
  { value: "Low Diver", label: "Low Diver" },
  { value: "Downrigger", label: "Downrigger" },
  { value: "Cheater", label: "Cheater" },
  { value: "Chute Rod", label: "Chute Rod" }
];
const defaultTrollingDirectionOptions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const defaultSetupLineSideOptions = [
  { value: "Port", label: "Port" },
  { value: "Center", label: "Center" },
  { value: "Starboard", label: "Starboard" }
];

function migrateTrollingPresentationValue(value) {
  const legacyValues = {
    downrigger: "Downrigger",
    cheater: "Cheater",
    flatline: "Chute Rod",
    "flatline-leadcore": "Outside Board",
    "dipsey-diver": "High Diver"
  };
  return legacyValues[String(value || "")] || String(value || "");
}

function migrateSetupLineSideValue(value) {
  const legacyValues = { port: "Port", center: "Center", starboard: "Starboard" };
  return legacyValues[String(value || "")] || String(value || "");
}
const defaultChopRanges = [
  { id: "calm", label: "Calm", maxFeet: 0.5 },
  { id: "light", label: "Light Chop", maxFeet: 1 },
  { id: "moderate", label: "Moderate Chop", maxFeet: 1.5 },
  { id: "very-choppy", label: "Very Choppy", maxFeet: 2 },
  { id: "rough", label: "Rough", maxFeet: null }
];
const defaultUnits = {
  depth: "ft",
  distance: "km",
  speed: "mph",
  windSpeed: "kph",
  pressure: "hPa",
  airTemperature: "C",
  waterTemperature: "F",
  precipitation: "mm",
  waveHeight: "ft",
  fishLength: "in",
  fishWeight: "lb"
};
const unitOptions = {
  depth: [
    { value: "m", label: "Meters (m)" },
    { value: "ft", label: "Feet (ft)" }
  ],
  distance: [
    { value: "km", label: "Kilometers (km)" },
    { value: "mi", label: "Miles (mi)" }
  ],
  speed: [
    { value: "kph", label: "Kilometers/hour (kph)" },
    { value: "mph", label: "Miles/hour (mph)" },
    { value: "kn", label: "Knots (kn)" }
  ],
  windSpeed: [
    { value: "kph", label: "Kilometers/hour (kph)" },
    { value: "mph", label: "Miles/hour (mph)" },
    { value: "kn", label: "Knots (kn)" }
  ],
  pressure: [
    { value: "hPa", label: "Hectopascals (hPa)" },
    { value: "kPa", label: "Kilopascals (kPa)" },
    { value: "inHg", label: "Inches mercury (inHg)" },
    { value: "mmHg", label: "Millimeters mercury (mmHg)" }
  ],
  airTemperature: [
    { value: "C", label: "Celsius (C)" },
    { value: "F", label: "Fahrenheit (F)" }
  ],
  waterTemperature: [
    { value: "F", label: "Fahrenheit (F)" },
    { value: "C", label: "Celsius (C)" }
  ],
  precipitation: [
    { value: "mm", label: "Millimeters (mm)" },
    { value: "in", label: "Inches (in)" }
  ],
  waveHeight: [
    { value: "m", label: "Meters (m)" },
    { value: "ft", label: "Feet (ft)" }
  ],
  fishLength: [
    { value: "in", label: "Inches (in)" },
    { value: "cm", label: "Centimeters (cm)" }
  ],
  fishWeight: [
    { value: "lb", label: "Pounds (lb)" },
    { value: "kg", label: "Kilograms (kg)" }
  ]
};

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const fallbackId = "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
    const randomValue = globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint8Array(1))[0]
      : Math.floor(Math.random() * 256);
    return (Number(char) ^ (randomValue & (15 >> (Number(char) / 4)))).toString(16);
  });

  return fallbackId;
}

const defaults = {
  species: [
    "Lake Trout",
    "Largemouth Bass",
    "Smallmouth Bass",
    "Chinook Salmon",
    "Coho Salmon",
    "Rainbow Trout",
    "Brown Trout",
    "Walleye",
    "Northern Pike",
    "Muskie",
    "Rock Bass",
    "Perch",
    "Crappie",
    "Bluegill"
  ],
  methods: ["Trolling", "Casting", "Jigging", "Fly Fishing", "Bait Fishing", "Ice Fishing", "Shore Fishing"],
  lureTypes: ["Spoon", "Crankbait", "Spinner", "Worm Harness", "Jig", "Dropshot", "Soft Plastic", "Fly", "Plug", "Swimbait", "Flasher/Fly", "Jerkbait", "Topwater", "Other"],
  flasherTypes: ["Paddle", "Dodger", "Spin Doctor", "Meat Rig", "Attractor", "Other"],
  waterClarities: structuredClone(defaultWaterClarityOptions),
  weatherTypes: structuredClone(defaultWeatherOptions),
  reelStyles: structuredClone(defaultReelStyleOptions),
  rodTypes: structuredClone(defaultRodTypeOptions),
  lineTypes: structuredClone(defaultLineTypeOptions),
  trollingPresentations: structuredClone(defaultTrollingPresentationOptions),
  trollingDirections: structuredClone(defaultTrollingDirectionOptions),
  setupLineSides: structuredClone(defaultSetupLineSideOptions),
  lures: [
    {
      id: createId(),
      name: "Blue/Silver Spoon",
      type: "Spoon",
      brand: "",
      color: "Blue/Silver",
      notes: "Starter lure. Replace with your real lure photo when ready.",
      image: ""
    }
  ],
  flashers: [],
  reels: [],
  rods: [],
  rodReelCombos: [],
  settings: {
    theme: "light",
    timeFormat: "24",
    units: structuredClone(defaultUnits),
    chopRanges: structuredClone(defaultChopRanges),
    privatePhotoLocations: []
  },
  people: [],
  locations: [],
  trips: [
    {
      id: createId(),
      title: "Morning salmon troll",
      date: "2026-04-28",
      location: "Lake Ontario",
      hours: 3.5,
      targetSpecies: "Chinook Salmon",
      method: "Trolling",
      waterTemp: "47 F",
      waterClarity: "Clear",
      weather: "Overcast",
      wind: "W 13 kph",
      structure: "24-37 m, bait pods",
      notes: "Best action near first light. Marked bait deep.",
      catches: []
    }
  ]
};
