import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Overlay, type MapPressEvent, type MapType, type Region } from "react-native-maps";
import type { Coordinates } from "../../domain/types";
import type { MapPoint } from "./map-model";

export type { MapPoint } from "./map-model";

type Props = {
  points: MapPoint[];
  selectedId?: string;
  colorByYear?: boolean;
  showNoaaCharts?: boolean;
  mapType?: MapType;
  onSelect: (point: MapPoint) => void;
  onInspect?: (coordinates: Coordinates) => void;
};

type MarkerGroup = { id: string; latitude: number; longitude: number; points: MapPoint[] };
const FALLBACK_REGION: Region = { latitude: 43.8, longitude: -79.5, latitudeDelta: 4.5, longitudeDelta: 4.5 };
const FIT_PADDING = { top: 54, right: 44, bottom: 54, left: 44 };
const NOAA_CHART_SERVICE = "https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/NOAAChartDisplay/MapServer/exts/MaritimeChartService/MapServer/export";

function initialRegion(points: readonly MapPoint[]): Region {
  if (!points.length) return FALLBACK_REGION;
  const latitudes = points.map(point => point.latitude);
  const longitudes = points.map(point => point.longitude);
  const minLatitude = Math.min(...latitudes), maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes), maxLongitude = Math.max(...longitudes);
  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.35, 0.025),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.35, 0.025),
  };
}

function groupMarkers(points: readonly MapPoint[], region: Region): MarkerGroup[] {
  if (points.length < 2) return points.map(point => ({ id: point.id, latitude: point.latitude, longitude: point.longitude, points: [point] }));
  const latitudeCell = Math.max(region.latitudeDelta / 10, 0.00035);
  const longitudeCell = Math.max(region.longitudeDelta / 10, 0.00035);
  const groups = new Map<string, { latitude: number; longitude: number; points: MapPoint[] }>();
  points.forEach(point => {
    const key = `${Math.round(point.latitude / latitudeCell)}:${Math.round(point.longitude / longitudeCell)}`;
    const group = groups.get(key) || { latitude: 0, longitude: 0, points: [] };
    group.latitude += point.latitude;
    group.longitude += point.longitude;
    group.points.push(point);
    groups.set(key, group);
  });
  return [...groups.entries()].map(([key, group]) => ({
    id: group.points.length === 1 ? group.points[0].id : `cluster-${key}`,
    latitude: group.latitude / group.points.length,
    longitude: group.longitude / group.points.length,
    points: group.points,
  }));
}

function noaaOverlay(region: Region) {
  const south = Math.max(-85, region.latitude - region.latitudeDelta / 2);
  const north = Math.min(85, region.latitude + region.latitudeDelta / 2);
  const west = Math.max(-180, region.longitude - region.longitudeDelta / 2);
  const east = Math.min(180, region.longitude + region.longitudeDelta / 2);
  const params = new URLSearchParams({
    bbox: `${west},${south},${east},${north}`,
    bboxSR: "4326",
    imageSR: "4326",
    size: "1024,1024",
    dpi: "144",
    format: "png32",
    transparent: "true",
    layers: "show:0,1,2,3,4,5,6,7",
    f: "image",
  });
  return {
    uri: `${NOAA_CHART_SERVICE}?${params}`,
    bounds: [[south, west], [north, east]] as [[number, number], [number, number]],
  };
}

export function MapCanvas({ points, selectedId, colorByYear = true, showNoaaCharts = false, mapType = "standard", onSelect, onInspect }: Props) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [region, setRegion] = useState<Region>(() => initialRegion(points));
  const pointSignature = useMemo(() => points.map(point => `${point.id}:${point.latitude}:${point.longitude}`).join("|"), [points]);
  const groups = useMemo(() => groupMarkers(points, region), [points, region.latitudeDelta, region.longitudeDelta]);
  const chart = useMemo(() => noaaOverlay(region), [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);

  useEffect(() => {
    if (!ready || !points.length) return;
    if (points.length === 1) {
      map.current?.animateToRegion(initialRegion(points), 280);
      return;
    }
    map.current?.fitToCoordinates(points, { edgePadding: FIT_PADDING, animated: true });
  }, [pointSignature, ready]);

  const inspect = (event: MapPressEvent) => onInspect?.(event.nativeEvent.coordinate);
  const openGroup = (group: MarkerGroup) => {
    if (group.points.length === 1) return onSelect(group.points[0]);
    map.current?.fitToCoordinates(group.points, { edgePadding: FIT_PADDING, animated: true });
  };

  return <MapView ref={map} style={styles.map} initialRegion={initialRegion(points)} mapType={mapType} onMapReady={() => setReady(true)} onRegionChangeComplete={setRegion} onPress={inspect} toolbarEnabled={false} loadingEnabled showsCompass showsScale accessibilityLabel="Fishing records map">
    {showNoaaCharts ? <Overlay key={chart.uri} image={{ uri: chart.uri }} bounds={chart.bounds} opacity={0.88} /> : null}
    {groups.map(group => {
      const point = group.points[0];
      const clustered = group.points.length > 1;
      const selected = !clustered && point.id === selectedId;
      const fill = clustered ? "#151d26" : point.fillColor;
      const outline = colorByYear && !clustered ? point.outlineColor : selected ? "#edf4fb" : "#0b1118";
      const glyph = clustered ? group.points.length : point.kind === "Catch" ? "●" : point.kind === "Lost fish" ? "×" : point.kind === "Photo" ? "▣" : point.kind === "Video" ? "▶" : point.kind === "Trip" ? "◆" : "•";
      const renderKey = `${group.id}-${group.points.map(item => item.id).join(".")}-${fill}-${outline}-${selected ? "selected" : "idle"}`;
      return <Marker key={renderKey} coordinate={{ latitude: group.latitude, longitude: group.longitude }} title={clustered ? `${group.points.length} mapped records` : point.title} description={clustered ? "Tap to zoom in" : point.subtitle} accessibilityLabel={clustered ? `${group.points.length} mapped records. Double tap to zoom in.` : `${point.kind}: ${point.title}`} onPress={event => { event.stopPropagation(); openGroup(group); }} tracksViewChanges={selected}>
        <View style={[styles.marker, clustered && styles.cluster, selected && styles.markerSelected, { backgroundColor: fill, borderColor: outline }]}><Text style={[styles.markerText, !clustered && styles.pointText]}>{glyph}</Text></View>
      </Marker>;
    })}
  </MapView>;
}

const styles = StyleSheet.create({
  map: { height: 450, width: "100%" },
  marker: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 3, shadowColor: "#000", shadowOpacity: 0.38, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  markerSelected: { width: 30, height: 30, borderRadius: 15, borderWidth: 4 },
  cluster: { width: 38, height: 38, borderRadius: 19, borderColor: "#38b878", borderWidth: 3 },
  markerText: { color: "#edf4fb", fontSize: 12, fontWeight: "900" },
  pointText: { fontSize: 10 },
});
