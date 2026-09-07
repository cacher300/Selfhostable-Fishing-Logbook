import type { Coordinates, MediaRef, Spot, Trip, Value } from "../../domain/types";

export type PointKind = "Trip" | "Catch" | "Lost fish" | "Photo" | "Video" | "Live event";

export type MapPoint = {
  id: string;
  kind: PointKind;
  tripId: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  species?: string;
  waterbody?: string;
  time?: string;
  date: string;
  year: string;
  detail?: string;
  spot?: string;
  imageUri?: string;
  fillColor: string;
  outlineColor: string;
};

export type Hotspot = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  species: string[];
  waters: string[];
  tripIds: string[];
};

export const MAP_POINT_KINDS: ReadonlyArray<"All records" | PointKind> = [
  "All records",
  "Trip",
  "Catch",
  "Lost fish",
  "Photo",
  "Video",
  "Live event",
];

const markerColors = ["#38b878", "#72a7e8", "#f06c67", "#f3b65e", "#9a78e8", "#43c6d7", "#df69a5", "#8fca52", "#b88a72", "#9eabba"];
const kindColors: Record<Exclude<PointKind, "Catch">, string> = {
  Trip: "#38b878",
  "Lost fish": "#f06c67",
  Photo: "#72a7e8",
  Video: "#f3b65e",
  "Live event": "#9a78e8",
};

export function stableColor(value = "Fish") {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return markerColors[hash % markerColors.length];
}

export function isValidCoordinates(coordinates?: Coordinates | null): coordinates is Coordinates {
  return Boolean(
    coordinates
      && Number.isFinite(coordinates.latitude)
      && Number.isFinite(coordinates.longitude)
      && coordinates.latitude >= -90
      && coordinates.latitude <= 90
      && coordinates.longitude >= -180
      && coordinates.longitude <= 180,
  );
}

function displayValue(value?: Value) {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

function mediaImage(media?: MediaRef) {
  if (!media || media.mediaType !== "image") return undefined;
  return media.uri || media.previewImage || media.image || media.url || media.path;
}

function selectedCatchMedia(photos: MediaRef[] = [], selectedId?: string, heroId?: string) {
  return photos.find(photo => photo.id === selectedId)
    || photos.find(photo => photo.id === heroId)
    || photos.find(photo => photo.mediaType === "image")
    || photos[0];
}

export function pointsForTrip(trip: Trip, spotsById: ReadonlyMap<string, Spot>): MapPoint[] {
  const points: MapPoint[] = [];
  const year = /^\d{4}/.exec(trip.date)?.[0] || "Unknown year";
  const outlineColor = stableColor(`year-${year}`);
  const add = (
    id: string,
    kind: PointKind,
    coordinates: Coordinates | null | undefined,
    title: string,
    options: Partial<Omit<MapPoint, "id" | "kind" | "tripId" | "latitude" | "longitude" | "title" | "date" | "year" | "fillColor" | "outlineColor">> = {},
  ) => {
    if (!isValidCoordinates(coordinates)) return;
    points.push({
      id,
      kind,
      tripId: trip.id,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      title,
      waterbody: trip.location,
      date: trip.date,
      year,
      fillColor: kind === "Catch" ? stableColor(options.species || "Fish") : kindColors[kind],
      outlineColor,
      ...options,
    });
  };

  add(`trip-${trip.id}`, "Trip", trip.coordinates, trip.title || trip.location || "Fishing trip", {
    subtitle: [trip.date, trip.location, trip.launch].filter(Boolean).join(" · "),
  });

  trip.catches.forEach((fish, index) => {
    const media = selectedCatchMedia(fish.photos, fish.photoLocationId, fish.heroPhotoId);
    const coordinates = fish.coordinates
      || fish.manualCoordinates
      || fish.lockedLocationCoordinates
      || media?.coordinates;
    const fow = displayValue(fish.fowCaught || fish.waterDepth || fish.depth_ft || fish.depth_m);
    add(`catch-${fish.id || index}`, "Catch", coordinates, `${fish.species || "Fish"} landed`, {
      subtitle: [trip.location, fish.time, fish.lureName].filter(Boolean).join(" · "),
      detail: fow ? `FOW ${fow}` : undefined,
      species: fish.species,
      time: fish.time,
      spot: fish.spotId ? spotsById.get(fish.spotId)?.name : undefined,
      imageUri: mediaImage(media),
    });
  });

  trip.lostFish.forEach((fish, index) => add(
    `lost-${fish.id || index}`,
    "Lost fish",
    fish.coordinates || fish.manualCoordinates || fish.lockedLocationCoordinates,
    `${fish.possibleSpecies || "Fish"} lost`,
    {
      subtitle: [trip.location, fish.time].filter(Boolean).join(" · "),
      species: fish.possibleSpecies,
      time: fish.time,
    },
  ));

  (trip.notePhotos || []).forEach((media, index) => {
    const kind: PointKind = media.mediaType === "video" ? "Video" : "Photo";
    // Match desktop behavior: images can use the trip point, while videos need
    // an embedded location so that a remote clip is never mapped inaccurately.
    const coordinates = media.coordinates || (kind === "Photo" ? trip.coordinates : undefined);
    add(`${kind.toLowerCase()}-${media.id || index}`, kind, coordinates, media.caption || media.filename || `Trip ${kind.toLowerCase()}`, {
      subtitle: [trip.location, media.captureTime].filter(Boolean).join(" · "),
      time: media.captureTime,
      imageUri: mediaImage(media),
    });
  });

  (trip.liveEvents || []).forEach((event, index) => add(
    `event-${event.id || index}`,
    "Live event",
    event.coordinates,
    event.title,
    {
      subtitle: [trip.location, event.time, event.detail].filter(Boolean).join(" · "),
      time: event.time,
    },
  ));

  return points;
}

export function filterMapPoints(
  points: readonly MapPoint[],
  filters: { species: string; water: string; kind: string; year: string; includeMedia: boolean },
) {
  return points.filter(point => (
    (filters.species === "All species" || point.species === filters.species)
    && (filters.water === "All waters" || point.waterbody === filters.water)
    && (filters.kind === "All records" || point.kind === filters.kind)
    && (filters.year === "All years" || point.year === filters.year)
    && (filters.includeMedia || (point.kind !== "Photo" && point.kind !== "Video"))
  ));
}

export function hotspotsForPoints(points: readonly MapPoint[]): Hotspot[] {
  const groups = new Map<string, { latitude: number; longitude: number; count: number; species: Set<string>; waters: Set<string>; tripIds: Set<string> }>();
  points.forEach(point => {
    if (point.kind !== "Catch") return;
    const key = `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;
    const group = groups.get(key) || { latitude: point.latitude, longitude: point.longitude, count: 0, species: new Set<string>(), waters: new Set<string>(), tripIds: new Set<string>() };
    group.count += 1;
    if (point.species) group.species.add(point.species);
    if (point.waterbody) group.waters.add(point.waterbody);
    group.tripIds.add(point.tripId);
    groups.set(key, group);
  });
  return [...groups.entries()].map(([id, group]) => ({
    id,
    latitude: group.latitude,
    longitude: group.longitude,
    count: group.count,
    species: [...group.species],
    waters: [...group.waters],
    tripIds: [...group.tripIds],
  })).sort((left, right) => right.count - left.count);
}
