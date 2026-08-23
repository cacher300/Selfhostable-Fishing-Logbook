import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../../theme/tokens";
import type { MapPoint } from "./MapCanvas.native";
export function MapCanvas({points}:{points:MapPoint[]}){return <View style={s.map}><Text style={s.title}>Native map preview</Text><Text style={s.text}>{points.length} geotagged records. Interactive basemaps are enabled in the Android and iOS builds.</Text></View>}
const s=StyleSheet.create({map:{height:320,alignItems:"center",justifyContent:"center",padding:30,backgroundColor:tokens.color.panelSoft,borderWidth:1,borderColor:tokens.color.line},title:{color:tokens.color.text,fontWeight:"800",fontSize:18},text:{color:tokens.color.muted,textAlign:"center",marginTop:8,maxWidth:360}});
