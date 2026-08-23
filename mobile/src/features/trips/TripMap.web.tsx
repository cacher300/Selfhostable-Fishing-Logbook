import { StyleSheet, Text, View } from "react-native";
import type { Trip } from "../../domain/types";
import { tokens } from "../../theme/tokens";

export function TripMap({ trip }: { trip: Trip }) {
  return <View style={s.empty}><Text style={s.text}>{trip.coordinates ? "Maps are available in the iOS and Android app." : "Save trip GPS in the editor to show this trip on a map."}</Text></View>;
}

const s = StyleSheet.create({ empty:{paddingVertical:10},text:{color:tokens.color.muted,fontSize:14,lineHeight:20} });
