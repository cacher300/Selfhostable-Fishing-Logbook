import type { Expedition, Trip } from "../types";
import { tripHours } from "./duration";

export type ExpeditionSort = "start-desc" | "start-asc" | "name-asc";

const countFish = (trip: Trip) => trip.catches.reduce((total, item) => {
  const quantity = Number(item.quantity);
  return total + Math.max(1, Number.isFinite(quantity) ? quantity : 1);
}, 0);

export function inclusiveDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function sortedExpeditions(expeditions: Expedition[], sort: ExpeditionSort = "start-desc"): Expedition[] {
  return [...expeditions].sort((a, b) => {
    if (sort === "name-asc") return a.name.localeCompare(b.name);
    const direction = sort === "start-asc" ? 1 : -1;
    return a.startDate.localeCompare(b.startDate) * direction || a.name.localeCompare(b.name);
  });
}

export function summarizeExpedition(expedition: Expedition, trips: Trip[]) {
  const memberTrips = trips
    .filter(trip => trip.expeditionId === expedition.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const hours = memberTrips.reduce((total, trip) => total + tripHours(trip), 0);
  const fish = memberTrips.reduce((total, trip) => total + countFish(trip), 0);
  const species = new Set(memberTrips.flatMap(trip => trip.catches.map(item => item.species).filter(Boolean)));
  return {
    trips: memberTrips,
    tripCount: memberTrips.length,
    days: inclusiveDays(expedition.startDate, expedition.endDate),
    hours,
    fish,
    catchRate: hours > 0 ? fish / hours : 0,
    species: species.size,
  };
}

export const tripOutsideExpedition = (trip: Trip, expedition: Expedition) => Boolean(
  trip.date && expedition.startDate && expedition.endDate && (trip.date < expedition.startDate || trip.date > expedition.endDate),
);

