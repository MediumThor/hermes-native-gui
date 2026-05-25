import Markdown from "react-native-markdown-display";
import { useMemo } from "react";
import { Platform, StyleSheet } from "react-native";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

type Props = {
  text: string;
};

function createMarkdownStyles(colors: NativeThemeColors) {
  const mono = Platform.select({ web: "Menlo, monospace", default: undefined });
  return StyleSheet.create({
    body: { color: colors.midground, fontSize: 15, lineHeight: 22 },
    text: { color: colors.midground, fontSize: 15, lineHeight: 22 },
    textgroup: { color: colors.midground, fontSize: 15, lineHeight: 22 },
    heading1: { color: colors.midground, fontSize: 22, fontWeight: "800", marginBottom: 8 },
    heading2: { color: colors.midground, fontSize: 19, fontWeight: "800", marginBottom: 6 },
    heading3: { color: colors.midground, fontSize: 17, fontWeight: "700", marginBottom: 4 },
    paragraph: { marginTop: 0, marginBottom: 8 },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    list_item: { marginBottom: 4 },
    bullet_list_content: { flex: 1, flexShrink: 1 },
    ordered_list_content: { flex: 1, flexShrink: 1 },
    bullet_list_icon: { color: colors.success, marginRight: 8, lineHeight: 22 },
    ordered_list_icon: { color: colors.success, marginRight: 8, lineHeight: 22 },
    strong: { fontWeight: "800", color: colors.midground },
    em: { fontStyle: "italic", color: colors.midgroundFaint },
    code_inline: {
      color: colors.midground,
      backgroundColor: colors.accent,
      borderWidth: 0,
      borderColor: "transparent",
      padding: 0,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: mono,
    },
    code_block: {
      color: colors.midgroundFaint,
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: mono,
    },
    fence: {
      color: colors.midgroundFaint,
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: mono,
    },
    blockquote: {
      backgroundColor: colors.surfaceElevated,
      borderLeftColor: colors.borderStrong,
      borderLeftWidth: 3,
      paddingLeft: 10,
      color: colors.midgroundFaint,
      marginVertical: 8,
    },
    link: { color: colors.success, textDecorationLine: "underline" },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: 12,
    },
  });
}

export function MarkdownMessage({ text }: Props) {
  const { colors } = useDashboardTheme();
  const markdownStyles = useMemo(() => createMarkdownStyles(colors), [colors]);
  return <Markdown style={markdownStyles} mergeStyle>{text}</Markdown>;
}
