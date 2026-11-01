import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RelationshipProfileSummary } from "../lib/relationships";
import { useAppColors } from "../theme/colors";
import type { AppIconName } from "./Icon";
import { AppButton, Avatar, Card } from "./ui";

export function RelationshipProfileCard({
  profile,
  statusLabel,
  actionLabel,
  actionAccessibilityLabel,
  actionVariant = "primary",
  actionIcon,
  actionDisabled = false,
  onAction,
  onCardPress,
  onMessage,
  secondaryAction,
}: {
  profile: RelationshipProfileSummary;
  statusLabel?: string;
  actionLabel?: string;
  actionAccessibilityLabel?: string;
  actionVariant?: "primary" | "outline" | "subtle" | "text";
  actionIcon?: AppIconName;
  actionDisabled?: boolean;
  onAction?: () => void;
  onCardPress?: () => void;
  onMessage?: () => void;
  secondaryAction?: ReactNode;
}) {
  const colors = useAppColors();

  return (
    <Card style={styles.card}>
      {/* Top Row: Full-width Identity Header (Avatar + Full Name + @handle) */}
      <Pressable
        accessibilityRole={onCardPress ? "button" : undefined}
        accessibilityLabel={onCardPress ? `View profile of ${profile.display_name}` : undefined}
        onPress={onCardPress}
        disabled={!onCardPress}
        style={styles.topRow}
      >
        <Avatar
          name={profile.display_name}
          tone={profile.username.length % 5}
          size={50}
          imageSource={profile.avatar_url ? { uri: profile.avatar_url } : undefined}
          imageKey={profile.avatar_url ?? profile.id}
        />

        <View style={styles.identity}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
            {profile.display_name}
          </Text>
          <Text numberOfLines={1} style={[styles.username, { color: colors.secondary }]}>
            @{profile.username}
          </Text>
          {profile.is_private ? (
            <Text style={[styles.privacy, { color: colors.secondary }]}>Private profile</Text>
          ) : null}
        </View>

        {statusLabel ? (
          <View style={[styles.statusBadge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.status, { color: colors.accent }]}>{statusLabel}</Text>
          </View>
        ) : null}
      </Pressable>

      {/* Bio snippet */}
      {profile.bio ? (
        <Text numberOfLines={2} style={[styles.bio, { color: colors.text }]}>
          {profile.bio}
        </Text>
      ) : null}

      {/* Clean Action Row Underneath (Full 2-column or full width) */}
      {(onMessage || (actionLabel && onAction)) ? (
        <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
          {onMessage ? (
            <View style={styles.actionCol}>
              <AppButton
                label="Chat"
                variant="subtle"
                icon="chat"
                onPress={onMessage}
              />
            </View>
          ) : null}

          {actionLabel && onAction ? (
            <View style={styles.actionCol}>
              <AppButton
                label={actionLabel}
                accessibilityLabel={actionAccessibilityLabel}
                variant={actionVariant}
                icon={actionIcon}
                disabled={actionDisabled}
                onPress={onAction}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {secondaryAction}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 14 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  username: { fontSize: 13 },
  privacy: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  status: { fontSize: 11, fontWeight: "700" },
  bio: { fontSize: 13, lineHeight: 19 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionCol: { flex: 1 },
});
