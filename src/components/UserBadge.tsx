import { StyleSheet, Text, View } from "react-native";
import type { UserBadgeInfo } from "../lib/badges";

export function UserBadge({
  badge,
  compact = false,
}: {
  badge: UserBadgeInfo;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.badgeContainer,
        { backgroundColor: badge.bgLight },
        compact && styles.compactContainer,
      ]}
    >
      <Text style={styles.badgeEmoji}>{badge.emoji}</Text>
      {!compact ? (
        <Text style={[styles.badgeText, { color: badge.textColor }]}>{badge.name}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 999,
  },
  compactContainer: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  badgeEmoji: {
    fontSize: 11,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
