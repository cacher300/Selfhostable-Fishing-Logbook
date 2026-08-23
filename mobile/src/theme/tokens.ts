import type { TextStyle, ViewStyle } from "react-native";

/**
 * The desktop application's dark theme, translated directly from
 * static/css/base.css.  Keep colors semantic so native screens cannot drift
 * into feature-specific palettes.
 */
export const tokens = {
  color: {
    background: "#0e141b",
    panel: "#151d26",
    panelSoft: "#101821",
    field: "#0f1720",
    fieldSoft: "#111b25",
    line: "#2b3848",
    text: "#edf4fb",
    muted: "#a3afbf",
    green: "#38b878",
    greenDark: "#6fdda1",
    red: "#f06c67",
    amber: "#f3b65e",
    blue: "#72a7e8",
    hover: "#1c2835",
    activeBackground: "#10281f",
    activeText: "#8be6b5",
    chipBackground: "#10281f",
    chipLine: "#23563e",
    warningBackground: "#332514",
    warningText: "#ffd38a",
    black: "#0b1118",
  },
  space: { xxs: 4, xs: 8, sm: 10, md: 14, lg: 16, xl: 22, xxl: 30, page: 20 },
  radius: { sm: 7, md: 8, control: 10, lg: 14, pill: 999 },
  size: { control: 40, compactControl: 30, iconControl: 38, pageMax: 1280 },
  type: {
    title: 30,
    screenTitle: 24,
    section: 18,
    body: 15,
    compact: 13,
    label: 12,
    tableHeader: 11,
    metric: 24,
  },
  font: {
    regular: "System",
    medium: "System",
    bold: "System",
  },
  shadow: {
    boxShadow: "0 14px 36px rgba(0, 0, 0, 0.28)",
  } satisfies ViewStyle,
} as const;

export const textStyles = {
  title: { color: tokens.color.text, fontSize: tokens.type.title, fontWeight: "800", letterSpacing: -0.35 } satisfies TextStyle,
  screenTitle: { color: tokens.color.text, fontSize: tokens.type.screenTitle, fontWeight: "800", letterSpacing: -0.2 } satisfies TextStyle,
  section: { color: tokens.color.text, fontSize: tokens.type.section, fontWeight: "800" } satisfies TextStyle,
  body: { color: tokens.color.text, fontSize: tokens.type.body, lineHeight: 21 } satisfies TextStyle,
  muted: { color: tokens.color.muted, fontSize: tokens.type.compact, lineHeight: 19 } satisfies TextStyle,
  label: { color: tokens.color.muted, fontSize: tokens.type.label, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" } satisfies TextStyle,
} as const;

export type BadgeTone = "accent" | "neutral" | "warning" | "danger" | "info" | "success";
