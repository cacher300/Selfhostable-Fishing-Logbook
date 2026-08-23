import type { PropsWithChildren, ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { textStyles, tokens, type BadgeTone } from "../theme";

type Children = { children?: ReactNode };

export type ScreenProps = PropsWithChildren<
  ViewProps & {
    scroll?: boolean;
    edges?: Edge[];
    contentContainerStyle?: StyleProp<ViewStyle>;
    scrollProps?: Omit<ScrollViewProps, "contentContainerStyle" | "children">;
  }
>;

/** Page shell matching the desktop main panel's dark background and gutter. */
export function Screen({ children, scroll = true, edges = ["top", "left", "right"], style, contentContainerStyle, scrollProps, ...viewProps }: ScreenProps) {
  const contents = <View {...viewProps} style={[styles.screenContent, contentContainerStyle]}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {scroll ? <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" {...scrollProps}>{contents}</ScrollView> : contents}
    </SafeAreaView>
  );
}

export type TopBarProps = Children & {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function TopBar({ title, eyebrow, subtitle, actions, children, style }: TopBarProps) {
  return <View style={[styles.topBar, style]}><View style={styles.topBarCopy}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.screenTitle}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}{children}</View>{actions ? <View style={styles.topBarActions}>{actions}</View> : null}</View>;
}

export type PanelProps = PropsWithChildren<ViewProps & {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  compact?: boolean;
}>;

export function Panel({ title, subtitle, action, compact = false, children, style, ...props }: PanelProps) {
  return <View {...props} style={[styles.panel, compact && styles.panelCompact, style]}>{title || action ? <SectionHeader title={title ?? ""} subtitle={subtitle} action={action} compact /> : null}{children}</View>;
}

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ title, subtitle, action, compact = false, style }: SectionHeaderProps) {
  return <View style={[styles.sectionHeader, style]}><View style={styles.sectionHeaderCopy}><Text style={compact ? styles.panelTitle : styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}</View>{action ? <View style={styles.sectionAction}>{action}</View> : null}</View>;
}

type ButtonProps = PropsWithChildren<Omit<PressableProps, "style"> & {
  label?: string;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}>;

function Button({ label, children, loading = false, compact = false, style, textStyle, disabled, tone, ...props }: ButtonProps & { tone: "primary" | "secondary" | "danger" }) {
  return <Pressable {...props} disabled={disabled || loading} accessibilityRole="button" style={({ pressed }) => [styles.button, compact && styles.compactButton, tone === "primary" && styles.primaryButton, tone === "secondary" && styles.secondaryButton, tone === "danger" && styles.dangerButton, pressed && !disabled && !loading && styles.buttonPressed, (disabled || loading) && styles.buttonDisabled, style]}><View style={styles.buttonInner}>{loading ? <ActivityIndicator color={tone === "primary" ? tokens.color.black : tokens.color.text} size="small" /> : null}{children ?? (label ? <Text style={[styles.buttonText, tone === "primary" ? styles.primaryButtonText : tone === "danger" ? styles.dangerButtonText : styles.secondaryButtonText, textStyle]}>{label}</Text> : null)}</View></Pressable>;
}

export function PrimaryButton(props: ButtonProps) { return <Button {...props} tone="primary" />; }
export function SecondaryButton(props: ButtonProps) { return <Button {...props} tone="secondary" />; }
export function DangerButton(props: ButtonProps) { return <Button {...props} tone="danger" />; }

const badgeTones: Record<BadgeTone, ViewStyle> = {
  accent: { backgroundColor: tokens.color.chipBackground, borderColor: tokens.color.chipLine },
  neutral: { backgroundColor: tokens.color.field, borderColor: tokens.color.line },
  warning: { backgroundColor: tokens.color.warningBackground, borderColor: "#73501f" },
  danger: { backgroundColor: "rgba(240, 108, 103, 0.12)", borderColor: "rgba(240, 108, 103, 0.46)" },
  info: { backgroundColor: "rgba(114, 167, 232, 0.15)", borderColor: "rgba(114, 167, 232, 0.35)" },
  success: { backgroundColor: tokens.color.activeBackground, borderColor: tokens.color.chipLine },
};
const badgeTextTones: Record<BadgeTone, TextStyle> = {
  accent: { color: tokens.color.activeText }, neutral: { color: tokens.color.muted }, warning: { color: tokens.color.warningText }, danger: { color: "#ffaaa6" }, info: { color: "#acd0fb" }, success: { color: tokens.color.activeText },
};

export function Badge({ children, tone = "accent", style, textStyle }: Children & { tone?: BadgeTone; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }) {
  return <View style={[styles.badge, badgeTones[tone], style]}><Text numberOfLines={1} style={[styles.badgeText, badgeTextTones[tone], textStyle]}>{children}</Text></View>;
}

export type FieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  helper?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function Field({ label, helper, error, containerStyle, inputStyle, multiline, ...inputProps }: FieldProps) {
  return <View style={[styles.field, containerStyle]}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...inputProps} multiline={multiline} placeholderTextColor={tokens.color.muted} selectionColor={tokens.color.green} style={[styles.input, multiline && styles.multilineInput, error && styles.inputError, inputStyle]} />{error ? <Text style={styles.fieldError}>{error}</Text> : helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}</View>;
}

export type SelectRowProps = Omit<PressableProps, "style"> & {
  label: string;
  value?: string;
  hint?: string;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SelectRow({ label, value, hint, required, style, disabled, ...props }: SelectRowProps) {
  return <Pressable {...props} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [styles.selectRow, pressed && !disabled && styles.selectRowPressed, disabled && styles.buttonDisabled, style]}><View style={styles.selectCopy}><Text style={styles.selectLabel}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>{hint ? <Text style={styles.selectHint}>{hint}</Text> : null}</View><View style={styles.selectValueWrap}><Text numberOfLines={1} style={[styles.selectValue, !value && styles.selectPlaceholder]}>{value || "Select"}</Text><Text style={styles.chevron}>›</Text></View></Pressable>;
}

export type MetricProps = { label: string; value: string | number; detail?: string; tone?: "default" | "positive" | "negative" | "warning"; style?: StyleProp<ViewStyle>; divider?: boolean };
/** Desktop-style KPI cell; usable standalone or inside MetricStrip. */
export function Metric({ label, value, detail, tone = "default", style, divider = false }: MetricProps) {
  return <View style={[styles.metric, divider && styles.metricWithDivider, style]}><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} style={[styles.metricValue, tone === "positive" && styles.metricPositive, tone === "negative" && styles.metricNegative, tone === "warning" && styles.metricWarning]}>{value}</Text>{detail ? <Text numberOfLines={1} style={styles.metricDetail}>{detail}</Text> : null}</View>;
}
export function MetricStrip({ metrics, style }: { metrics: readonly MetricProps[]; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.metricStrip, style]}>{metrics.map((metric, index) => <Metric key={`${metric.label}-${index}`} {...metric} divider={index < metrics.length - 1} />)}</View>;
}

export function EmptyState({ title = "Nothing here yet", description, action, icon = "~", style }: { title?: string; description?: string; action?: ReactNode; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.emptyState, style]}><Text style={styles.emptyIcon}>{icon}</Text><Text style={styles.emptyTitle}>{title}</Text>{description ? <Text style={styles.emptyDescription}>{description}</Text> : null}{action ? <View style={styles.emptyAction}>{action}</View> : null}</View>;
}

/** A fixed-min-width table rail that remains readable on phones by scrolling horizontally. */
export function Table({ children, minWidth = 680, style, contentStyle }: Children & { minWidth?: number; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableScrollContent} style={[styles.tableShell, style]}><View style={[{ minWidth }, contentStyle]}>{children}</View></ScrollView>;
}

export function TableRow({ children, header = false, onPress, style }: Children & { header?: boolean; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const content = <View style={[styles.tableRow, header && styles.tableHeaderRow, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.tableRowPressed}>{content}</Pressable> : content;
}

export function TableCell({ children, width, align = "left", header = false, style }: Children & { width?: number; align?: "left" | "center" | "right"; header?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.tableCell, width ? { width } : styles.tableCellFlex, style]}><Text numberOfLines={1} style={[header ? styles.tableHeading : styles.tableCellText, align === "center" && styles.textCenter, align === "right" && styles.textRight]}>{children}</Text></View>;
}

export function ResponsiveGrid({ children, minColumnWidth = 160, style }: Children & { minColumnWidth?: number; style?: StyleProp<ViewStyle> }) {
  const { width } = useWindowDimensions();
  const columns = width >= 940 ? 4 : width >= 620 ? 3 : width >= 390 ? 2 : 1;
  return <View style={[styles.grid, style]}>{Array.isArray(children) ? children.map((child, index) => <View key={index} style={{ width: `${100 / columns}%`, minWidth: Math.min(minColumnWidth, Math.floor(width / columns)) }}>{child}</View>) : children}</View>;
}

export function useIsTablet() { return useWindowDimensions().width >= 720; }

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  screenContent: { width: "100%", maxWidth: tokens.size.pageMax, alignSelf: "center", paddingHorizontal: tokens.space.page, paddingTop: tokens.space.lg, paddingBottom: 48, gap: tokens.space.lg },
  topBar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: tokens.space.md, paddingBottom: tokens.space.md, borderBottomWidth: 1, borderColor: tokens.color.line },
  topBarCopy: { flex: 1, gap: 3 }, topBarActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: tokens.space.xs },
  eyebrow: textStyles.label, screenTitle: textStyles.screenTitle, subtitle: textStyles.muted,
  panel: { backgroundColor: tokens.color.panel, borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.md, padding: tokens.space.lg, gap: tokens.space.sm, ...tokens.shadow },
  panelCompact: { padding: tokens.space.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm, marginBottom: tokens.space.xs }, sectionHeaderCopy: { flex: 1, gap: 2 }, sectionAction: { alignItems: "flex-end" },
  sectionTitle: textStyles.section, panelTitle: textStyles.label, sectionSubtitle: textStyles.muted,
  button: { minHeight: tokens.size.control, borderWidth: 1, borderRadius: tokens.radius.control, paddingHorizontal: tokens.space.md, justifyContent: "center", alignItems: "center" }, compactButton: { minHeight: tokens.size.compactControl, paddingHorizontal: tokens.space.sm }, buttonInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: tokens.space.xs },
  primaryButton: { backgroundColor: tokens.color.green, borderColor: tokens.color.green }, secondaryButton: { backgroundColor: tokens.color.panelSoft, borderColor: tokens.color.line }, dangerButton: { backgroundColor: "rgba(240, 108, 103, 0.08)", borderColor: "transparent" }, buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] }, buttonDisabled: { opacity: 0.48 },
  buttonText: { fontSize: tokens.type.compact, fontWeight: "800" }, primaryButtonText: { color: tokens.color.black }, secondaryButtonText: { color: tokens.color.text }, dangerButtonText: { color: tokens.color.red },
  badge: { maxWidth: "100%", alignSelf: "flex-start", borderWidth: 1, borderRadius: tokens.radius.pill, paddingVertical: 3, paddingHorizontal: tokens.space.xs }, badgeText: { fontSize: tokens.type.label, fontWeight: "800" },
  field: { gap: 6 }, fieldLabel: textStyles.label, input: { minHeight: tokens.size.control, borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.control, backgroundColor: tokens.color.field, color: tokens.color.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: tokens.type.body }, multilineInput: { minHeight: 96, textAlignVertical: "top" }, inputError: { borderColor: tokens.color.red }, fieldHelper: textStyles.muted, fieldError: { color: "#ffaaa6", fontSize: tokens.type.compact, fontWeight: "700" },
  selectRow: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm, paddingHorizontal: tokens.space.md, borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.control, backgroundColor: tokens.color.field }, selectRowPressed: { backgroundColor: tokens.color.hover }, selectCopy: { flex: 1, gap: 2 }, selectLabel: { color: tokens.color.text, fontSize: tokens.type.compact, fontWeight: "800" }, selectHint: textStyles.muted, required: { color: tokens.color.red }, selectValueWrap: { maxWidth: "52%", flexDirection: "row", alignItems: "center", gap: tokens.space.xs }, selectValue: { flexShrink: 1, color: tokens.color.text, fontSize: tokens.type.compact, fontWeight: "700" }, selectPlaceholder: { color: tokens.color.muted }, chevron: { color: tokens.color.greenDark, fontSize: 24, lineHeight: 24 },
  metricStrip: { flexDirection: "row", overflow: "hidden", borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.md, backgroundColor: tokens.color.panel }, metric: { flex: 1, minWidth: 0, paddingVertical: 15, paddingHorizontal: 10, gap: 4 }, metricWithDivider: { borderRightWidth: 1, borderRightColor: tokens.color.line }, metricLabel: {...textStyles.label,fontSize:10}, metricValue: { color: tokens.color.text, fontSize: 22, fontWeight: "800" }, metricDetail: textStyles.muted, metricPositive: { color: "#8be6b5" }, metricNegative: { color: "#ffaaa6" }, metricWarning: { color: tokens.color.warningText },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 42, paddingHorizontal: tokens.space.lg, gap: tokens.space.xs }, emptyIcon: { color: tokens.color.greenDark, fontSize: 28, fontWeight: "300" }, emptyTitle: { color: tokens.color.text, fontSize: tokens.type.section, fontWeight: "800", textAlign: "center" }, emptyDescription: { maxWidth: 320, color: tokens.color.muted, fontSize: tokens.type.body, lineHeight: 21, textAlign: "center" }, emptyAction: { marginTop: tokens.space.xs },
  tableShell: { borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.md, backgroundColor: tokens.color.panel }, tableScrollContent: { flexGrow: 1 }, tableRow: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: tokens.space.md, borderBottomWidth: 1, borderColor: tokens.color.line }, tableHeaderRow: { minHeight: 42, backgroundColor: tokens.color.panelSoft }, tableRowPressed: { backgroundColor: tokens.color.hover }, tableCell: { paddingRight: tokens.space.sm }, tableCellFlex: { flex: 1 }, tableHeading: { color: tokens.color.muted, fontSize: tokens.type.tableHeader, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" }, tableCellText: { color: tokens.color.text, fontSize: tokens.type.compact }, textCenter: { textAlign: "center" }, textRight: { textAlign: "right" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -tokens.space.xs },
});
