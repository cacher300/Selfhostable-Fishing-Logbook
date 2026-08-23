import { Platform, StyleSheet, Text, View } from "react-native";
import { AppleMaps, GoogleMaps } from "expo-maps";
import type { Trip } from "../../domain/types";
import { tokens } from "../../theme/tokens";

export function TripMap({ trip }: { trip: Trip }) {
  const coordinates = trip.coordinates;
  if (!coordinates) return <View style={s.empty}><Text style={s.emptyText}>Save trip GPS in the editor to show this trip on a map.</Text></View>;
  const cameraPosition = { coordinates, zoom: 13 };
  const marker = { id: trip.id, coordinates, title: trip.title || trip.location || "Trip location" };
  return <View style={s.frame}>
    {Platform.OS === "ios"
      ? <AppleMaps.View style={s.map} colorScheme={AppleMaps.MapColorScheme.DARK} cameraPosition={cameraPosition} markers={[{ ...marker, tintColor: "#37c887", systemImage: "fish" }]}/>
      : <GoogleMaps.View style={s.map} colorScheme={GoogleMaps.MapColorScheme.DARK} cameraPosition={cameraPosition} markers={[marker]}/>}
    <View pointerEvents="none" style={s.caption}><Text style={s.captionText}>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</Text></View>
  </View>;
}

const s = StyleSheet.create({ frame:{height:230,borderRadius:12,overflow:"hidden",backgroundColor:tokens.color.field},map:{flex:1},caption:{position:"absolute",left:10,bottom:10,paddingHorizontal:9,paddingVertical:6,borderRadius:7,backgroundColor:"rgba(10,18,27,0.86)"},captionText:{color:tokens.color.text,fontSize:11,fontWeight:"700"},empty:{paddingVertical:10},emptyText:{color:tokens.color.muted,fontSize:14,lineHeight:20} });
