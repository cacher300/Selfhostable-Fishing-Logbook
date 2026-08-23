import type { Logbook, MediaRef } from "../types";

export type MediaUse = { media: MediaRef; owner: "trip" | "catch" | "lost" | "gear"; ownerId: string; tripId?: string; field: string };

function mediaArray(value: unknown): MediaRef[] {
  return Array.isArray(value) ? value.filter((item): item is MediaRef => Boolean(item) && typeof item === "object" && typeof (item as MediaRef).id === "string") : [];
}

/** Returns every attachment reference, including the legacy gear image fields. */
export function mediaReferences(logbook: Logbook): MediaUse[] {
  const references: MediaUse[] = [];
  const add = (items: MediaRef[], owner: MediaUse["owner"], ownerId: string, field: string, tripId?: string) => items.forEach(media => references.push({ media, owner, ownerId, field, tripId }));
  logbook.trips.forEach(trip => {
    add(mediaArray(trip.notePhotos), "trip", trip.id, "notePhotos", trip.id);
    trip.catches.forEach(catchItem => add(mediaArray(catchItem.photos), "catch", catchItem.id, "photos", trip.id));
    trip.lostFish.forEach(catchItem => add(mediaArray(catchItem.photos), "lost", catchItem.id, "photos", trip.id));
  });
  (["lures", "flashers", "rods", "reels", "rodReelCombos"] as const).forEach(collection => logbook[collection].forEach(item => {
    const id = String(item.id || "");
    add(mediaArray(item.media || item.photos), "gear", id, "media");
    if (!item.photos && item.image) add([{ id: String(item.id || item.imageFilename || item.image), filename: String(item.imageFilename || item.name || "media"), category: "gear", mediaType: "image", uri: String(item.image) }], "gear", id, "image");
  }));
  return references;
}

export function referencedMediaIds(logbook: Logbook): Set<string> {
  return new Set(mediaReferences(logbook).map(reference => reference.media.id).filter(Boolean));
}

export function findOrphanMedia(logbook: Logbook, media: MediaRef[]): MediaRef[] {
  const referenced = referencedMediaIds(logbook);
  return media.filter(item => !referenced.has(item.id));
}
