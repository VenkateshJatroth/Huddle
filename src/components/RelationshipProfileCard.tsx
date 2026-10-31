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
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole={onCardPress ? "button" : undefined}
          accessibilityLabel={onCardPress ? `View profile of ${profile.display_name}` : undefined}
          onPress={onCardPress}
          disabled={!onCardPress}
          style={styles.avatarPressable}
        >
          <Avatar
            name={profile.display_name}
            tone={profile.username.length % 5}
            size={48}
            imageSource={profile.avatar_url ? { uri: profile.avatar_url } : undefined}
            imageKey={profile.avatar_url ?? profile.id}
          />
        </Pressable>

        <Pressable
          accessibilityRole={onCardPress ? "button" : undefined}
          accessibilityLabel={onCardPress ? `View profile of ${profile.display_name}` : undefined}
          onPress={onCardPress}
          disabled={!onCardPress}
          style={styles.identity}
        >
          <Text style={[styles.name, { color: colors.text }]}>{profile.display_name}</Text>
          <Text style={[styles.username, { color: colors.secondary }]}>@{profile.username}</Text>
          {profile.is_private ? <Text style={[styles.privacy, { color: colors.secondary }]}>Private profile</Text> : null}
        </Pressable>

        <View style={styles.actionButtonsRow}>
          {onMessage ? (
            <AppButton
              label="Chat"
              variant="subtle"
              icon="chat"
              onPress={onMessage}
            />
          ) : null}

          {actionLabel && onAction ? (
            <AppButton
              label={actionLabel}
              accessibilityLabel={actionAccessibilityLabel}
              variant={actionVariant}
              icon={actionIcon}
              disabled={actionDisabled}
              onPress={onAction}
            />
          ) : null}
        </View>
      </View>
      {statusLabel ? <Text style={[styles.status, { color: colors.accent }]}>{statusLabel}</Text> : null}
      {profile.bio ? <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text> : null}
      {secondaryAction}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatarPressable: { borderRadius: 14 },
  identity: { flex: 1, minWidth: 0, gap: 3 },
  actionButtonsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 15, fontWeight: "700" },
  username: { fontSize: 12 },
  privacy: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  status: { fontSize: 12, fontWeight: "700" },
  bio: { fontSize: 14, lineHeight: 20 },
});
