import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { DangerButton, EmptyState, Field, PrimaryButton, Screen, SecondaryButton, TopBar } from "../../components/ui";
import { id } from "../../domain/logbook";
import { sortedExpeditions, summarizeExpedition, tripOutsideExpedition, type ExpeditionSort } from "../../domain/services/expeditions";
import { tripHours } from "../../domain/services/duration";
import type { Expedition, Trip } from "../../domain/types";
import { useLogbook } from "../../state/logbook-context";
import { tokens } from "../../theme/tokens";

const blank: Expedition = { id: "", name: "", startDate: "", endDate: "", destination: "", notes: "" };
const sortLabels: Record<ExpeditionSort, string> = { "start-desc": "Newest first", "start-asc": "Oldest first", "name-asc": "Name A–Z" };
const sortOrder: ExpeditionSort[] = ["start-desc", "start-asc", "name-asc"];
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const formatDate = (value: string) => validDate(value) ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : value || "—";
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
const tripFish = (trip: Trip) => trip.catches.reduce((total, item) => total + Math.max(1, Number(item.quantity) || 1), 0);

export function ExpeditionsScreen() {
  const { logbook, ready, update } = useLogbook();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tablet = width >= 760;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ExpeditionSort>("start-desc");
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState<Expedition | null>(null);
  const [saving, setSaving] = useState(false);
  const sorted = useMemo(() => sortedExpeditions(logbook.expeditions, sort), [logbook.expeditions, sort]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? sorted.filter(item => [item.name, item.destination, item.notes].some(value => String(value || "").toLowerCase().includes(needle))) : sorted;
  }, [query, sorted]);
  const active = logbook.expeditions.find(item => item.id === activeId) || sortedExpeditions(logbook.expeditions)[0];
  const close = () => router.canGoBack() ? router.back() : router.replace("/(tabs)/more");
  if (!ready) return <Screen><EmptyState title="Opening expeditions…"/></Screen>;
  return <Screen contentContainerStyle={s.page}>
    <TopBar title="Expeditions" subtitle="Group trips from multi-day fishing vacations." actions={<View style={s.actions}><SecondaryButton compact label="Back" onPress={close}/><PrimaryButton compact label="New Expedition" onPress={() => setDraft({ ...blank })}/></View>}/>
    <View style={[s.workspace, tablet && s.workspaceWide]}>
      <View style={[s.rail, tablet && s.railWide]}>
        <View style={s.tools}>
          <TextInput accessibilityLabel="Search expeditions" value={query} onChangeText={setQuery} placeholder="Search expeditions" placeholderTextColor={tokens.color.muted} selectionColor={tokens.color.green} style={s.search}/>
          <Pressable accessibilityRole="button" onPress={() => setSort(current => sortOrder[(sortOrder.indexOf(current) + 1) % sortOrder.length])} style={s.sort}>
            <Text style={s.sortLabel}>SORT</Text><Text style={s.sortValue}>{sortLabels[sort]}  ›</Text>
          </Pressable>
        </View>
        {!logbook.expeditions.length ? <EmptyState title="No expeditions yet" description="Create one to group the trips from your next fishing vacation." action={<PrimaryButton label="Create Expedition" onPress={() => setDraft({ ...blank })}/>}/> : !filtered.length ? <EmptyState title="No matches" description="Try a different expedition search."/> : <ScrollView horizontal={!tablet} showsHorizontalScrollIndicator={false} contentContainerStyle={!tablet ? s.mobileList : undefined}>{filtered.map(item => <ExpeditionRow key={item.id} expedition={item} trips={logbook.trips} active={item.id === active?.id} mobile={!tablet} onPress={() => setActiveId(item.id)}/>)}</ScrollView>}
      </View>
      <View style={s.detail}>{active ? <ExpeditionDetail expedition={active} trips={logbook.trips} onEdit={() => setDraft({ ...active })} onOpenTrip={tripId => router.push(`/trip/${tripId}`)} onGoToTrips={() => router.push("/(tabs)/trips")}/> : <EmptyState title="Select an expedition" description="Choose a fishing vacation to review its trips and totals."/>}</View>
    </View>
    <ExpeditionEditor draft={draft} trips={logbook.trips} onChange={setDraft} onClose={() => setDraft(null)} saving={saving} onSave={async expedition => {
      setSaving(true);
      try {
        const exists = logbook.expeditions.some(item => item.id === expedition.id);
        await update({ ...logbook, expeditions: exists ? logbook.expeditions.map(item => item.id === expedition.id ? expedition : item) : [...logbook.expeditions, expedition] });
        setActiveId(expedition.id); setDraft(null);
      } catch (error) { Alert.alert("Expedition not saved", error instanceof Error ? error.message : String(error)); }
      finally { setSaving(false); }
    }} onDelete={expedition => {
      const memberCount = logbook.trips.filter(trip => trip.expeditionId === expedition.id).length;
      const detail = memberCount ? ` Its ${memberCount} ${memberCount === 1 ? "trip" : "trips"} will be kept and unassigned.` : "";
      Alert.alert(`Delete “${expedition.name}”?`, `This cannot be undone.${detail}`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => {
        await update({ ...logbook, expeditions: logbook.expeditions.filter(item => item.id !== expedition.id), trips: logbook.trips.map(trip => trip.expeditionId === expedition.id ? { ...trip, expeditionId: "" } : trip) });
        setActiveId(""); setDraft(null);
      } }]);
    }}/>
  </Screen>;
}

function ExpeditionRow({ expedition, trips, active, mobile, onPress }: { expedition: Expedition; trips: Trip[]; active: boolean; mobile: boolean; onPress: () => void }) {
  const count = summarizeExpedition(expedition, trips).tripCount;
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [s.row, mobile && s.rowMobile, active && s.rowActive, pressed && s.pressed]}><View style={s.rowCopy}><Text numberOfLines={1} style={s.rowTitle}>{expedition.name}</Text><Text style={s.rowDates}>{formatDate(expedition.startDate)} – {formatDate(expedition.endDate)}</Text></View><View style={s.rowCount}><Text style={s.rowCountValue}>{count}</Text><Text style={s.rowCountLabel}>{count === 1 ? "TRIP" : "TRIPS"}</Text></View></Pressable>;
}

function ExpeditionDetail({ expedition, trips, onEdit, onOpenTrip, onGoToTrips }: { expedition: Expedition; trips: Trip[]; onEdit: () => void; onOpenTrip: (id: string) => void; onGoToTrips: () => void }) {
  const summary = summarizeExpedition(expedition, trips);
  const metrics = [{ label: "TRIPS", value: summary.tripCount }, { label: "DAYS", value: summary.days }, { label: "HOURS FISHED", value: number(summary.hours) }, { label: "FISH CAUGHT", value: summary.fish }, { label: "CATCH RATE", value: number(summary.catchRate), detail: "Fish / Hour" }, { label: "SPECIES", value: summary.species }];
  return <View>
    <View style={s.detailHeader}><View style={s.detailCopy}><Text style={s.detailTitle}>{expedition.name}</Text><Text style={s.detailMeta}>{formatDate(expedition.startDate)} – {formatDate(expedition.endDate)} ({summary.days} {summary.days === 1 ? "day" : "days"})</Text>{expedition.destination ? <Text style={s.detailMeta}>{expedition.destination}</Text> : null}{expedition.notes ? <Text style={s.notes}>{expedition.notes}</Text> : null}</View><SecondaryButton compact label="Edit" onPress={onEdit}/></View>
    <View accessibilityLabel="Expedition statistics" style={s.metrics}>{metrics.map(item => <View key={item.label} style={s.metric}><Text style={s.metricLabel}>{item.label}</Text><Text style={s.metricValue}>{item.value}</Text>{item.detail ? <Text style={s.metricDetail}>{item.detail}</Text> : null}</View>)}</View>
    <View style={s.members}><Text style={s.membersTitle}>Member Trips</Text>{summary.trips.length ? summary.trips.map(trip => <TripRow key={trip.id} trip={trip} onPress={() => onOpenTrip(trip.id)}/>) : <View style={s.memberEmpty}><Text style={s.info}>i</Text><View style={s.memberEmptyCopy}><Text style={s.memberEmptyTitle}>No trips in this expedition yet.</Text><Text style={s.memberEmptyText}>Trips can be assigned to an expedition from the trip editor.</Text><SecondaryButton compact label="Go to Trips" onPress={onGoToTrips}/></View></View>}</View>
  </View>;
}

function TripRow({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const hours = tripHours(trip), fish = tripFish(trip);
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.trip, pressed && s.pressed]}><View style={s.tripTop}><View style={s.tripCopy}><Text style={s.tripTitle}>{trip.title || "Untitled trip"}</Text><Text style={s.tripMeta}>{formatDate(trip.date)} · {trip.location || "—"}</Text></View><Text style={s.chevron}>›</Text></View><View style={s.tripFacts}><Fact label="TARGET" value={trip.targetSpecies || "—"}/><Fact label="METHOD" value={trip.method || "—"}/><Fact label="HOURS" value={number(hours)}/><Fact label="FISH" value={String(fish)}/><Fact label="RATE" value={number(hours ? fish / hours : 0)}/></View></Pressable>;
}
function Fact({ label, value }: { label: string; value: string }) { return <View style={s.fact}><Text style={s.factLabel}>{label}</Text><Text numberOfLines={1} style={s.factValue}>{value}</Text></View>; }

export function ExpeditionEditor({ draft, trips, saving, onChange, onClose, onSave, onDelete }: { draft: Expedition | null; trips: Trip[]; saving: boolean; onChange: (value: Expedition) => void; onClose: () => void; onSave: (value: Expedition) => Promise<void>; onDelete?: (value: Expedition) => void }) {
  const [error, setError] = useState("");
  useEffect(() => setError(""), [draft?.id]);
  if (!draft) return null;
  const editing = Boolean(draft.id);
  const patch = (key: keyof Expedition, value: string) => { setError(""); onChange({ ...draft, [key]: value }); };
  const submit = () => {
    const expedition = { ...draft, id: draft.id || id(), name: draft.name.trim(), destination: draft.destination?.trim() || "", notes: draft.notes?.trim() || "" };
    if (!expedition.name) { setError("Name is required."); return; }
    if (!validDate(expedition.startDate) || !validDate(expedition.endDate)) { setError("Enter valid start and end dates as YYYY-MM-DD."); return; }
    if (expedition.endDate < expedition.startDate) { setError("End date must be on or after the start date."); return; }
    const outside = trips.filter(trip => trip.expeditionId === expedition.id && tripOutsideExpedition(trip, expedition));
    if (outside.length) { Alert.alert("Trips outside date range", `${outside.length} assigned ${outside.length === 1 ? "trip falls" : "trips fall"} outside this date range. Save anyway?`, [{ text: "Cancel", style: "cancel" }, { text: "Save Anyway", onPress: () => onSave(expedition) }]); return; }
    onSave(expedition);
  };
  return <Modal animationType="slide" presentationStyle="pageSheet" visible onRequestClose={onClose}><Screen contentContainerStyle={s.editorPage}><TopBar title={editing ? "Edit Expedition" : "New Expedition"} subtitle="Group the trips from a multi-day fishing vacation." actions={<SecondaryButton compact label="Close" onPress={onClose}/>}/><View style={s.editor}><Field label="Name" value={draft.name} onChangeText={value => patch("name", value)} maxLength={120} placeholder="Lake Erie Summer Week"/><View style={s.dateFields}><Field label="Start date" value={draft.startDate} onChangeText={value => patch("startDate", value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" containerStyle={s.dateField}/><Field label="End date" value={draft.endDate} onChangeText={value => patch("endDate", value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" containerStyle={s.dateField}/></View><Field label="Destination" value={draft.destination || ""} onChangeText={value => patch("destination", value)} maxLength={160} placeholder="Lake Erie · Barcelona, NY"/><Field label="Notes" value={draft.notes || ""} onChangeText={value => patch("notes", value)} multiline placeholder="Who came, what you targeted, and what made the week memorable"/>{error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}<View style={s.editorActions}>{editing && onDelete ? <DangerButton label="Delete" onPress={() => onDelete(draft)}/> : <View/>}<View style={s.actions}><SecondaryButton label="Cancel" onPress={onClose}/><PrimaryButton label="Save Expedition" loading={saving} onPress={submit}/></View></View></View></Screen></Modal>;
}

const s = StyleSheet.create({
  page:{gap:0},actions:{flexDirection:"row",flexWrap:"wrap",gap:8},workspace:{overflow:"hidden",borderWidth:1,borderColor:tokens.color.line,borderRadius:8,backgroundColor:tokens.color.panel},workspaceWide:{flexDirection:"row",minHeight:620},rail:{backgroundColor:tokens.color.panelSoft,borderBottomWidth:1,borderBottomColor:tokens.color.line},railWide:{width:310,borderBottomWidth:0,borderRightWidth:1,borderRightColor:tokens.color.line},tools:{gap:10,padding:14,borderBottomWidth:1,borderBottomColor:tokens.color.line},search:{height:40,borderWidth:1,borderColor:tokens.color.line,borderRadius:8,backgroundColor:tokens.color.field,color:tokens.color.text,paddingHorizontal:12,fontSize:14},sort:{minHeight:34,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},sortLabel:{color:tokens.color.muted,fontSize:11,fontWeight:"900"},sortValue:{color:tokens.color.text,fontSize:13,fontWeight:"700"},mobileList:{alignItems:"stretch"},row:{minHeight:74,flexDirection:"row",alignItems:"center",gap:12,paddingVertical:13,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:tokens.color.line},rowMobile:{width:285,borderBottomWidth:0,borderRightWidth:1,borderRightColor:tokens.color.line},rowActive:{borderLeftWidth:3,borderLeftColor:tokens.color.green,backgroundColor:tokens.color.activeBackground,paddingLeft:13},pressed:{backgroundColor:tokens.color.hover},rowCopy:{flex:1,gap:5},rowTitle:{color:tokens.color.text,fontSize:14,fontWeight:"800"},rowDates:{color:tokens.color.muted,fontSize:11},rowCount:{alignItems:"center",gap:2},rowCountValue:{color:tokens.color.text,fontSize:17,fontWeight:"900"},rowCountLabel:{color:tokens.color.muted,fontSize:9,fontWeight:"900"},detail:{flex:1,minWidth:0,backgroundColor:tokens.color.panel},detailHeader:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:16,padding:20},detailCopy:{flex:1,gap:7},detailTitle:{color:tokens.color.text,fontSize:28,fontWeight:"800",letterSpacing:-.4},detailMeta:{color:tokens.color.muted,fontSize:13,fontWeight:"700"},notes:{color:tokens.color.text,fontSize:14,lineHeight:21},metrics:{flexDirection:"row",flexWrap:"wrap",marginHorizontal:20,marginBottom:20,borderLeftWidth:1,borderTopWidth:1,borderColor:tokens.color.line,borderRadius:7,overflow:"hidden"},metric:{width:"33.3333%",minHeight:94,alignItems:"center",justifyContent:"center",padding:10,borderRightWidth:1,borderBottomWidth:1,borderColor:tokens.color.line,backgroundColor:tokens.color.panelSoft,gap:4},metricLabel:{color:tokens.color.muted,fontSize:9,fontWeight:"900",textAlign:"center"},metricValue:{color:tokens.color.text,fontSize:24,fontWeight:"900"},metricDetail:{color:tokens.color.muted,fontSize:10,fontWeight:"700"},members:{borderTopWidth:1,borderTopColor:tokens.color.line,padding:18,gap:10},membersTitle:{color:tokens.color.text,fontSize:14,fontWeight:"800"},memberEmpty:{minHeight:120,flexDirection:"row",alignItems:"flex-start",gap:14,padding:18,borderWidth:1,borderStyle:"dashed",borderColor:tokens.color.line,borderRadius:7,backgroundColor:tokens.color.panelSoft},info:{width:32,height:32,borderWidth:2,borderColor:tokens.color.muted,borderRadius:16,color:tokens.color.muted,textAlign:"center",lineHeight:27,fontWeight:"900"},memberEmptyCopy:{flex:1,gap:7},memberEmptyTitle:{color:tokens.color.text,fontWeight:"800"},memberEmptyText:{color:tokens.color.muted,lineHeight:19},trip:{gap:10,padding:13,borderWidth:1,borderColor:tokens.color.line,borderRadius:7,backgroundColor:tokens.color.panelSoft},tripTop:{flexDirection:"row",alignItems:"center"},tripCopy:{flex:1,gap:3},tripTitle:{color:tokens.color.activeText,fontSize:15,fontWeight:"800"},tripMeta:{color:tokens.color.muted,fontSize:12},chevron:{color:tokens.color.greenDark,fontSize:25},tripFacts:{flexDirection:"row",flexWrap:"wrap",borderTopWidth:1,borderTopColor:tokens.color.line,paddingTop:9},fact:{minWidth:76,flex:1,gap:2},factLabel:{color:tokens.color.muted,fontSize:9,fontWeight:"900"},factValue:{color:tokens.color.text,fontSize:12,fontWeight:"700"},editorPage:{gap:16},editor:{gap:14,padding:18,borderWidth:1,borderColor:tokens.color.line,borderRadius:8,backgroundColor:tokens.color.panel},dateFields:{flexDirection:"row",gap:10},dateField:{flex:1},error:{color:"#ffaaa6",fontSize:13,fontWeight:"700"},editorActions:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginTop:4},
});
