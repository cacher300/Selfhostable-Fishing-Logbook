import { Tabs, useRouter } from "expo-router";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useLogbook } from "../../src/state/logbook-context";
import { tokens } from "../../src/theme/tokens";

export default function TabLayout() {
  const { activeTrip } = useLogbook();
  const router = useRouter();
  const compact = useWindowDimensions().width < 720;
  return <View style={{flex:1,backgroundColor:tokens.color.background}}>
    <Tabs screenOptions={{headerShown:false,sceneStyle:{backgroundColor:tokens.color.background},tabBarStyle:{backgroundColor:tokens.color.panel,borderTopColor:tokens.color.line,height:64,paddingTop:8},tabBarActiveTintColor:tokens.color.green,tabBarInactiveTintColor:tokens.color.muted,tabBarLabelStyle:{fontSize:12,fontWeight:"800",paddingBottom:8},tabBarIcon:()=>null,tabBarIconStyle:{display:"none"}}}>
      <Tabs.Screen name="trips" options={{title:"Trips"}}/>
      <Tabs.Screen name="stats" options={{title:"Stats"}}/>
      <Tabs.Screen name="map" options={{title:"Map"}}/>
      <Tabs.Screen name="gear" options={{title:"Gear"}}/>
      <Tabs.Screen name="more" options={{title:"More"}}/>
      <Tabs.Screen name="live" options={{href:null}}/>
    </Tabs>
    {activeTrip&&compact ? <Pressable accessibilityRole="button" onPress={()=>router.push("/live")} style={{position:"absolute",left:8,right:8,bottom:66,minHeight:54,paddingHorizontal:14,borderRadius:8,backgroundColor:tokens.color.activeBackground,borderWidth:1,borderColor:tokens.color.green,flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
      <View><Text style={{color:tokens.color.green,fontSize:11,fontWeight:"900"}}>● LIVE · {activeTrip.startTime||activeTrip.linesSetTime}</Text><Text style={{color:tokens.color.text,fontSize:14,fontWeight:"800"}} numberOfLines={1}>{activeTrip.location||activeTrip.title}</Text></View>
      <Text style={{color:tokens.color.text,fontWeight:"800"}}>{activeTrip.catches.length} landed · Open ›</Text>
    </Pressable>:null}
  </View>;
}
