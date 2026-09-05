import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Field, Panel, PrimaryButton, SecondaryButton } from "../../components/ui";
import { id, usableCoordinates } from "../../domain/logbook";
import { useLogbook } from "../../state/logbook-context";
import { tokens } from "../../theme/tokens";

const blank = { id: "", name: "", startDate: "", endDate: "", destination: "", notes: "", latitude: "", longitude: "", radiusMeters: "100" };

/** Desktop reference records use the same IDs in mobile trip and catch pickers. */
export function ReferenceLibrary({ kind }: { kind: "expeditions" | "spots" }) {
  const { logbook, update } = useLogbook();
  const [draft, setDraft] = useState(blank);
  const [saving, setSaving] = useState(false);
  const expedition = kind === "expeditions";
  const fields = expedition
    ? [["name", "Name"], ["startDate", "Start date (YYYY-MM-DD)"], ["endDate", "End date (YYYY-MM-DD)"], ["destination", "Destination"], ["notes", "Notes"]]
    : [["name", "Name"], ["latitude", "Latitude"], ["longitude", "Longitude"], ["radiusMeters", "Radius (25–500 meters)"]];
  const save = async () => {
    if (!draft.name.trim()) { Alert.alert("Name required"); return; }
    if (logbook[kind].some(item => item.id !== draft.id && item.name.toLowerCase() === draft.name.trim().toLowerCase())) { Alert.alert("Name already exists"); return; }
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const coordinates = usableCoordinates({ latitude: draft.latitude, longitude: draft.longitude });
    const radiusMeters = Number(draft.radiusMeters);
    if (expedition && (!validDate(draft.startDate) || !validDate(draft.endDate) || draft.endDate < draft.startDate)) { Alert.alert("Check dates", "Enter valid dates with the end on or after the start."); return; }
    if (!expedition && (!draft.latitude.trim() || !draft.longitude.trim() || !coordinates || !Number.isFinite(radiusMeters) || radiusMeters < 25 || radiusMeters > 500)) { Alert.alert("Check spot", "Enter valid coordinates and a radius between 25 and 500 meters."); return; }
    const existing = logbook[kind].find(item => item.id === draft.id);
    const base = { ...existing, id: draft.id || id(), name: draft.name.trim() };
    setSaving(true);
    try {
      if (expedition) {
        const entry = { ...base, startDate: draft.startDate, endDate: draft.endDate, destination: draft.destination, notes: draft.notes };
        await update({ ...logbook, expeditions: existing ? logbook.expeditions.map(item => item.id === entry.id ? entry : item) : [...logbook.expeditions, entry] });
      } else if (coordinates) {
        const entry = { ...base, coordinates, radiusMeters };
        await update({ ...logbook, spots: existing ? logbook.spots.map(item => item.id === entry.id ? entry : item) : [...logbook.spots, entry] });
      }
      setDraft(blank);
    } catch (error) { Alert.alert("Not saved", error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  return <View style={{ gap: 16 }}>
    <Panel title={`${draft.id ? "Edit" : "Add"} ${expedition ? "expedition" : "fishing spot"}`} subtitle={expedition ? "Group trips from the same fishing vacation." : "Catches can match the nearest spot within its radius using GPS."}>
      {fields.map(([key, label]) => <Field key={key} label={label} value={draft[key as keyof typeof blank]} onChangeText={value => setDraft(current => ({ ...current, [key]: value }))} multiline={key === "notes"}/>)}
      <PrimaryButton label="Save" onPress={save} loading={saving}/>
      {draft.id ? <SecondaryButton label="Cancel" onPress={() => setDraft(blank)}/> : null}
    </Panel>
    {logbook[kind].map(item => <Panel key={item.id} title={item.name}>
      <Text style={{ color: tokens.color.muted }}>{"startDate" in item ? `${item.startDate} – ${item.endDate}\n${item.destination || ""}\n${item.notes || ""}` : `${item.coordinates.latitude}, ${item.coordinates.longitude} · ${item.radiusMeters} m`}</Text>
      <SecondaryButton label="Edit" onPress={() => setDraft({ ...blank, ...Object.fromEntries(Object.entries(item).filter(([key]) => key in blank).map(([key, value]) => [key, String(value ?? "")])), ...("coordinates" in item && item.coordinates ? { latitude: String(usableCoordinates(item.coordinates)?.latitude ?? ""), longitude: String(usableCoordinates(item.coordinates)?.longitude ?? "") } : {}) })}/>
    </Panel>)}
  </View>;
}
