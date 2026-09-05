import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Flasher, GearBase, Lure } from "../domain/types";
import { tokens } from "../theme/tokens";

type Gear = (Lure | Flasher) & GearBase;
type Props = { gear: Gear | null; kind: "lure" | "flasher"; onClose: () => void };

const value = (item: Gear, key: keyof Gear) => item[key] === undefined || item[key] === null || item[key] === "" ? "" : String(item[key]);

function imageUri(gear: Gear) {
  const media = gear.media?.find(item => item.mediaType === "image");
  return gear.image || gear.previewImage || gear.imagePath || gear.previewPath || media?.uri || media?.path || media?.url || media?.image || media?.previewImage || media?.previewPath || "";
}

function GearInfoModal({ gear, kind, onClose }: Props) {
  if (!gear) return null;
  const photo = imageUri(gear), isLure = kind === "lure";
  const details: Array<[string, string]> = [
    ["Type", value(gear, "type")],
    ["Brand / model", value(gear, "brand")],
    ["Color", value(gear, "color")],
    ["Model", value(gear, "model")],
    ...(isLure ? [["Diving depth", value(gear, "divingDepth")], ["Quantity owned", value(gear, "quantityAvailable")], ["Lure weight", value(gear, "weight")], ["Blade type", value(gear, "bladeType")], ["Spoon size", value(gear, "spoonSize")], ["Glow", gear.glow ? "Yes" : "No"]] : []),
    ["Notes", value(gear, "notes")],
  ].filter(([, item]) => item !== "") as Array<[string, string]>;
  return <Modal animationType="slide" transparent visible onRequestClose={onClose}>
    <View style={s.backdrop}>
      <View style={s.sheet}>
        <View style={s.header}>
          <View style={s.headerCopy}>
            <Text style={s.kicker}>{isLure ? "LURE INFO" : "FLASHER INFO"}</Text>
            <Text style={s.title}>{gear.name || gear.shortName || (isLure ? "Lure" : "Flasher")}</Text>
            <Text style={s.subtitle}>{[gear.type, gear.brand, gear.color].filter(Boolean).join(" · ") || "Saved gear details"}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close lure info" onPress={onClose} style={s.close}>
            <Text style={s.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.content}>
          {photo ? <Image source={{ uri: photo }} resizeMode="cover" style={s.photo} /> : <View style={s.photoPlaceholder}><Text style={s.placeholderText}>No lure photo</Text></View>}
          {details.length ? <View style={s.details}>{details.map(([label, item], index) => <View style={[s.row, index === details.length - 1 && s.last]} key={label}><Text style={s.label}>{label}</Text><Text style={s.detail}>{item}</Text></View>)}</View> : <Text style={s.empty}>No additional lure details saved.</Text>}
        </ScrollView>
        <View style={s.footer}><Pressable accessibilityRole="button" onPress={onClose} style={s.done}><Text style={s.doneText}>Close</Text></Pressable></View>
      </View>
    </View>
  </Modal>;
}

export function LureInfoModal({ lure, onClose }: { lure: Lure | null; onClose: () => void }) {
  return <GearInfoModal gear={lure} kind="lure" onClose={onClose}/>;
}

export function FlasherInfoModal({ flasher, onClose }: { flasher: Flasher | null; onClose: () => void }) {
  return <GearInfoModal gear={flasher} kind="flasher" onClose={onClose}/>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.64)" },
  sheet: { maxHeight: "92%", backgroundColor: "#0a1823", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: "#29445a" },
  header: { padding: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: "#20384b" },
  headerCopy: { flex: 1, paddingRight: 12 },
  kicker: { color: tokens.color.green, fontSize: 11, fontWeight: "900", letterSpacing: .8 },
  title: { color: tokens.color.text, fontSize: 25, lineHeight: 30, fontWeight: "900", marginTop: 4 },
  subtitle: { color: "#9fb6cc", fontSize: 13, lineHeight: 19, marginTop: 4 },
  close: { width: 42, height: 42, borderWidth: 1, borderColor: "#29445a", borderRadius: 21, alignItems: "center", justifyContent: "center" },
  closeText: { color: tokens.color.text, fontSize: 28, lineHeight: 30 },
  content: { padding: 20, paddingBottom: 28, gap: 16 },
  photo: { width: "100%", height: 230, borderRadius: 14, backgroundColor: tokens.color.black },
  photoPlaceholder: { width: "100%", height: 150, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.panelSoft, borderWidth: 1, borderColor: "#29445a" },
  placeholderText: { color: tokens.color.muted, fontSize: 14 },
  details: { borderWidth: 1, borderColor: "#20384b", borderRadius: 12, paddingHorizontal: 12 },
  row: { minHeight: 46, paddingVertical: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderColor: "#20384b" },
  last: { borderBottomWidth: 0 },
  label: { flex: 1, color: "#9fb6cc", fontSize: 12, lineHeight: 16 },
  detail: { flex: 1, color: tokens.color.text, fontSize: 13, lineHeight: 18, fontWeight: "800", textAlign: "right" },
  empty: { color: tokens.color.muted, fontSize: 14, lineHeight: 20 },
  footer: { padding: 16, flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1, borderColor: "#20384b" },
  done: { minWidth: 88, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 8, alignItems: "center", backgroundColor: tokens.color.green },
  doneText: { color: "#062118", fontSize: 14, fontWeight: "900" },
});
