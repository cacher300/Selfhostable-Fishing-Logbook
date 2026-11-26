export interface ProbeCatchMarker {
  catchIndex: number;
  depthFeet: number;
  kind: "catch" | "water";
  species: string;
  slot: number;
  peers: number;
}
export function probeCatchMarkers(catches: readonly Record<string, unknown>[], unit: string): ProbeCatchMarker[];
export function probeMarkerX(marker: ProbeCatchMarker, center: number, min: number, max: number): number;
export function missingProbeDepthNote(count: number): string;
