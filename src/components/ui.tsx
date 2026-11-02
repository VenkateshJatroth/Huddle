import type { PropsWithChildren, ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image, type ImageSource } from "expo-image";
import { useAppColors } from "../theme/colors";
import { Icon, type AppIconName } from "./Icon";

type AppScreenProps = PropsWithChildren<{
  keyboardAware?: boolean;
  refreshControl?: React.ReactElement;
}>;

export function AppScreen({ children, refreshControl }: AppScreenProps) {
  const colors = useAppColors();

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
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
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.secondary }]}>{eyebrow}</Text> : null}
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

export function Avatar({
  name,
  tone = 0,
  size = 44,
  imageSource,
  imageKey,
  imageTileIndex,
}: {
  name: string;
  tone?: number;
  size?: number;
  imageSource?: ImageSource | string | number;
  imageKey?: string;
  imageTileIndex?: number;
}) {
  const colors = useAppColors();
  const [failedImageKey, setFailedImageKey] = useState<string>();
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const backgroundColor = colors.avatarBackgrounds[tone % colors.avatarBackgrounds.length];
  const resolvedImageKey = imageKey ?? name;
  const showImage = imageSource !== undefined && failedImageKey !== resolvedImageKey;
  const imageArea = Math.max(size - 4, 0);
  const isImageSheet = imageTileIndex !== undefined;
  const imageTileSize = isImageSheet ? imageArea : size;
  const imageWidth = isImageSheet ? imageTileSize * 3 : imageTileSize;
  const imageLeft = isImageSheet ? -(imageTileIndex % 3) * imageTileSize : 0;
  const imageTop = isImageSheet ? -Math.floor(imageTileIndex / 3) * imageTileSize : 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name}'s avatar`}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          backgroundColor,
          borderColor: colors.border,
          borderRadius: 14,
        },
      ]}
    >
      {showImage ? (
        <Image
          accessible={false}
          source={imageSource}
          contentFit={isImageSheet ? "fill" : "cover"}
          accessibilityLabel={`${name}'s portrait`}
          onError={() => setFailedImageKey(resolvedImageKey)}
          style={[styles.avatarImage, { width: imageWidth, height: imageWidth, left: imageLeft, top: imageTop }]}
        />
      ) : (
        <Text style={[styles.avatarText, { color: colors.accent, fontSize: size * 0.34 }]}>{initials}</Text>
      )}
    </View>
  );
}

export function VerifiedBadge({ size = 16 }: { size?: number }) {
  const colors = useAppColors();
  return (
    <View
      accessibilityLabel="Verified"
      style={[styles.verifiedBadge, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.verified }]}
    >
      <Icon name="check" color="#FFFFFF" size={size * 0.65} />
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
      <Icon name={name} color={colors.text} size={20} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.badgeText, { color: "#FFFFFF" }]}>{badge}</Text>
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
  const isAccentWhite =
    colors.accent.toUpperCase() === "#FFFFFF" ||
    colors.accent.toLowerCase() === "#fff" ||
    colors.accent.toLowerCase() === "white";
  const foreground = filled
    ? isAccentWhite
      ? "#09090B"
      : "#FFFFFF"
    : variant === "text"
      ? colors.accent
      : colors.text;

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
      <Text
        style={[
          styles.buttonText,
          { color: foreground, fontWeight: filled && isAccentWhite ? "700" : "600" },
          textOnly ? styles.textButtonLabel : null,
        ]}
      >
        {label}
      </Text>
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
  const isSelectedBgWhite =
    colors.accent.toUpperCase() === "#FFFFFF" ||
    colors.accent.toLowerCase() === "#fff" ||
    colors.accent.toLowerCase() === "white";
  const chipForeground = selected
    ? isSelectedBgWhite
      ? "#09090B"
      : "#FFFFFF"
    : colors.secondary;
  const content = (
    <>
      {icon ? <Icon name={icon} color={chipForeground} size={15} /> : null}
      <Text
        style={[
          styles.chipText,
          {
            color: chipForeground,
            fontWeight: selected ? "700" : "600",
          },
        ]}
      >
        {label}
      </Text>
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
          backgroundColor: selected ? colors.accent : colors.surface,
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

export function ChatBubble({
  message,
  sent = true,
  timestamp,
  imageUrl,
  read = false,
}: {
  message: string;
  sent?: boolean;
  timestamp?: string;
  imageUrl?: string | null;
  read?: boolean;
}) {
  const colors = useAppColors();
  const backgroundColor = sent ? colors.accent : colors.subtle;
  const textColor = sent ? "#FFFFFF" : colors.text;
  const metaColor = sent ? "rgba(255,255,255,0.75)" : colors.secondary;

  return (
    <View
      style={[
        styles.chatBubble,
        sent ? styles.chatBubbleSent : styles.chatBubbleReceived,
        { backgroundColor },
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.chatBubbleImage}
          contentFit="cover"
        />
      ) : null}
      {message ? (
        <Text style={[styles.chatBubbleText, { color: textColor }]}>{message}</Text>
      ) : null}
      <View style={styles.chatBubbleMeta}>
        {timestamp ? (
          <Text style={[styles.chatBubbleTime, { color: metaColor }]}>{timestamp}</Text>
        ) : null}
        {sent ? (
          <Text style={[styles.chatBubbleCheck, { color: read ? "#4CD964" : metaColor }]}>
            {read ? "✓✓" : "✓"}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function LocalPreviewNotice({ children }: PropsWithChildren) {
  const colors = useAppColors();
  return (
    <View style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
      <Icon name="sparkles" color={colors.accent} size={17} />
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
  scrollContent: { width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 18 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headingText: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  pageTitle: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, lineHeight: 19 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  avatar: { borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  avatarImage: { position: "absolute" },
  avatarText: { fontWeight: "700" },
  verifiedBadge: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
  iconButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 10, fontWeight: "700" },
  button: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  buttonText: { fontSize: 13, fontWeight: "600" },
  textButton: { paddingHorizontal: 2, borderWidth: 0 },
  textButtonLabel: { fontSize: 13 },
  chip: { minHeight: 34, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  chipText: { fontSize: 12, fontWeight: "600" },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 14 },
  chatBubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, gap: 4 },
  chatBubbleSent: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  chatBubbleReceived: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  chatBubbleText: { fontSize: 14, lineHeight: 20 },
  chatBubbleImage: { width: 200, height: 150, borderRadius: 10, marginBottom: 4 },
  chatBubbleMeta: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", gap: 4 },
  chatBubbleTime: { fontSize: 10 },
  chatBubbleCheck: { fontSize: 11, fontWeight: "700" },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  mutedText: { fontSize: 13, lineHeight: 19 },
});
