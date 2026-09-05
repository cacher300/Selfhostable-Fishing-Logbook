/** JSON-compatible values exchanged with the desktop logbook archive. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonRecord = Record<string, Json | undefined>;
export type Value = string | number | boolean | null;

/** Additional desktop/archive properties are deliberately retained verbatim. */
export type Extensible = { [key: string]: unknown };
export type Coordinates = { latitude: number; longitude: number };
export type ChoiceOption = { value: string; label: string };

export interface MediaRef extends Extensible {
  id: string;
  filename: string;
  category: string;
  mediaType: "image" | "video";
  uri?: string;
  name?: string;
  caption?: string;
  path?: string;
  url?: string;
  image?: string;
  mimeType?: string;
  previewImage?: string;
  previewPath?: string;
  previewFilename?: string;
  coordinates?: Coordinates | null;
  captureTime?: string;
}

export interface Person extends Extensible { id: string; name: string; }
export interface Launch extends Extensible { id: string; name: string; coordinates?: Coordinates | null; }
export interface Location extends Extensible { id: string; name: string; coordinates?: Coordinates | null; launches: Launch[]; }

export interface Expedition extends Extensible { id: string; name: string; startDate: string; endDate: string; destination?: string; notes?: string; }
export interface Spot extends Extensible { id: string; name: string; coordinates: Coordinates; radiusMeters: number; }

export interface SetupLine extends Extensible {
  rigging?: string;
  riggingDetails?: string;
  id: string;
  personId?: string;
  startTime: string;
  endTime?: string;
  changeNote?: string;
  side?: string;
  lineLabel?: string;
  comboId?: string;
  rodId?: string;
  reelId?: string;
  lureId?: string;
  flasherId?: string;
  presentation?: string;
  deepestRigger?: boolean;
  boatItemId?: string;
  hasLeadcore?: boolean;
  distanceBehind?: Value;
  hasCheater?: boolean;
  cheaterLureId?: string;
  lureMinutes?: Value;
  flasherMinutes?: Value;
}

/** Shared trolling/casting context. Landed fish add biological and media fields below. */
export interface FishEvent extends Extensible {
  rigging?: string;
  riggingDetails?: string;
  structureType?: string;
  spotId?: string;
  spotAssignmentMode?: "automatic" | "manual";
  id: string;
  personId?: string;
  time?: string;
  waterDepth?: Value;
  depthDown?: Value;
  presentation?: string;
  direction?: string;
  fowCaught?: Value;
  speed?: Value;
  retrieve?: string;
  timeUnknown?: boolean;
  detailsUnknown?: boolean;
  gpsSpeed?: Value;
  ballSpeed?: Value;
  shaker?: boolean;
  ballDepth?: Value;
  deepestRigger?: boolean;
  cheaterDepth?: Value;
  flatlineWeightOz?: Value;
  lineBehindBoard?: Value;
  leadcoreColors?: Value;
  estimatedLureDepth?: Value;
  dipseySetting?: Value;
  lineOut?: Value;
  estimatedDepth?: Value;
  /** Desktop photo and bathymetry metadata, retained and editable on mobile. */
  metadataLocks?: { time?: boolean; location?: boolean; fow?: boolean };
  lockedLocationCoordinates?: Coordinates | null;
  manualCoordinates?: Coordinates | null;
  coordinates?: Coordinates | null;
  photoLocationId?: string;
  heroPhotoId?: string;
  depth_m?: Value;
  depth_ft?: Value;
  lake_name?: string;
  depth_source?: string;
  rodId?: string;
  notes?: string;
  setupLineId?: string;
  setupLineTarget?: string;
  lureId?: string;
  flasherId?: string;
  quantity?: Value;
  weatherData?: WeatherSnapshot;
}

export interface ProbeTemperatureReading extends Extensible {
  depthFeet: number;
  temperature?: Value;
}

export type LiveEventKind = "trip-started" | "catch" | "lost" | "setup-added" | "setup-changed" | "location-changed" | "conditions-changed" | "note" | "photo" | "technique-changed" | "paused" | "resumed" | "trip-ended";
export interface LiveEvent extends Extensible {
  id: string;
  kind: LiveEventKind;
  time: string;
  title: string;
  detail?: string;
  coordinates?: Coordinates | null;
  relatedId?: string;
}

export interface Catch extends FishEvent {
  species?: string;
  released?: boolean;
  length?: Value;
  weight?: Value;
  photos?: MediaRef[];
}

export interface LostFish extends FishEvent {
  possibleSpecies?: string;
  released?: false;
}

export interface GearBase extends Extensible {
  model?: string;
  divingDepth?: Value;
  quantityAvailable?: Value;
  glow?: boolean;
  id: string;
  name?: string;
  shortName?: string;
  brand?: string;
  notes?: string;
  image?: string;
  previewImage?: string;
  imagePath?: string;
  imageFilename?: string;
  previewPath?: string;
  previewFilename?: string;
  media?: MediaRef[];
}
export interface Lure extends GearBase { name: string; type?: string; color?: string; weight?: string; spoonSize?: string; bladeType?: string; }
export interface Flasher extends GearBase { name: string; type?: string; color?: string; }
export interface Rod extends GearBase { shortName?: string; type?: string; length?: Value; power?: string; action?: string; lureRating?: string; purchaseAmount?: Value; dateBought?: string; }
export interface LineHistoryEntry extends Extensible { id: string; spooledDate?: string; discardedDate?: string; type?: string; brand?: string; name?: string; weight?: Value; diameterIn?: Value; diameterMm?: Value; color?: string; monoBacking?: string; notes?: string; }
export interface Reel extends GearBase { shortName?: string; style?: string; size?: Value; weight?: Value; gearRatio?: Value; retrieveRate?: Value; maxDrag?: Value; monoCapacity?: string; braidCapacity?: string; purchaseAmount?: Value; dateBought?: string; lineHistory: LineHistoryEntry[]; }
export interface RodReelCombo extends Extensible { id: string; shortName?: string; rodId?: string; reelId?: string; notes?: string; }

export interface WeatherSnapshot extends Extensible {
  source?: string;
  fetchedAt?: string;
  timezone?: string;
  units?: Record<string, string>;
  daily?: Record<string, unknown>;
  hourly?: Array<Record<string, unknown>>;
  tripWindow?: Record<string, unknown>;
  trend?: Record<string, unknown>;
  frontTag?: string;
  marine?: Record<string, unknown>;
  sunMoon?: Record<string, unknown>;
  status?: string;
  message?: string;
}

export interface Trip extends Extensible {
  expeditionId?: string;
  idleHours?: Value;
  structureType?: string;
  id: string;
  title: string;
  date: string;
  location?: string;
  locationId?: string;
  launch?: string;
  launchId?: string;
  launchTime?: string;
  startTime?: string; // desktop compatibility alias for linesSetTime
  endTime?: string; // desktop compatibility alias for linesPulledTime
  linesSetTime?: string;
  linesPulledTime?: string;
  hours?: Value;
  targetSpecies?: string;
  method?: string;
  intent?: string;
  tripRating?: Value;
  waterTemp?: Value;
  waterClarity?: string;
  weather?: string;
  waveHeight?: Value;
  waveChop?: string;
  wind?: string;
  structure?: string;
  notes?: string;
  coordinates?: Coordinates | null;
  /** Optional on input for compatibility; normalization supplies an empty list. */
  people?: Person[];
  gearUsed: SetupLine[];
  catches: Catch[];
  lostFish: LostFish[];
  notePhotos?: MediaRef[];
  weatherData?: WeatherSnapshot;
  probeTemperatureProfile?: ProbeTemperatureReading[];
  liveEvents?: LiveEvent[];
  liveStatus?: "active" | "paused" | "completed";
}

export interface UnitPreferences extends Extensible {
  depth?: string; distance?: string; speed?: string; windSpeed?: string; pressure?: string;
  airTemperature?: string; waterTemperature?: string; precipitation?: string; waveHeight?: string;
  fishLength?: string; fishWeight?: string;
}
export interface ChopRange extends Extensible { id: string; label: string; maxFeet: number | null; }
export interface PrivatePhotoLocation extends Extensible { id: string; name: string; radiusMeters: number; coordinates: Coordinates; }
export interface Settings extends Extensible {
  timeFormat?: "12" | "24" | string;
  units?: UnitPreferences;
  chopRanges?: ChopRange[];
  defaultTrollingSpread?: SetupLine[];
  defaultTrollingSpreads?: Array<Extensible>;
  privatePhotoLocations?: PrivatePhotoLocation[];
  bathymetryLakeCalibrationsFeet?: Record<string, number>;
}

export interface Logbook extends Extensible {
  riggings: string[];
  structureOptions: string[];
  expeditions: Expedition[];
  spots: Spot[];
  schemaVersion: number;
  settings: Settings;
  species: string[];
  methods: string[];
  lureTypes: string[];
  flasherTypes: string[];
  waterClarities: string[];
  weatherTypes: string[];
  reelStyles: string[];
  rodTypes: string[];
  lineTypes: string[];
  lureBladeTypes: string[];
  lureSpoonSizes: string[];
  trollingPresentations: ChoiceOption[];
  trollingDirections: string[];
  setupLineSides: ChoiceOption[];
  lures: Lure[];
  flashers: Flasher[];
  reels: Reel[];
  rods: Rod[];
  rodReelCombos: RodReelCombo[];
  people: Person[];
  locations: Location[];
  trips: Trip[];
  /** Locally captured media awaiting assignment to a trip, catch, or gear item. */
  mediaInbox?: MediaRef[];
}

/** Archive format remains desktop-compatible and intentionally independent of SQLite schema revisions. */
export const ARCHIVE_VERSION = 1;
