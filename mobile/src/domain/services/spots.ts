import type { Catch, Coordinates, Spot } from "../types";

function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radians = (value: number) => value * Math.PI / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude))
    * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Match desktop: explicit assignments win; otherwise choose the nearest spot in range. */
export function assignCatchSpot(fish: Catch, spots: Spot[]): Catch {
  if (fish.spotAssignmentMode === "manual") return { ...fish, spotId: spots.some(spot => spot.id === fish.spotId) ? fish.spotId : "" };
  const coordinates = fish.manualCoordinates || fish.coordinates;
  const matches = coordinates ? spots.map(spot => ({ spot, distance: distanceMeters(coordinates, spot.coordinates) }))
    .filter(({ spot, distance }) => distance <= spot.radiusMeters)
    .sort((a, b) => a.distance - b.distance || a.spot.id.localeCompare(b.spot.id)) : [];
  return { ...fish, spotAssignmentMode: "automatic", spotId: matches[0]?.spot.id || "" };
}
