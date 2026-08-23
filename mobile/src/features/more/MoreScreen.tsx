import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Panel, Screen, TopBar } from "../../components/ui";
import { mediaReferences } from "../../domain/analytics";
import { useLogbook } from "../../state/logbook-context";
import { tokens } from "../../theme/tokens";
const groups=[
  {title:"Library",items:[["Gallery & Capture Inbox","/gallery"],["Settings & Units","/settings/general"],["Predefined Fields","/settings/fields"],["Waterbodies & Launches","/settings/locations"]]},
  {title:"Data",items:[["Import, Export & Backups","/settings/data"],["Weather, Marine & Depth","/settings/environment"],["Storage & Diagnostics","/settings/diagnostics"]]},
];
export function MoreScreen(){const router=useRouter(),{logbook}=useLogbook();const media=mediaReferences(logbook);return <Screen><TopBar title="More" subtitle="Media, settings, and data tools"/>{groups.map(group=><Panel key={group.title} title={group.title}>{group.items.map(([label,path])=><Pressable key={label} onPress={()=>router.push(path as never)} style={s.row}><Text style={s.title}>{label}</Text>{label.startsWith("Gallery")?<Badge>{media.length}</Badge>:null}<Text style={s.chevron}>›</Text></Pressable>)}</Panel>)}</Screen>}
const s=StyleSheet.create({row:{minHeight:52,flexDirection:"row",alignItems:"center",gap:10,borderBottomWidth:1,borderColor:tokens.color.line},title:{flex:1,color:tokens.color.text,fontWeight:"700"},chevron:{color:tokens.color.greenDark,fontSize:24}});
