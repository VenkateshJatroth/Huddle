import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { DiscoverProfile } from "../lib/gormati-profiles";
import { useAppColors } from "../theme/colors";
import { Avatar, Card, ChoiceChip, VerifiedBadge } from "./ui";
import { Icon } from "./Icon";

type GormatiDiscoverCardProps = {
  profile: DiscoverProfile;
  onLike: (profile: DiscoverProfile) => Promise<void> | void;
  onPass: (profile: DiscoverProfile) => void;
  isLiked?: boolean;
};

export function GormatiDiscoverCard({
  profile,
  onLike,
  onPass,
  isLiked = false,
}: GormatiDiscoverCardProps) {
  const colors = useAppColors();
  const [isLiking, setIsLiking] = useState(false);

  const handleLike = async () => {
    if (isLiking || isLiked) return;
    setIsLiking(true);
    try {
      await onLike(profile);
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => router.push(("/member/" + profile.id) as never)}
        accessibilityRole="button"
        accessibilityLabel={`View full profile for ${profile.display_name}`}
        style={styles.cardContent}
      >
        <View style={styles.header}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Avatar name={profile.display_name} tone={1} size={68} />
          )}

          <View style={styles.identity}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.text }]}>
                {profile.display_name}
                {profile.age ? `, ${profile.age}` : ""}
              </Text>
              {profile.is_verified ? <VerifiedBadge /> : null}
            </View>
            <Text style={[styles.handle, { color: colors.secondary }]}>@{profile.username}</Text>

            <View style={styles.badgeRow}>
              {profile.location ? (
                <View style={styles.metaItem}>
                  <Icon name="location" color={colors.secondary} size={14} />
                  <Text style={[styles.metaText, { color: colors.secondary }]}>{profile.location}</Text>
                </View>
              ) : null}

              {profile.dating_intention ? (
                <View style={[styles.intentionPill, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[styles.intentionText, { color: colors.accent }]}>
                    {profile.dating_intention}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {profile.bio ? (
          <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text>
        ) : null}

        {profile.interests && profile.interests.length > 0 ? (
          <View style={styles.chips}>
            {profile.interests.map((interest) => (
              <ChoiceChip key={interest} label={interest} />
            ))}
          </View>
        ) : null}

        {/* Prompts display if any */}
        {profile.prompts && profile.prompts.length > 0 ? (
          <View style={styles.promptsContainer}>
            {profile.prompts.slice(0, 2).map((prompt, index) => (
              <View
                key={index}
                style={[styles.promptCard, { backgroundColor: colors.subtle, borderColor: colors.border }]}
              >
                <Text style={[styles.promptQuestion, { color: colors.secondary }]}>
                  {prompt.question}
                </Text>
                <Text style={[styles.promptAnswer, { color: colors.text }]}>
                  {prompt.answer}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>

      {/* Action Buttons: Pass (X) and Like (Heart) */}
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pass on ${profile.display_name}`}
          onPress={() => onPass(profile)}
          style={({ pressed }) => [
            styles.actionButton,
            styles.passButton,
            { borderColor: colors.border, backgroundColor: pressed ? colors.subtle : colors.surface },
          ]}
        >
          <Icon name="close" color={colors.secondary} size={22} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Like ${profile.display_name}`}
          onPress={() => { void handleLike(); }}
          disabled={isLiked || isLiking}
          style={({ pressed }) => [
            styles.actionButton,
            styles.likeButton,
            {
              backgroundColor: isLiked ? colors.accentStrong : colors.accent,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          {isLiking ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Icon name="heart" color="#FFFFFF" size={22} />
          )}
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 16 },
  cardContent: { gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarImage: { width: 68, height: 68, borderRadius: 16, backgroundColor: "#E5E5EA" },
  identity: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  name: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  handle: { fontSize: 13 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12 },
  intentionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  intentionText: {
    fontSize: 11,
    fontWeight: "700",
  },
  bio: { fontSize: 14, lineHeight: 21 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  promptsContainer: { gap: 8, marginTop: 4 },
  promptCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  promptQuestion: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  promptAnswer: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
    marginTop: 6,
    paddingTop: 8,
  },
  actionButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  passButton: {
    borderWidth: 1.5,
  },
  likeButton: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
});

