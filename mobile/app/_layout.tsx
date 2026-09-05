import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogbookProvider } from "../src/state/logbook-context";

export default function RootLayout() {
  return <LogbookProvider><StatusBar style="light" /><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:"#0e141b"}}}><Stack.Screen name="index"/><Stack.Screen name="(tabs)"/><Stack.Screen name="expeditions"/><Stack.Screen name="trip/[id]" options={{presentation:"modal"}}/><Stack.Screen name="trip/[id]/edit" options={{presentation:"modal"}}/><Stack.Screen name="trip/[id]/share" options={{presentation:"modal"}}/><Stack.Screen name="trip/new" options={{presentation:"modal"}}/><Stack.Screen name="gear/[kind]"/><Stack.Screen name="settings/[section]"/></Stack></LogbookProvider>;
}
