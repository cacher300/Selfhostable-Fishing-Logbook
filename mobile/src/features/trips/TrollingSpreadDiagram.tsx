import { useMemo, useState } from "react";
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import { fishCount } from "../../domain/services/duration";
import { gearName } from "../../domain/services/setup-resolution";
import type { Logbook, SetupLine, Trip } from "../../domain/types";

const boat = require("../../../assets/trolling-boat.png");
const canonical = (value?: string) => String(value || "").trim().toLowerCase().replaceAll(" ", "-");
type Side = "port" | "center" | "starboard";
type Kind = "board" | "diver" | "rigger" | "chute";
type Group = { key: string; side: Side; kind: Kind; rank: number; label: string; lines: SetupLine[] };

function classify(line: SetupLine): Omit<Group, "key" | "lines"> {
  const presentation = canonical(line.presentation);
  const requestedSide = canonical(line.side);
  const side: Side = requestedSide === "port" || requestedSide === "starboard" || requestedSide === "center" ? requestedSide : "center";
  if (presentation === "chute-rod" || presentation === "flatline") return { side: "center", kind: "chute", rank: 5, label: "Chute Rod" };
  if (presentation.includes("outside")) return { side, kind: "board", rank: 0, label: "Outside Board" };
  if (presentation.includes("inside")) return { side, kind: "board", rank: 1, label: "Inside Board" };
  if (presentation.includes("high") || presentation === "dipsey-diver") return { side, kind: "diver", rank: 2, label: "High Diver" };
  if (presentation.includes("low")) return { side, kind: "diver", rank: 3, label: "Low Diver" };
  return { side: side === "center" ? "port" : side, kind: "rigger", rank: 4, label: "Downrigger" };
}

function spreadGroups(lines: SetupLine[]): Group[] {
  const grouped = new Map<string, Group>();
  lines.forEach(line => {
    const config = classify(line);
    const key = `${config.side}:${config.label}`;
    const group = grouped.get(key);
    if (group) group.lines.push(line); else grouped.set(key, { key, ...config, lines: [line] });
  });
  return [...grouped.values()].sort((a, b) => a.rank - b.rank);
}

export function TrollingSpreadDiagram({ trip, logbook }: { trip: Trip; logbook: Logbook }) {
  const [width, setWidth] = useState(0);
  const groups = useMemo(() => spreadGroups(trip.gearUsed), [trip.gearUsed]);
  const sideCount = Math.max(groups.filter(group => group.side === "port").length, groups.filter(group => group.side === "starboard").length);
  const height = Math.max(680, 410 + sideCount * 104);
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));
  return <View accessibilityRole="image" accessibilityLabel="Vertical trolling spread diagram" onLayout={onLayout} style={[s.canvas, { height }]}>
    <Text style={s.direction}>↑  TRAVEL</Text>
    <Image source={boat} resizeMode="contain" style={s.boat}/>
    {width ? <SpreadLines groups={groups} trip={trip} logbook={logbook} width={width} height={height}/> : null}
    {!groups.length ? <Text style={s.empty}>Add trolling setup lines to preview the spread.</Text> : null}
  </View>;
}

function SpreadLines({ groups, trip, logbook, width, height }: { groups: Group[]; trip: Trip; logbook: Logbook; width: number; height: number }) {
  const port = groups.filter(group => group.side === "port");
  const starboard = groups.filter(group => group.side === "starboard");
  const center = groups.filter(group => group.side === "center");
  return <>{groups.map(group => {
    const column = group.side === "port" ? port : group.side === "starboard" ? starboard : center;
    const index = column.indexOf(group);
    const cardWidth = Math.min(156, width * .43);
    const cardLeft = group.side === "port" ? 8 : group.side === "starboard" ? width - cardWidth - 8 : (width - cardWidth) / 2;
    const cardTop = group.side === "center" ? height - 76 - index * 68 : 390 + index * 104;
    const endX = cardLeft + cardWidth / 2;
    const endY = cardTop;
    const sourceY = group.kind === "chute" ? 180 : group.kind === "rigger" ? 245 : ({ 0: 92, 1: 123, 2: 147, 3: 171 } as Record<number, number>)[group.rank] || 147;
    const sourceOffset = group.kind === "rigger" ? 70 : group.kind === "chute" ? 0 : 35;
    const startX = group.side === "port" ? width / 2 - sourceOffset : group.side === "starboard" ? width / 2 + sourceOffset : width / 2;
    const startY = sourceY;
    const bendX = endX;
    const bendY = Math.min(endY - 34, startY + 96);
    const points = group.side === "center" || group.kind === "rigger" ? `${startX},${startY} ${endX},${endY}` : `${startX},${startY} ${bendX},${bendY} ${endX},${endY}`;
    const marker = group.side === "center" || group.kind === "rigger" ? { x: endX, y: endY } : { x: bendX, y: bendY };
    const nameLeft = group.side === "port" ? Math.max(5, bendX - 42) : group.side === "starboard" ? Math.min(width - 88, bendX - 42) : width / 2 - 42;
    return <View key={group.key} style={[StyleSheet.absoluteFill, s.noPointer]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}><Polyline points={points} fill="none" stroke="#334155" strokeWidth={2}/>{group.lines.some(line => line.hasCheater) ? <Line x1={startX} y1={startY + 18} x2={endX} y2={endY + 22} stroke="#334155" strokeWidth={1.5}/> : null}</Svg>
      {group.kind !== "rigger" && group.kind !== "chute" ? <View style={[s.marker, s[group.kind], { left: marker.x - 7, top: marker.y - 7 }]}/> : null}
      <Text style={[s.inlineName, { left: nameLeft, top: Math.max(startY + 18, bendY - 24) }]}>{group.label}</Text>
      <SpreadCard group={group} trip={trip} logbook={logbook} style={{ left: cardLeft, top: cardTop, width: cardWidth }}/>
    </View>;
  })}</>;
}

function SpreadCard({ group, trip, logbook, style }: { group: Group; trip: Trip; logbook: Logbook; style: { left: number; top: number; width: number } }) {
  const landed = group.lines.reduce((sum, line) => sum + trip.catches.filter(fish => fish.setupLineId === line.id).reduce((count, fish) => count + fishCount(fish), 0), 0);
  const lost = group.lines.reduce((sum, line) => sum + trip.lostFish.filter(fish => fish.setupLineId === line.id).length, 0);
  const gear = [...new Set(group.lines.flatMap(line => [gearName(logbook, "lure", line.lureId), gearName(logbook, "flasher", line.flasherId)]).filter(Boolean))].join(" + ");
  return <View style={[s.card, style]}><Text numberOfLines={1} style={s.cardTitle}>{group.lines.length > 1 ? `${group.lines.length} rods · ${group.label}` : group.lines[0].lineLabel || group.label}</Text>{gear ? <Text numberOfLines={2} style={s.cardDetail}>{gear}</Text> : null}{landed || lost ? <Text style={s.cardStat}>{[landed ? `${landed} fish` : "", lost ? `${lost} lost` : ""].filter(Boolean).join(" · ")}</Text> : null}</View>;
}

const s = StyleSheet.create({
  canvas:{position:"relative",overflow:"hidden",borderRadius:14,backgroundColor:"#dff3fb",borderWidth:1,borderColor:"#9bc5d4"},
  noPointer:{pointerEvents:"none"},
  boat:{position:"absolute",width:250,height:134,top:84,left:"50%",marginLeft:-125,transform:[{rotate:"90deg"},{scaleY:-1}]},
  direction:{position:"absolute",zIndex:5,top:12,left:0,right:0,textAlign:"center",color:"#31505f",fontSize:10,fontWeight:"900",letterSpacing:.8},
  empty:{position:"absolute",top:365,left:24,right:24,color:"#31505f",fontSize:13,fontWeight:"700",textAlign:"center"},
  marker:{position:"absolute",zIndex:4,width:14,height:14,borderWidth:2,borderColor:"#fff",backgroundColor:"#475569"},
  board:{width:12,height:25,borderRadius:4,borderWidth:1,borderColor:"#92400e",backgroundColor:"#f59e0b",transform:[{rotate:"90deg"}]},diver:{borderRadius:8,backgroundColor:"#111827"},rigger:{transform:[{rotate:"45deg"}]},chute:{borderRadius:8,backgroundColor:"#0f766e"},
  inlineName:{position:"absolute",zIndex:5,width:84,paddingHorizontal:4,paddingVertical:2,borderRadius:4,backgroundColor:"rgba(223,243,251,.94)",color:"#111827",fontSize:9,fontWeight:"900",textAlign:"center"},
  card:{position:"absolute",zIndex:5,minHeight:54,paddingHorizontal:8,paddingVertical:7,borderRadius:7,backgroundColor:"rgba(255,255,255,.95)",borderWidth:1,borderColor:"#aac9d5"},
  cardTitle:{color:"#111827",fontSize:10,fontWeight:"900"},cardDetail:{color:"#111827",fontSize:9,fontWeight:"800",lineHeight:12,marginTop:2},cardStat:{color:"#08734d",fontSize:9,fontWeight:"900",marginTop:3},
});
