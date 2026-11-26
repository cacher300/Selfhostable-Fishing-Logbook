import type { Experiment, ExperimentAssignment, Logbook, SetupLine, Trip } from "../types";

export function assignedExperimentIds(trip?: Partial<Trip> | null): Set<string>;
export function tripExperimentIds(trip?: Partial<Trip> | null): string[];
export function experimentValidationError(book: Logbook): string | null;
export function assignmentLabels(experiments: Experiment[], assignments?: ExperimentAssignment[]): string;
export interface ExperimentDeployment {
  tripId: string;
  date?: string;
  tripTitle: string;
  lineId: string;
  label: string;
  startTime?: string;
  endTime?: string;
  hours: number | null;
  events: { id: string; missed: boolean; quantity: number; time?: string; species?: string }[];
}
export function experimentResults(book: Logbook, experiment: Experiment): {
  variant: Experiment["variants"][number];
  rows: ExperimentDeployment[];
  hours: number;
  landed: number;
  missed: number;
  untimed: number;
  landedRate: number | null;
  strikeRate: number | null;
  percentLanded: number | null;
}[];
export function setExperimentVariant(assignments: ExperimentAssignment[], experimentId: string, variantId: string): ExperimentAssignment[];
export function withoutExperimentAssignments<T extends SetupLine>(line: T): T;
