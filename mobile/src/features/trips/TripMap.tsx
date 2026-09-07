import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { Trip } from "../../domain/types";
import { tokens } from "../../theme/tokens";

export function TripMap({ trip }: { trip: Trip }) {
  const coordinates = trip.coordinates;
  if (!coordinates) return <View style={styles.empty}><Text style={styles.emptyText}>Save trip GPS in the editor to show this trip on a map.</Text></View>;
  return <View style={styles.frame}>
    <MapView style={styles.map} initialRegion={{ ...coordinates, latitudeDelta: 0.04, longitudeDelta: 0.04 }} mapType="standard" toolbarEnabled={false} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} pointerEvents="none" accessibilityLabel={`Map preview for ${trip.title || trip.location || "trip"}`}>
      <Marker coordinate={coordinates} title={trip.title || trip.location || "Trip location"} pinColor={tokens.color.green} />
    </MapView>
    <View pointerEvents="none" style={styles.caption}><Text style={styles.captionText}>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</Text></View>
  </View>;
}

const styles = StyleSheet.create({ frame: { height: 230, borderRadius: 12, overflow: "hidden", backgroundColor: tokens.color.field }, map: { flex: 1 }, caption: { position: "absolute", left: 10, bottom: 10, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, backgroundColor: "rgba(10,18,27,0.86)" }, captionText: { color: tokens.color.text, fontSize: 11, fontWeight: "700" }, empty: { paddingVertical: 10 }, emptyText: { color: tokens.color.muted, fontSize: 14, lineHeight: 20 } });
