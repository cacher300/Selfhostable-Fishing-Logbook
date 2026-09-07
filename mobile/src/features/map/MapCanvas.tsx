import { StyleSheet, Text, View } from "react-native";
import type { MapType } from "react-native-maps";
import type { Coordinates } from "../../domain/types";
import { tokens } from "../../theme/tokens";
import type { MapPoint } from "./map-model";

export type { MapPoint } from "./map-model";

export function MapCanvas({ points }: { points: MapPoint[]; selectedId?: string; colorByYear?: boolean; showNoaaCharts?: boolean; mapType?: MapType; onSelect?: (point: MapPoint) => void; onInspect?: (coordinates: Coordinates) => void }) {
  return <View style={styles.map}><Text style={styles.title}>Native map preview</Text><Text style={styles.text}>{points.length} geotagged records. Interactive basemaps are enabled in the Android and iOS builds.</Text></View>;
}

const styles = StyleSheet.create({ map: { height: 320, alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: tokens.color.panelSoft, borderWidth: 1, borderColor: tokens.color.line }, title: { color: tokens.color.text, fontWeight: "800", fontSize: 18 }, text: { color: tokens.color.muted, textAlign: "center", marginTop: 8, maxWidth: 360 } });
