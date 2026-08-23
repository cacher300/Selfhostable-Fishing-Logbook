import MapView, { Marker } from "react-native-maps";
import { StyleSheet } from "react-native";
export type MapPoint={id:string;latitude:number;longitude:number;title:string;subtitle?:string};
export function MapCanvas({points,onSelect}:{points:MapPoint[];onSelect:(point:MapPoint)=>void}){
  const first=points[0]||{latitude:43.4,longitude:-79.4};
  return <MapView style={s.map} initialRegion={{latitude:first.latitude,longitude:first.longitude,latitudeDelta:.8,longitudeDelta:.8}}>{points.map(point=><Marker key={point.id} coordinate={point} title={point.title} description={point.subtitle} onPress={()=>onSelect(point)}/>)}</MapView>;
}
const s=StyleSheet.create({map:{height:420,width:"100%"}});
