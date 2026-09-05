import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { PrimaryButton, SecondaryButton } from "../../components/ui";
import type { Catch, FishEvent, Logbook, MediaRef, Trip } from "../../domain/types";
import { tokens } from "../../theme/tokens";
import {
  DEFAULT_IMAGE_OPTIONS, DEFAULT_TEXT_OPTIONS, bestFlashers, bestLures, bestMethods, biggestFish,
  compact, conditionItems, defaultHeadline, defaultPhotoId, depthText, eventRecords, fishSize, flasherFor,
  formatDate, formatTime, launchName, lureFor, measurement, metrics, palettes, photoOptions, sharePresets,
  speciesCounts, textReport, validColor, waterDepthRange,
  type ImageOption, type ShareMode, type SharePalette, type SharePreset, type ShareTheme, type TextOption,
} from "./share-report";

type Props = { logbook: Logbook; trip: Trip; update: (next: Logbook) => Promise<void>; onClose: () => void };
type ImageOptions = Record<ImageOption, boolean>;
type TextOptions = Record<TextOption, boolean>;

const IMAGE_CHOICES: Array<[ImageOption, string]> = [
  ["landed", "Landed"], ["missed", "Lost"], ["biggest", "Biggest fish"], ["rate", "Fish / hr"],
  ["hours", "Hours"], ["fow", "Water depth"], ["notes", "Trip notes"], ["conditions", "Conditions"],
  ["highlights", "Trip highlights"], ["timeline", "Catch timeline"], ["includeMisses", "Missed or lost fish"],
  ["bestLure", "Show best lure"], ["bestFlasher", "Show best flasher"],
];
const TEXT_CHOICES: Array<[TextOption, string]> = [
  ["notes", "Trip notes"], ["conditions", "Conditions"], ["highlights", "Trip highlights"],
  ["timeline", "Catch timeline"], ["includeMisses", "Missed or lost fish"],
];
const TIMELINE_CHOICES: Array<[TextOption, string]> = [
  ["number", "Fish number"], ["time", "Time"], ["result", "Result"], ["species", "Species"],
  ["size", "Size"], ["waterDepth", "Water depth"], ["method", "Method"], ["depth", "Depth down"],
  ["speed", "Speed"], ["lure", "Lure"], ["flasher", "Flasher"], ["catchNotes", "Catch notes"],
];

export function ShareTripStudio({ logbook, trip, update, onClose }: Props) {
  const { width } = useWindowDimensions();
  const reportRef = useRef<View>(null);
  const [mode, setMode] = useState<ShareMode>("image");
  const [headline, setHeadline] = useState(defaultHeadline(trip));
  const [subtitle, setSubtitle] = useState("");
  const [theme, setTheme] = useState<ShareTheme>("deep-water");
  const [palette, setPalette] = useState<SharePalette>(palettes["deep-water"]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(() => defaultPhotoId(trip));
  const [imageOptions, setImageOptions] = useState<ImageOptions>({ ...DEFAULT_IMAGE_OPTIONS });
  const [bestLureFlipped, setBestLureFlipped] = useState(false);
  const [textOptions, setTextOptions] = useState<TextOptions>({ ...DEFAULT_TEXT_OPTIONS });
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [textDirty, setTextDirty] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [reportHeight, setReportHeight] = useState(0);
  const generatedText = useMemo(() => textReport(logbook, trip, headline, subtitle, textOptions), [logbook, trip, headline, subtitle, textOptions]);
  const [editableText, setEditableText] = useState(generatedText);
  useEffect(() => { if (!textDirty) setEditableText(generatedText); }, [generatedText, textDirty]);
  const photos = useMemo(() => photoOptions(trip), [trip]);
  const selectedPhoto = photos.find((item) => item.media.id === selectedPhotoId)?.media;
  const presets = useMemo(() => sharePresets(logbook), [logbook]);
  const wide = width >= 900;
  const previewScale = previewWidth ? Math.min(1, previewWidth / 1200) : 0;

  const setThemeAndPalette = (nextTheme: ShareTheme, nextPalette = palettes[nextTheme]) => {
    setTheme(nextTheme); setPalette(nextPalette); setStatus("");
  };
  const toggleImage = (key: ImageOption) => setImageOptions((current) => ({ ...current, [key]: !current[key] }));
  const toggleText = (key: TextOption) => { setTextDirty(false); setTextOptions((current) => ({ ...current, [key]: !current[key] })); };
  const run = async (label: string, task: () => Promise<void>, success: string) => {
    setBusy(label); setStatus("Preparing report…");
    try { await task(); setStatus(success); }
    catch (error) { const message = error instanceof Error ? error.message : "Export failed. Please try again."; setStatus(message); Alert.alert("Share Trip", message); }
    finally { setBusy(""); }
  };
  const capture = async (format: "png" | "jpg", result: "tmpfile" | "base64" = "tmpfile") => {
    if (Platform.OS === "web") throw new Error("Image export is available in the iOS and Android app.");
    if (!reportRef.current) throw new Error("The report preview is unavailable.");
    return captureRef(reportRef, { format, quality: format === "jpg" ? 0.93 : 1, result, width: 1200 });
  };
  const shareImage = (format: "png" | "jpg") => run(`share-${format}`, async () => {
    if (!(await Sharing.isAvailableAsync())) throw new Error("The system share sheet is unavailable on this device.");
    const uri = await capture(format);
    await Sharing.shareAsync(uri, { dialogTitle: "Share trip report", mimeType: format === "jpg" ? "image/jpeg" : "image/png", UTI: format === "jpg" ? "public.jpeg" : "public.png" });
  }, `${format.toUpperCase()} ready`);
  const copyImage = () => run("copy-image", async () => {
    const base64 = await capture("png", "base64"); await Clipboard.setImageAsync(base64);
  }, "Image copied");
  const copyText = () => run("copy-text", async () => { await Clipboard.setStringAsync(editableText); }, "Text copied");
  const shareTextFile = () => run("share-txt", async () => {
    if (!(await Sharing.isAvailableAsync())) throw new Error("The system share sheet is unavailable on this device.");
    if (!FileSystem.cacheDirectory) throw new Error("Temporary storage is unavailable.");
    const uri = `${FileSystem.cacheDirectory}trip-report-${trip.date || "share"}.txt`;
    await FileSystem.writeAsStringAsync(uri, editableText, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(uri, { dialogTitle: "Share text report", mimeType: "text/plain", UTI: "public.plain-text" });
  }, "Text report ready");
  const savePreset = () => run("save-preset", async () => {
    const name = presetName.trim(); if (!name) throw new Error("Enter a preset name first.");
    const raw = sharePresets(logbook).filter((item) => item.name.toLowerCase() !== name.toLowerCase()).map((item) => ({
      id: item.id, name: item.name, theme: item.theme, accent: item.accent, background: item.background,
      textColor: item.text, cardBackground: item.card,
    }));
    const preset: SharePreset = { id: `share-${Date.now()}`, name, theme, ...palette };
    await update({ ...logbook, settings: { ...logbook.settings, shareAppearancePresets: [...raw, { ...preset, textColor: preset.text, cardBackground: preset.card }] } });
    setPresetName("");
  }, "Appearance saved");

  return <View style={styles.screen}>
    <View style={styles.header}>
      <View><Text style={styles.headerTitle}>Share trip</Text><Text style={styles.headerSub}>Build the report before it leaves your logbook.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close share studio" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
    </View>
    <View style={styles.tabs}>
      <Tab label="Image Report" selected={mode === "image"} onPress={() => setMode("image")} />
      <Tab label="Text Report" selected={mode === "text"} onPress={() => setMode("text")} />
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, wide && styles.bodyWide]}>
      <View style={[styles.controls, wide && styles.controlsWide]}>
        {mode === "image" ? <>
          <Section title="Appearance">
            <View style={styles.choiceRow}>
              <Choice label="Dark mode" selected={theme === "deep-water" && palette.background === palettes["deep-water"].background} onPress={() => setThemeAndPalette("deep-water")} />
              <Choice label="Light mode" selected={theme === "clean-light" && palette.background === palettes["clean-light"].background} onPress={() => setThemeAndPalette("clean-light")} />
              {presets.map((preset) => <Choice key={preset.id} label={preset.name} selected={palette.background === preset.background && palette.accent === preset.accent} onPress={() => setThemeAndPalette(preset.theme, preset)} />)}
            </View>
          </Section>
          <Section title="Photo">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoChoices}>
              <PhotoChoice label="No photo" selected={!selectedPhotoId} onPress={() => setSelectedPhotoId(null)} />
              {photos.map((item) => <PhotoChoice key={item.media.id} label={item.label} media={item.media} selected={selectedPhotoId === item.media.id} onPress={() => setSelectedPhotoId(item.media.id)} />)}
            </ScrollView>
          </Section>
        </> : null}
        <LabeledInput label="Headline" value={headline} maxLength={90} onChangeText={(value) => { setHeadline(value); setTextDirty(false); }} />
        <LabeledInput label="Subtitle (optional)" value={subtitle} maxLength={120} onChangeText={(value) => { setSubtitle(value); setTextDirty(false); }} />
        {mode === "image" ? <>
          <Section title="Colors"><View style={styles.colorGrid}>
            <ColorField label="Accent" value={palette.accent} fallback="#42c98a" onChange={(accent) => setPalette((p) => ({ ...p, accent }))} />
            <ColorField label="Card background" value={palette.card} fallback="#141f29" onChange={(card) => setPalette((p) => ({ ...p, card }))} />
            <ColorField label="Background" value={palette.background} fallback="#131b24" onChange={(background) => setPalette((p) => ({ ...p, background }))} />
            <ColorField label="Text color" value={palette.text} fallback="#edf3f8" onChange={(text) => setPalette((p) => ({ ...p, text }))} />
          </View></Section>
          <Section title="Save appearance"><View style={styles.saveRow}><TextInput accessibilityLabel="Preset name" placeholder="My lake palette" placeholderTextColor="#718397" value={presetName} maxLength={40} onChangeText={setPresetName} style={[styles.input, styles.saveInput]} /><SecondaryButton compact label={busy === "save-preset" ? "Saving…" : "Save"} disabled={Boolean(busy)} onPress={savePreset} /></View></Section>
          <Section title="Content"><View style={styles.optionGrid}>{IMAGE_CHOICES.map(([key, label]) => <Toggle key={key} label={label} value={imageOptions[key]} onPress={() => toggleImage(key)} />)}</View><Pressable onPress={() => setBestLureFlipped((value) => !value)} style={styles.flipButton}><Text style={styles.flipButtonText}>{bestLureFlipped ? "Restore best lure photo" : "Flip best lure photo"}</Text></Pressable></Section>
        </> : <>
          <Section title="Content"><View style={styles.optionGrid}>{TEXT_CHOICES.map(([key, label]) => <Toggle key={key} label={label} value={textOptions[key]} onPress={() => toggleText(key)} />)}</View></Section>
          <Section title="Timeline fields"><View style={styles.optionGrid}>{TIMELINE_CHOICES.map(([key, label]) => <Toggle key={key} label={label} value={textOptions[key]} onPress={() => toggleText(key)} />)}</View></Section>
        </>}
      </View>
      <View style={[styles.previewPanel, wide && styles.previewWide]}>
        <View style={styles.previewHeading}><Text style={styles.previewTitle}>Preview</Text><Text style={styles.previewHint}>{mode === "image" ? "Scaled to fit · exports full size" : "Fully editable"}</Text></View>
        {mode === "image" ? <View onLayout={(event) => setPreviewWidth(event.nativeEvent.layout.width)} style={[styles.reportViewport, reportHeight > 0 && previewScale > 0 ? { height: reportHeight * previewScale } : null]}>
          <View style={[styles.reportScaleFrame, previewScale > 0 ? { transform: [{ scale: previewScale }], transformOrigin: "top left" } : styles.reportMeasuring]}>
            <View onLayout={(event) => setReportHeight(event.nativeEvent.layout.height)}>
              <TripImageReport ref={reportRef} logbook={logbook} trip={trip} headline={headline} subtitle={subtitle} palette={palette} selectedPhoto={selectedPhoto} options={imageOptions} bestLureFlipped={bestLureFlipped} />
            </View>
          </View>
        </View> : <TextInput multiline spellCheck accessibilityLabel="Editable text report" value={editableText} onChangeText={(value) => { setEditableText(value); setTextDirty(true); }} style={styles.textEditor} />}
      </View>
    </ScrollView>
    <View style={styles.actions}>
      <Text numberOfLines={2} style={[styles.status, /copied|ready|saved/i.test(status) && styles.statusGood]}>{status}</Text>
      <View style={styles.actionButtons}>{mode === "image" ? <>
        <SecondaryButton compact label={busy === "copy-image" ? "Copying…" : "Copy Image"} disabled={Boolean(busy)} onPress={copyImage} />
        <SecondaryButton compact label={busy === "share-jpg" ? "Preparing…" : "Share JPG"} disabled={Boolean(busy)} onPress={() => shareImage("jpg")} />
        <PrimaryButton compact label={busy === "share-png" ? "Preparing…" : "Share PNG"} disabled={Boolean(busy)} onPress={() => shareImage("png")} />
      </> : <>
        <SecondaryButton compact label={busy === "copy-text" ? "Copying…" : "Copy Text"} disabled={Boolean(busy)} onPress={copyText} />
        <PrimaryButton compact label={busy === "share-txt" ? "Preparing…" : "Share TXT"} disabled={Boolean(busy)} onPress={shareTextFile} />
      </>}</View>
    </View>
  </View>;
}

function Tab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.tab, selected && styles.tabSelected]}><Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text></Pressable>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.label}>{title}</Text>{children}</View>; }
function LabeledInput({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { return <Section title={label}><TextInput placeholderTextColor="#718397" {...props} style={styles.input} /></Section>; }
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function Toggle({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={onPress} style={[styles.toggle, value && styles.toggleSelected]}><View style={[styles.checkbox, value && styles.checkboxSelected]}>{value ? <Text style={styles.check}>✓</Text> : null}</View><Text style={[styles.toggleText, value && styles.toggleTextSelected]}>{label}</Text></Pressable>; }
function ColorField({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) { const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]); return <View style={styles.colorField}><Text style={styles.colorLabel}>{label}</Text><View style={styles.colorRow}><View style={[styles.swatch, { backgroundColor: validColor(draft, fallback) }]} /><TextInput autoCapitalize="none" autoCorrect={false} value={draft} maxLength={7} onChangeText={setDraft} onBlur={() => { const next = validColor(draft, fallback); setDraft(next); onChange(next); }} style={[styles.input, styles.colorInput]} /></View></View>; }
function PhotoChoice({ label, media, selected, onPress }: { label: string; media?: MediaRef; selected: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.photoChoice, selected && styles.photoChoiceSelected]}>{media?.uri ? <Image source={{ uri: media.uri }} style={styles.photoThumb} /> : <View style={styles.noPhoto}><Text style={styles.noPhotoText}>×</Text></View>}<Text numberOfLines={2} style={[styles.photoLabel, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }

type ReportProps = { logbook: Logbook; trip: Trip; headline: string; subtitle: string; palette: SharePalette; selectedPhoto?: MediaRef; options: ImageOptions; bestLureFlipped: boolean };
const TripImageReport = React.forwardRef<View, ReportProps>(function TripImageReport({ logbook, trip, headline, subtitle, palette, selectedPhoto, options, bestLureFlipped }, ref) {
  const stat = metrics(trip), biggest = biggestFish(trip), biggestSize = biggest ? fishSize(biggest, logbook) : "Not logged";
  const lures = bestLures(logbook, trip), flashers = bestFlashers(logbook, trip), methods = bestMethods(trip);
  const conditions = options.conditions ? conditionItems(logbook, trip) : [], species = speciesCounts(trip);
  const depths = waterDepthRange(trip), fishPerHour = stat.hours ? compact(stat.landed / stat.hours) : "Not logged";
  const metricRows: Array<[ImageOption, string, string | number]> = [["landed", "Landed", stat.landed], ["missed", "Lost", stat.missed], ["biggest", "Biggest fish", biggestSize], ["rate", "Fish / hr", fishPerHour], ["hours", "Hours", compact(stat.hours)], ["fow", "Water depth", depths]];
  const bestLurePhoto = logbook.lures.find((item) => lures.includes(item.name) && (item.image || item.previewImage || item.media?.[0]?.uri));
  const bestFlasherPhoto = logbook.flashers.find((item) => flashers.includes(item.name || "") && (item.image || item.previewImage || item.media?.[0]?.uri));
  const gearImage = (item: typeof bestLurePhoto | typeof bestFlasherPhoto) => item?.image || item?.previewImage || item?.media?.[0]?.uri;
  const line = mixColor(palette.card, palette.text, 0.16), muted = mixColor(palette.text, palette.background, 0.36);
  return <View ref={ref} collapsable={false} style={[reportStyles.report, { backgroundColor: palette.background }]}>
    <View style={reportStyles.header}>
      <View style={reportStyles.headerCopy}><Text style={[reportStyles.meta, { color: muted }]}>{[formatDate(trip.date), trip.launchTime ? formatTime(trip.launchTime, logbook) : "", [launchName(trip), trip.location].filter(Boolean).join(" · ")].filter(Boolean).join(" · ")}</Text><Text style={[reportStyles.title, { color: palette.text }]}>{headline || defaultHeadline(trip)}</Text>{subtitle ? <Text style={[reportStyles.subtitle, { color: muted }]}>{subtitle}</Text> : null}</View>
      {selectedPhoto?.uri ? <Image source={{ uri: selectedPhoto.uri }} style={reportStyles.hero} /> : null}
    </View>
    <View style={[reportStyles.metrics, { borderColor: line, backgroundColor: palette.card }]}>{metricRows.filter(([key]) => options[key]).map(([key, label, value]) => <View key={key} style={[reportStyles.metric, { borderColor: line }]}><Text numberOfLines={2} adjustsFontSizeToFit style={[reportStyles.metricValue, { color: key === "landed" ? palette.accent : palette.text }]}>{value}</Text><Text style={[reportStyles.metricLabel, { color: muted }]}>{label}</Text></View>)}</View>
    {options.notes && trip.notes ? <ReportSection title="Trip Notes" palette={palette}><Text style={[reportStyles.notes, { color: palette.text }]}>{trip.notes}</Text></ReportSection> : null}
    {options.timeline ? <Timeline logbook={logbook} trip={trip} palette={palette} includeMisses={options.includeMisses} /> : null}
    {conditions.length || options.highlights ? <View style={reportStyles.twoColumns}>
      {conditions.length ? <ReportSection title="Conditions" palette={palette} style={reportStyles.column}><DefinitionRows rows={conditions} palette={palette} /></ReportSection> : null}
      {options.highlights ? <ReportSection title="Trip Highlights" palette={palette} style={reportStyles.column}><DefinitionRows rows={[["Biggest fish", biggest ? `${fishSize(biggest, logbook) || (biggest.shaker ? "Shaker" : "Size not logged")} ${biggest.species || "Fish"}` : "No landed fish"], ["Best presentation", methods.join(" / ") || "Not logged"]]} palette={palette} />{species.length ? <View style={reportStyles.species}>{species.map(([name, count]) => <View key={name} style={reportStyles.speciesRow}><Text style={[reportStyles.definitionLabel, { color: muted }]}>{name}</Text><Text style={[reportStyles.definitionValue, { color: palette.text }]}>{count}</Text></View>)}</View> : null}</ReportSection> : null}
    </View> : null}
    {(options.bestLure && lures.length) || (options.bestFlasher && flashers.length) ? <View style={reportStyles.twoColumns}>
      {options.bestLure && lures.length ? <BestGear title="Best lure" names={lures} image={gearImage(bestLurePhoto)} palette={palette} rotation={bestLureFlipped ? "-90deg" : "90deg"} /> : null}
      {options.bestFlasher && flashers.length ? <BestGear title="Best flasher" names={flashers} image={gearImage(bestFlasherPhoto)} palette={palette} /> : null}
    </View> : null}
    <Text style={[reportStyles.footer, { color: muted, borderColor: line }]}>Fishing Logbook</Text>
  </View>;
});

function ReportSection({ title, palette, style, children }: { title: string; palette: SharePalette; style?: object; children: React.ReactNode }) { return <View style={[reportStyles.section, { backgroundColor: palette.card, borderColor: mixColor(palette.card, palette.text, 0.16) }, style]}><Text style={[reportStyles.sectionTitle, { color: palette.accent }]}>{title}</Text>{children}</View>; }
function DefinitionRows({ rows, palette }: { rows: Array<[string, string | number]>; palette: SharePalette }) { const muted = mixColor(palette.text, palette.background, 0.36); return <View>{rows.map(([label, value]) => <View key={label} style={reportStyles.definitionRow}><Text style={[reportStyles.definitionLabel, { color: muted }]}>{label}</Text><Text style={[reportStyles.definitionValue, { color: palette.text }]}>{value || "Not logged"}</Text></View>)}</View>; }
function Timeline({ logbook, trip, palette, includeMisses }: { logbook: Logbook; trip: Trip; palette: SharePalette; includeMisses: boolean }) { const events = eventRecords(trip, includeMisses), muted = mixColor(palette.text, palette.background, 0.36), line = mixColor(palette.card, palette.text, 0.16); return <ReportSection title="Trip Timeline" palette={palette}><View style={[reportStyles.timelineHeader, { borderColor: line }]}>{["#", "Time", "Result", "Species", "Size", "Water depth", "Method", "Depth", "Speed", "Lure", "Flasher"].map((label, index) => <Text key={label} style={[reportStyles.timelineCell, index === 0 && reportStyles.numberCell, { color: muted }]}>{label}</Text>)}</View>{events.length ? events.map((fish, index) => <View key={fish.id} style={[reportStyles.timelineRow, { borderColor: line }]}><Text style={[reportStyles.timelineCell, reportStyles.numberCell, { color: muted }]}>{index + 1}</Text><Text style={[reportStyles.timelineCell, { color: palette.text }]}>{formatTime(fish.time, logbook) || "—"}</Text><Text style={[reportStyles.timelineCell, { color: fish.landed ? palette.accent : "#f3b65e" }]}>{fish.eventType}</Text><Text style={[reportStyles.timelineCell, { color: palette.text }]}>{(fish as Catch).species || (fish as Record<string, unknown>).possibleSpecies as string || "Fish"}</Text><Text style={[reportStyles.timelineCell, { color: palette.text }]}>{fishSize(fish as Catch, logbook) || "—"}</Text><Text style={[reportStyles.timelineCell, { color: palette.text }]}>{fish.fowCaught || fish.waterDepth ? Math.round(Number(fish.fowCaught || fish.waterDepth)) : "—"}</Text><Text style={[reportStyles.timelineCell, { color: palette.text }]}>{fish.presentation || "—"}</Text><Text style={[reportStyles.timelineCell, { color: palette.text }]}>{depthText(fish, logbook) || "—"}</Text><Text style={[reportStyles.timelineCell, { color: palette.text }]}>{measurement(fish.speed, "speed", logbook) || "—"}</Text><Text style={[reportStyles.timelineCell, { color: palette.text }]}>{lureFor(logbook, trip, fish) || "—"}</Text><Text style={[reportStyles.timelineCell, { color: palette.text }]}>{flasherFor(logbook, trip, fish) || "—"}</Text></View>) : <Text style={[reportStyles.empty, { color: muted }]}>No events recorded</Text>}</ReportSection>; }
function BestGear({ title, names, image, palette, rotation }: { title: string; names: string[]; image?: string; palette: SharePalette; rotation?: "90deg" | "-90deg" }) { return <ReportSection title={title} palette={palette} style={reportStyles.column}><View style={reportStyles.gear}><Text style={[reportStyles.gearName, { color: palette.text }]}>{names.join(" / ")}</Text>{image ? <Image source={{ uri: image }} resizeMode="contain" style={[reportStyles.gearImage, rotation && { transform: [{ rotate: rotation }] }]} /> : null}</View></ReportSection>; }

function mixColor(a: string, b: string, ratio: number): string { const parse = (value: string) => [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16)); const [ar, ag, ab] = parse(a), [br, bg, bb] = parse(b); return `rgb(${Math.round(ar + (br - ar) * ratio)},${Math.round(ag + (bg - ag) * ratio)},${Math.round(ab + (bb - ab) * ratio)})`; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background }, header: { minHeight: 74, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: tokens.color.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerTitle: { color: tokens.color.text, fontSize: 22, fontWeight: "800" }, headerSub: { color: tokens.color.muted, fontSize: 12, marginTop: 3 }, close: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: tokens.color.line, alignItems: "center", justifyContent: "center" }, closeText: { color: tokens.color.text, fontSize: 28, lineHeight: 30 },
  tabs: { height: 50, paddingHorizontal: 20, flexDirection: "row", gap: 8, borderBottomWidth: 1, borderColor: tokens.color.line }, tab: { paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderColor: "transparent" }, tabSelected: { borderColor: tokens.color.green }, tabText: { color: tokens.color.muted, fontSize: 13, fontWeight: "800" }, tabTextSelected: { color: tokens.color.greenDark },
  body: { padding: 16, gap: 18, paddingBottom: 110 }, bodyWide: { flexDirection: "row", alignItems: "flex-start" }, controls: { gap: 16 }, controlsWide: { width: 340 }, previewPanel: { gap: 10, minWidth: 0 }, previewWide: { flex: 1 }, previewHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }, previewTitle: { color: tokens.color.text, fontSize: 17, fontWeight: "800" }, previewHint: { color: tokens.color.muted, fontSize: 11 }, reportViewport: { width: "100%", minHeight: 120, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 8, overflow: "hidden", backgroundColor: tokens.color.panelSoft }, reportScaleFrame: { width: 1200 }, reportMeasuring: { opacity: 0 },
  section: { gap: 8 }, label: { color: tokens.color.muted, fontSize: 11, fontWeight: "800", letterSpacing: .6, textTransform: "uppercase" }, input: { minHeight: 42, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 8, backgroundColor: tokens.color.field, color: tokens.color.text, fontSize: 14 }, choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, choice: { minHeight: 36, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: tokens.color.line, backgroundColor: tokens.color.field, justifyContent: "center" }, choiceSelected: { borderColor: tokens.color.green, backgroundColor: tokens.color.activeBackground }, choiceText: { color: tokens.color.muted, fontSize: 12, fontWeight: "700" }, choiceTextSelected: { color: tokens.color.activeText },
  photoChoices: { gap: 8, paddingVertical: 2 }, photoChoice: { width: 108, padding: 7, gap: 6, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 9, backgroundColor: tokens.color.field }, photoChoiceSelected: { borderColor: tokens.color.green, backgroundColor: tokens.color.activeBackground }, photoThumb: { width: 92, height: 66, borderRadius: 6, backgroundColor: tokens.color.panelSoft }, noPhoto: { width: 92, height: 66, borderRadius: 6, backgroundColor: tokens.color.panelSoft, alignItems: "center", justifyContent: "center" }, noPhotoText: { color: tokens.color.muted, fontSize: 24 }, photoLabel: { color: tokens.color.muted, fontSize: 11, lineHeight: 14, fontWeight: "700" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, colorField: { width: "48%", gap: 5 }, colorLabel: { color: tokens.color.muted, fontSize: 11 }, colorRow: { flexDirection: "row", gap: 6, alignItems: "center" }, swatch: { width: 32, height: 32, borderRadius: 6, borderWidth: 1, borderColor: tokens.color.line }, colorInput: { flex: 1, minHeight: 36, paddingVertical: 5, paddingHorizontal: 7, fontSize: 12 }, saveRow: { flexDirection: "row", gap: 8, alignItems: "center" }, saveInput: { flex: 1 }, optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, toggle: { width: "48%", minHeight: 44, padding: 8, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 8, backgroundColor: tokens.color.field, flexDirection: "row", alignItems: "center", gap: 7 }, toggleSelected: { backgroundColor: tokens.color.hover }, checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: tokens.color.muted, alignItems: "center", justifyContent: "center" }, checkboxSelected: { borderColor: tokens.color.green, backgroundColor: tokens.color.green }, check: { color: "#062117", fontSize: 12, fontWeight: "900" }, toggleText: { flex: 1, color: tokens.color.muted, fontSize: 11, fontWeight: "700" }, toggleTextSelected: { color: tokens.color.text }, flipButton: { minHeight: 40, marginTop: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.field }, flipButtonText: { color: tokens.color.text, fontSize: 12, fontWeight: "800" }, textEditor: { minHeight: 540, padding: 18, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 8, backgroundColor: tokens.color.field, color: tokens.color.text, fontSize: 15, lineHeight: 23, textAlignVertical: "top" },
  actions: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 76, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: tokens.color.line, backgroundColor: tokens.color.panelSoft, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "space-between" }, status: { flex: 1, color: tokens.color.muted, fontSize: 11 }, statusGood: { color: tokens.color.greenDark }, actionButtons: { flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "flex-end" },
});

const reportStyles = StyleSheet.create({
  report: { width: 1200, padding: 48, gap: 26 }, header: { minHeight: 250, flexDirection: "row", gap: 30, alignItems: "stretch" }, headerCopy: { flex: 1, justifyContent: "center" }, meta: { fontSize: 18, fontWeight: "700", letterSpacing: .3, marginBottom: 18 }, title: { fontSize: 56, lineHeight: 62, fontWeight: "900", letterSpacing: -1.4 }, subtitle: { fontSize: 24, lineHeight: 32, marginTop: 14 }, hero: { width: 410, borderRadius: 20, resizeMode: "cover" }, metrics: { flexDirection: "row", borderWidth: 1, borderRadius: 16, overflow: "hidden" }, metric: { flex: 1, minHeight: 118, padding: 17, justifyContent: "center", borderRightWidth: 1 }, metricValue: { fontSize: 28, lineHeight: 34, fontWeight: "900" }, metricLabel: { marginTop: 6, fontSize: 12, fontWeight: "800", letterSpacing: .5, textTransform: "uppercase" }, section: { padding: 26, borderWidth: 1, borderRadius: 16 }, sectionTitle: { fontSize: 21, lineHeight: 26, fontWeight: "900", textTransform: "uppercase", letterSpacing: .8, marginBottom: 18 }, notes: { fontSize: 21, lineHeight: 31 }, twoColumns: { flexDirection: "row", gap: 22 }, column: { flex: 1 }, definitionRow: { minHeight: 42, flexDirection: "row", justifyContent: "space-between", gap: 14, alignItems: "center" }, definitionLabel: { flex: 1, fontSize: 16, lineHeight: 21 }, definitionValue: { flex: 1.35, fontSize: 17, lineHeight: 22, fontWeight: "800", textAlign: "right" }, species: { marginTop: 16, paddingTop: 12 }, speciesRow: { flexDirection: "row", minHeight: 34, justifyContent: "space-between" },
  timelineHeader: { flexDirection: "row", paddingBottom: 10, borderBottomWidth: 1 }, timelineRow: { flexDirection: "row", minHeight: 55, paddingVertical: 9, borderBottomWidth: 1, alignItems: "center" }, timelineCell: { flex: 1, paddingHorizontal: 4, fontSize: 12, lineHeight: 16 }, numberCell: { flex: .35 }, empty: { paddingVertical: 20, textAlign: "center", fontSize: 16 }, gear: { minHeight: 120, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 }, gearName: { flex: 1, fontSize: 25, lineHeight: 31, fontWeight: "900" }, gearImage: { width: 190, height: 110 }, footer: { paddingTop: 20, borderTopWidth: 1, textAlign: "right", fontSize: 16, fontWeight: "800" },
});
