import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppColors } from "../theme/colors";
import { Icon, type AppIconName } from "./Icon";

type AppScreenProps = PropsWithChildren<{ keyboardAware?: boolean }>;

export function AppScreen({ children }: AppScreenProps) {
  const colors = useAppColors();

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeading({
  title,
  subtitle,
  eyebrow,
  trailing,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  trailing?: ReactNode;
}) {
  const colors = useAppColors();

  return (
    <View style={styles.headingRow}>
      <View style={styles.headingText}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.accentStrong }]}>{eyebrow}</Text> : null}
        <Text style={[styles.pageTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.pageSubtitle, { color: colors.secondary }]}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  const colors = useAppColors();

  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action}
    </View>
  );
}

export function Avatar({ name, tone = 0, size = 44 }: { name: string; tone?: number; size?: number }) {
  const colors = useAppColors();
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const backgroundColor = colors.avatarBackgrounds[tone % colors.avatarBackgrounds.length];

  return (
    <View
      accessible
      accessibilityLabel={`${name}'s avatar`}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.avatarText, { color: colors.accentStrong, fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  badge,
}: {
  name: AppIconName;
  label: string;
  onPress: () => void;
  badge?: string;
}) {
  const colors = useAppColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={name} color={colors.text} size={21} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.badgeText, { color: "#171717" }]}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function AppButton({
  label,
  onPress,
  variant = "primary",
  icon,
  selected,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "subtle" | "text";
  icon?: AppIconName;
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const colors = useAppColors();
  const filled = variant === "primary";
  const subtle = variant === "subtle";
  const textOnly = variant === "text";
  const backgroundColor = filled ? colors.accent : subtle ? colors.subtle : "transparent";
  const borderColor = variant === "outline" ? colors.border : "transparent";
  const foreground = filled ? "#171717" : variant === "text" ? colors.accentStrong : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={3}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor, opacity: disabled ? 0.5 : pressed ? 0.72 : 1 },
        selected && !filled ? { backgroundColor: colors.accentSoft, borderColor: colors.accent } : null,
        textOnly ? styles.textButton : null,
      ]}
    >
      {icon ? <Icon name={icon} color={foreground} size={17} /> : null}
      <Text style={[styles.buttonText, { color: foreground }, textOnly ? styles.textButtonLabel : null]}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceChip({
  label,
  selected = false,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: AppIconName;
}) {
  const colors = useAppColors();
  const content = (
    <>
      {icon ? <Icon name={icon} color={selected ? colors.accentStrong : colors.secondary} size={15} /> : null}
      <Text style={[styles.chipText, { color: selected ? colors.accentStrong : colors.secondary }]}>{label}</Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>{content}</View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={3}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const colors = useAppColors();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function LocalPreviewNotice({ children }: PropsWithChildren) {
  const colors = useAppColors();
  return (
    <View style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
      <Icon name="sparkles" color={colors.accentStrong} size={17} />
      <Text style={[styles.noticeText, { color: colors.secondary }]}>{children}</Text>
    </View>
  );
}

export function MutedText({ children }: PropsWithChildren) {
  const colors = useAppColors();
  return <Text style={[styles.mutedText, { color: colors.secondary }]}>{children}</Text>;
}

export const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  spread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  gap8: { gap: 8 },
  gap10: { gap: 10 },
  gap12: { gap: 12 },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 20 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headingText: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" },
  pageTitle: { fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.6 },
  pageSubtitle: { fontSize: 14, lineHeight: 20 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 },
  sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: "700" },
  avatar: { borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontWeight: "700" },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -1, right: -1, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 10, fontWeight: "800" },
  button: { minHeight: 42, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  buttonText: { fontSize: 14, fontWeight: "700" },
  textButton: { paddingHorizontal: 2, borderWidth: 0 },
  textButtonLabel: { fontSize: 13 },
  chip: { minHeight: 38, borderWidth: 1, borderRadius: 19, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  chipText: { fontSize: 13, fontWeight: "600" },
  card: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 14 },
  notice: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  mutedText: { fontSize: 13, lineHeight: 19 },
});
