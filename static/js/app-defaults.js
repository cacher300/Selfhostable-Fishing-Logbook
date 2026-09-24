const defaultTimeValue = "12:00";

const defaultWaterClarityOptions = [
  "Crystal Clear",
  "Clear",
  "Slightly Stained",
  "Stained",
  "Muddy"
];

const defaultStructureOptions = ["Drop-off", "Weedline", "Rocky bottom", "Sand bottom", "Vegetation", "Bait"];

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

const defaultReelStyleOptions = ["Baitcaster", "Spinning", "Linecounter", "Trolling", "Centerpin", "Fly"];
const defaultRodTypeOptions = ["Baitcaster", "Spinning", "Downrigging", "Dipsey", "Centerpin", "Fly", "Tipup"];
const defaultLineTypeOptions = ["Braid", "Mono", "Fluorocarbon", "Fly Line", "Leadcore", "Wire", "Copper", "Other"];
const defaultFlyCategoryOptions = ["Dry Fly", "Emerger", "Nymph", "Streamer", "Terrestrial", "Egg", "Midge", "Leech", "Popper", "Junk", "Other"];
const defaultFlyPresentationOptions = ["Dead Drift", "Swing", "Strip / Retrieve", "Indicator", "Euro Nymph", "Other"];
const defaultWaterLevelOptions = ["Low", "Normal", "High"];
const defaultRiggingOptions = ["Wacky", "Texas", "Carolina", "Neko", "Weightless", "Drop-shot", "Jika", "Jighead", "Ned", "Other"];
const defaultLureBladeTypeOptions = ["Colorado", "Willow Leaf", "Indiana", "Butterfly"];
const defaultLureSpoonSizeOptions = ["Micro", "Small", "Standard", "Magnum"];
const defaultTrollingPresentationOptions = [
  { value: "Outside Board", label: "Outside Board" },
  { value: "Inside Board", label: "Inside Board" },
  { value: "High Diver", label: "High Diver" },
  { value: "Low Diver", label: "Low Diver" },
  { value: "Downrigger", label: "Downrigger" },
  { value: "Chute Rod", label: "Chute Rod" }
];
const defaultTrollingDirectionOptions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const defaultSetupLineSideOptions = [
  { value: "Port", label: "Port" },
  { value: "Center", label: "Center" },
  { value: "Starboard", label: "Starboard" }
];

const defaultChopRanges = [
  { id: "calm", label: "Calm", maxFeet: 0.5 },
  { id: "light", label: "Light Chop", maxFeet: 1 },
  { id: "moderate", label: "Moderate Chop", maxFeet: 1.5 },
  { id: "very-choppy", label: "Very Choppy", maxFeet: 2 },
  { id: "rough", label: "Rough", maxFeet: null }
];

const defaultSpeciesMapColors = {
  "Atlantic Salmon": "#c96a4a",
  "Black Bullhead": "#343a40",
  "Black Crappie": "#3d4b55",
  Bluegill: "#3f7fa3",
  "Brown Bullhead": "#805a43",
  "Brown Trout": "#8a5a3b",
  "Chinook Salmon": "#a66a2c",
  "Coho Salmon": "#c47a43",
  "Lake Trout": "#496b7a",
  "Largemouth Bass": "#8dbb55",
  Muskie: "#496b45",
  "Northern Pike": "#7e9e55",
  Perch: "#e58a2b",
  "Rainbow Trout": "#b9c8d4",
  "Rock Bass": "#9a6a4a",
  "Smallmouth Bass": "#27643d",
  Walleye: "#c2a34d",
  "White Crappie": "#b9c6d1",
  "Yellow Bullhead": "#c59a37"
};

const fallbackSpeciesMapColors = [
  "#0b6e43",
  "#2763a7",
  "#bc2f2f",
  "#9a5b00",
  "#6f42c1",
  "#087990",
  "#b4236b",
  "#4d7c0f",
  "#795548",
  "#344054"
];

function isValidSpeciesMapColor(value) {
  return /^#[\da-f]{6}$/i.test(String(value || ""));
}

function fallbackSpeciesColor(species = "Fish") {
  const value = String(species || "Fish");
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return fallbackSpeciesMapColors[hash % fallbackSpeciesMapColors.length];
}

function speciesColor(species = "Fish") {
  const value = String(species || "Fish").trim() || "Fish";
  const normalized = value.toLowerCase();
  const configuredColors = typeof state !== "undefined" && state.settings?.speciesMapColors
    && typeof state.settings.speciesMapColors === "object"
    && !Array.isArray(state.settings.speciesMapColors)
    ? state.settings.speciesMapColors
    : {};
  const configured = Object.entries(configuredColors).find(([name, color]) => (
    String(name).trim().toLowerCase() === normalized && isValidSpeciesMapColor(color)
  ));
  if (configured) return configured[1];
  const defaultColor = Object.entries(defaultSpeciesMapColors).find(([name]) => name.toLowerCase() === normalized)?.[1];
  return defaultColor || fallbackSpeciesColor(value);
}

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
  schemaVersion: 2,
  species: [
    "Atlantic Salmon",
    "Black Bullhead",
    "Black Crappie",
    "Bluegill",
    "Brown Bullhead",
    "Brown Trout",
    "Chinook Salmon",
    "Coho Salmon",
    "Lake Trout",
    "Largemouth Bass",
    "Muskie",
    "Northern Pike",
    "Perch",
    "Rainbow Trout",
    "Rock Bass",
    "Smallmouth Bass",
    "Walleye",
    "White Crappie",
    "Yellow Bullhead"
  ],
  methods: ["Trolling", "Casting", "Jigging", "Drifting", "Fly Fishing", "Bait Fishing", "Ice Fishing", "Shore Fishing"],
  riggings: structuredClone(defaultRiggingOptions),
  lureTypes: ["Blade Bait", "Crankbait", "Dropshot", "Flasher/Fly", "Fly", "Jerkbait", "Jig", "Meat Rig", "Other", "Plug", "Soft Plastic", "Spinner", "Spoon", "Swimbait", "Topwater", "Worm Harness"],
  flasherTypes: ["Paddle", "Dodger", "Spin Doctor", "Meat Rig", "Attractor", "Other"],
  waterClarities: structuredClone(defaultWaterClarityOptions),
  structureOptions: structuredClone(defaultStructureOptions),
  weatherTypes: structuredClone(defaultWeatherOptions),
  reelStyles: structuredClone(defaultReelStyleOptions),
  rodTypes: structuredClone(defaultRodTypeOptions),
  lineTypes: structuredClone(defaultLineTypeOptions),
  flyCategories: structuredClone(defaultFlyCategoryOptions),
  flyPresentations: structuredClone(defaultFlyPresentationOptions),
  waterLevels: structuredClone(defaultWaterLevelOptions),
  lureBladeTypes: structuredClone(defaultLureBladeTypeOptions),
  lureSpoonSizes: structuredClone(defaultLureSpoonSizeOptions),
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
      media: []
    }
  ],
  flashers: [],
  reels: [],
  rods: [],
  rodReelCombos: [],
  settings: {
    theme: "light",
    speciesMapColors: structuredClone(defaultSpeciesMapColors),
    defaultHomeLake: "",
    defaultPeople: [],
    hasFishHawk: true,
    timeFormat: "24",
    bathymetryLakeCalibrationsFeet: {
      Erie: { shallowOffsetFeet: 0, offshoreOffsetFeet: 0 }, Ontario: { shallowOffsetFeet: 0, offshoreOffsetFeet: 0 },
      "St. Clair": { shallowOffsetFeet: 0, offshoreOffsetFeet: 0 }, Huron: { shallowOffsetFeet: 0, offshoreOffsetFeet: 0 },
      Michigan: { shallowOffsetFeet: 0, offshoreOffsetFeet: 0 }, Superior: { shallowOffsetFeet: 0, offshoreOffsetFeet: 0 }
    },
    units: structuredClone(defaultUnits),
    chopRanges: structuredClone(defaultChopRanges),
    trollingSpreads: [],
    defaultTrollingSpreadId: "",
    savedSetups: [],
    defaultSavedSetupIds: {},
    checklists: [],
    privatePhotoLocations: []
  },
  people: [],
  locations: [],
  spots: [],
  expeditions: [],
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
