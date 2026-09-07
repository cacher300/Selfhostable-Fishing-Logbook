import { useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MapType } from "react-native-maps";
import { useRouter } from "expo-router";
import { EmptyState, MetricStrip, PrimaryButton, Screen, SecondaryButton, TopBar } from "../../components/ui";
import type { Coordinates } from "../../domain/types";
import { currentCoordinates } from "../../services/location";
import { fetchDepth } from "../../services/providers";
import { useLogbook } from "../../state/logbook-context";
import { tokens } from "../../theme/tokens";
import { MapCanvas } from "./MapCanvas";
import { filterMapPoints, hotspotsForPoints, MAP_POINT_KINDS, pointsForTrip, type MapPoint } from "./map-model";

type ViewMode = "Map" | "List" | "Density";
type DepthReading = { coordinates: Coordinates; status: "loading" | "ready" | "error"; label?: string; source?: string };
const mapTypes: MapType[] = ["standard", "satellite", "hybrid"];

function cycle<T extends string>(values: readonly T[], value: T) {
  return values[(values.indexOf(value) + 1) % values.length];
}

function depthReading(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const result = payload as { features?: Array<{ attributes?: Record<string, unknown> }>; attributes?: Record<string, unknown> };
  const attributes = result.features?.[0]?.attributes || result.attributes;
  if (!attributes) return null;
  const entry = Object.entries(attributes).find(([key, value]) => /depth|grid.?code|elev/i.test(key) && Number.isFinite(Number(value)));
  if (!entry) return null;
  const [key, rawValue] = entry;
  const value = Math.abs(Number(rawValue));
  const unit = /ft|feet/i.test(key) ? "ft" : "m";
  return { label: `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`, source: key };
}

export function MapScreen() {
  const { logbook, activeTrip, setTripCoordinates } = useLogbook();
  const router = useRouter();
  const depthRequest = useRef(0);
  const [species, setSpecies] = useState("All species");
  const [water, setWater] = useState("All waters");
  const [kind, setKind] = useState<(typeof MAP_POINT_KINDS)[number]>("All records");
  const [year, setYear] = useState("All years");
  const [includeMedia, setIncludeMedia] = useState(true);
  const [showYearOutlines, setShowYearOutlines] = useState(true);
  const [showNoaaCharts, setShowNoaaCharts] = useState(false);
  const [mapType, setMapType] = useState<MapType>("standard");
  const [view, setView] = useState<ViewMode>("Map");
  const [selectedId, setSelectedId] = useState<string>();
  const [locationError, setLocationError] = useState("");
  const [depth, setDepth] = useState<DepthReading>();

  const spotsById = useMemo(() => new Map(logbook.spots.map(spot => [spot.id, spot])), [logbook.spots]);
  const allPoints = useMemo(() => logbook.trips.flatMap(trip => pointsForTrip(trip, spotsById)), [logbook.trips, spotsById]);
  const waters = useMemo(() => ["All waters", ...new Set(allPoints.map(point => point.waterbody).filter((value): value is string => Boolean(value)))], [allPoints]);
  const speciesOptions = useMemo(() => ["All species", ...new Set(allPoints.map(point => point.species).filter((value): value is string => Boolean(value)))], [allPoints]);
  const years = useMemo(() => ["All years", ...new Set(allPoints.map(point => point.year).sort((left, right) => right.localeCompare(left)))], [allPoints]);
  const points = useMemo(() => filterMapPoints(allPoints, { species, water, kind, year, includeMedia }), [allPoints, species, water, kind, year, includeMedia]);
  const hotspots = useMemo(() => hotspotsForPoints(points), [points]);
  const selected = points.find(point => point.id === selectedId);
  const legend = useMemo(() => {
    const items = new Map<string, string>();
    points.forEach(point => items.set(point.kind === "Catch" ? point.species || "Unknown species" : point.kind, point.fillColor));
    return [...items.entries()];
  }, [points]);

  const markPosition = async () => {
    setLocationError("");
    try { await setTripCoordinates(await currentCoordinates()); }
    catch (error) { setLocationError(error instanceof Error ? error.message : "Could not read this position."); }
  };
  const inspectDepth = async (coordinates: Coordinates) => {
    const request = ++depthRequest.current;
    setSelectedId(undefined);
    setDepth({ coordinates, status: "loading" });
    try {
      const reading = depthReading(await fetchDepth(coordinates.latitude, coordinates.longitude));
      if (request !== depthRequest.current) return;
      setDepth({ coordinates, status: "ready", label: reading?.label || "No charted depth found", source: reading?.source });
    } catch {
      if (request === depthRequest.current) setDepth({ coordinates, status: "error", label: "Depth unavailable while offline" });
    }
  };
  const clear = () => { setSpecies("All species"); setWater("All waters"); setKind("All records"); setYear("All years"); setIncludeMedia(true); };
  const hasFilters = species !== "All species" || water !== "All waters" || kind !== "All records" || year !== "All years" || !includeMedia;

  return <Screen>
    <TopBar title="Map" subtitle="Every geotagged trip record, in context" actions={<View style={styles.toggle}><Toggle label="Map" active={view === "Map"} onPress={() => setView("Map")} /><Toggle label="List" active={view === "List"} onPress={() => setView("List")} /><Toggle label="Density" active={view === "Density"} onPress={() => setView("Density")} /></View>} />
    {activeTrip ? <View style={styles.live}><View style={styles.grow}><Text style={styles.liveLabel}>● LIVE POSITION</Text><Text style={styles.liveTitle}>{activeTrip.location || activeTrip.title}</Text><Text style={styles.muted}>{activeTrip.coordinates ? `${activeTrip.coordinates.latitude.toFixed(5)}, ${activeTrip.coordinates.longitude.toFixed(5)}` : "No trip position marked yet"}</Text></View><PrimaryButton compact label="Mark Position" onPress={markPosition} /></View> : null}
    {locationError ? <Text style={styles.error}>{locationError}</Text> : null}

    <View style={styles.filters}>
      <Filter label="SPECIES" value={species} onPress={() => setSpecies(cycle(speciesOptions, species))} />
      <Filter label="WATERBODY" value={water} onPress={() => setWater(cycle(waters, water))} />
      <Filter label="RECORD TYPE" value={kind} onPress={() => setKind(cycle(MAP_POINT_KINDS, kind))} />
      <Filter label="YEAR" value={year} onPress={() => setYear(cycle(years, year))} />
      <ToggleChip label="Show trip media" selected={includeMedia} onPress={() => setIncludeMedia(value => !value)} />
      {hasFilters ? <Pressable accessibilityRole="button" onPress={clear}><Text style={styles.clear}>Clear filters</Text></Pressable> : null}
    </View>

    <MetricStrip metrics={[{ label: "Mapped", value: points.length }, { label: "Catches", value: points.filter(point => point.kind === "Catch").length }, { label: "Lost", value: points.filter(point => point.kind === "Lost fish").length }, { label: "Waters", value: new Set(points.map(point => point.waterbody).filter(Boolean)).size }]} />

    {!points.length ? <EmptyState title="No mapped records" description="Add a trip position or geotag catches and photos. The record list remains available without map tiles." /> : view === "Map" ? <>
      <View style={styles.layerBar}><View style={styles.layerCopy}><Text style={styles.label}>LAYERS</Text><Text style={styles.muted}>Base map and online chart overlays</Text></View><SecondaryButton compact label={`${mapType[0].toUpperCase()}${mapType.slice(1)}  ▾`} onPress={() => setMapType(cycle(mapTypes, mapType))} /><ToggleChip label="NOAA charts" selected={showNoaaCharts} onPress={() => setShowNoaaCharts(value => !value)} /><ToggleChip label="Year colors" selected={showYearOutlines} onPress={() => setShowYearOutlines(value => !value)} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legend}>{legend.map(([label, color]) => <View key={label} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>)}</ScrollView>
      <View style={styles.mapFrame}><MapCanvas points={points} selectedId={selectedId} colorByYear={showYearOutlines} showNoaaCharts={showNoaaCharts} mapType={mapType} onSelect={point => { setDepth(undefined); setSelectedId(point.id); }} onInspect={inspectDepth} /></View>
      {selected ? <RecordCard point={selected} onPress={() => router.push(`/trip/${selected.tripId}`)} /> : depth ? <DepthCard reading={depth} /> : <Text style={styles.hint}>Tap a marker for record details. Tap open water for a depth lookup.</Text>}
    </> : view === "List" ? <View style={styles.list}>{points.map(point => <RecordRow key={point.id} point={point} onPress={() => router.push(`/trip/${point.tripId}`)} />)}</View> : hotspots.length ? <View style={styles.list}>{hotspots.map((spot, index) => <View key={spot.id} style={styles.densityRow}><Text style={styles.densityRank}>{index + 1}</Text><View style={styles.grow}><Text style={styles.rowTitle}>{spot.count} landed at this hotspot</Text><Text style={styles.muted}>{spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)} · {spot.waters.join(", ") || "Unknown water"}</Text><Text style={styles.kind}>{spot.species.join(" · ") || "Species unknown"} · {spot.tripIds.length} trips</Text></View></View>)}</View> : <EmptyState title="No catch density yet" description="Density groups landed catches within roughly 100 metres. Add catch GPS points or broaden the active filters." />}
  </Screen>;
}

function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.toggleButton, active && styles.toggleActive]}><Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text></Pressable>; }
function ToggleChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{selected ? "✓ " : ""}{label}</Text></Pressable>; }
function Filter({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <View style={styles.filter}><Text style={styles.label}>{label}</Text><SecondaryButton compact label={`${value}  ▾`} onPress={onPress} style={styles.filterButton} /></View>; }
function RecordRow({ point, onPress }: { point: MapPoint; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><View style={[styles.kindDot, { backgroundColor: point.fillColor }]} /><View style={styles.grow}><View style={styles.rowTop}><Text style={styles.kind}>{point.kind.toUpperCase()}</Text><Text style={styles.coords}>{point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}</Text></View><Text style={styles.rowTitle}>{point.title}</Text><Text style={styles.muted}>{point.subtitle || point.waterbody || "Mapped record"}</Text></View><Text style={styles.chevron}>›</Text></Pressable>; }
function RecordCard({ point, onPress }: { point: MapPoint; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}>{point.imageUri ? <Image source={{ uri: point.imageUri }} style={styles.thumbnail} /> : <View style={[styles.thumbnailFallback, { backgroundColor: point.fillColor }]}><Text style={styles.thumbnailGlyph}>{point.kind === "Catch" ? "●" : "◆"}</Text></View>}<View style={styles.grow}><Text style={styles.kind}>{point.kind.toUpperCase()} · {point.date}</Text><Text style={styles.recordTitle}>{point.title}</Text><Text style={styles.muted}>{[point.subtitle, point.detail, point.spot ? `Spot ${point.spot}` : ""].filter(Boolean).join(" · ")}</Text><Text style={styles.viewTrip}>View trip ›</Text></View></Pressable>; }
function DepthCard({ reading }: { reading: DepthReading }) { return <View style={styles.depthCard}><View style={styles.depthIcon}><Text style={styles.depthIconText}>≋</Text></View><View style={styles.grow}><Text style={styles.kind}>DEPTH LOOKUP</Text><Text style={styles.recordTitle}>{reading.status === "loading" ? "Looking up…" : reading.label}</Text><Text style={styles.muted}>{reading.coordinates.latitude.toFixed(5)}, {reading.coordinates.longitude.toFixed(5)}{reading.source ? ` · ${reading.source}` : ""}</Text></View></View>; }

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", borderWidth: 1, borderColor: tokens.color.line, borderRadius: 8, overflow: "hidden" }, toggleButton: { paddingHorizontal: 9, paddingVertical: 7, backgroundColor: tokens.color.panelSoft }, toggleActive: { backgroundColor: tokens.color.activeBackground }, toggleText: { color: tokens.color.muted, fontSize: 11, fontWeight: "800" }, toggleTextActive: { color: tokens.color.greenDark },
  live: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: tokens.color.green, borderRadius: 9, backgroundColor: tokens.color.activeBackground }, grow: { flex: 1 }, liveLabel: { color: tokens.color.green, fontSize: 10, fontWeight: "900", letterSpacing: .5 }, liveTitle: { color: tokens.color.text, fontSize: 16, fontWeight: "800", marginVertical: 3 }, muted: { color: tokens.color.muted, fontSize: 12, lineHeight: 17 }, error: { color: tokens.color.red, fontSize: 13 },
  filters: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: 10, padding: 12, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 9, backgroundColor: tokens.color.panel }, filter: { flexGrow: 1, minWidth: 112, gap: 5 }, label: { color: tokens.color.muted, fontSize: 10, fontWeight: "900", letterSpacing: .5 }, filterButton: { alignItems: "flex-start" }, clear: { color: tokens.color.greenDark, fontSize: 12, fontWeight: "800", paddingVertical: 10 }, chip: { minHeight: 30, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 999, backgroundColor: tokens.color.panelSoft }, chipSelected: { borderColor: tokens.color.chipLine, backgroundColor: tokens.color.chipBackground }, chipText: { color: tokens.color.muted, fontSize: 11, fontWeight: "800" }, chipTextSelected: { color: tokens.color.activeText },
  layerBar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, padding: 10, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 9, backgroundColor: tokens.color.panel }, layerCopy: { flex: 1, minWidth: 120 }, legend: { gap: 14, paddingHorizontal: 2, paddingVertical: 3 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 6 }, legendDot: { width: 9, height: 9, borderRadius: 5 }, legendText: { color: tokens.color.muted, fontSize: 11, fontWeight: "700" },
  mapFrame: { overflow: "hidden", borderWidth: 1, borderColor: tokens.color.line, borderRadius: 10 }, hint: { color: tokens.color.muted, textAlign: "center", fontSize: 12 }, list: { borderWidth: 1, borderColor: tokens.color.line, borderRadius: 9, overflow: "hidden" }, row: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 11, padding: 13, backgroundColor: tokens.color.panel, borderBottomWidth: 1, borderBottomColor: tokens.color.line }, pressed: { opacity: .78 }, kindDot: { width: 9, height: 9, borderRadius: 5 }, rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, kind: { color: tokens.color.greenDark, fontSize: 10, fontWeight: "900", letterSpacing: .4 }, coords: { color: tokens.color.muted, fontSize: 10 }, rowTitle: { color: tokens.color.text, fontSize: 15, fontWeight: "800", marginVertical: 3 }, chevron: { color: tokens.color.muted, fontSize: 24 },
  recordCard: { minHeight: 104, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderColor: tokens.color.green, borderRadius: 10, backgroundColor: tokens.color.activeBackground }, thumbnail: { width: 80, height: 80, borderRadius: 8, backgroundColor: tokens.color.field }, thumbnailFallback: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" }, thumbnailGlyph: { color: tokens.color.text, fontSize: 18, fontWeight: "900" }, recordTitle: { color: tokens.color.text, fontSize: 16, fontWeight: "800", marginVertical: 4 }, viewTrip: { color: tokens.color.greenDark, fontSize: 12, fontWeight: "900", marginTop: 6 },
  depthCard: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 10, backgroundColor: tokens.color.panel }, depthIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(114,167,232,.15)" }, depthIconText: { color: tokens.color.blue, fontSize: 24, fontWeight: "900" },
  densityRow: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 11, padding: 13, backgroundColor: tokens.color.panel, borderBottomWidth: 1, borderBottomColor: tokens.color.line }, densityRank: { width: 30, color: tokens.color.green, fontSize: 22, fontWeight: "900" },
});
