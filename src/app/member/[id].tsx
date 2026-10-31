import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { Icon } from "../../components/Icon";
import { SafetyActionModal } from "../../components/SafetyActionModal";
import {
  AppButton,
  Avatar,
  Card,
  ChoiceChip,
  VerifiedBadge,
} from "../../components/ui";
import { fetchMemberProfile, recordLike } from "../../lib/gormati-profiles";
import type { GormatiProfile } from "../../lib/gormati-profiles";
import { useAppColors } from "../../theme/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function MemberProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useAppColors();
  const { user } = useAuth();

  const [profile, setProfile] = useState<GormatiProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      if (!id) return;
      setIsLoading(true);
      try {
        const data = await fetchMemberProfile(id);
        if (isCurrent) setProfile(data);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    void load();
    return () => { isCurrent = false; };
  }, [id]);

  const handleLike = async () => {
    if (!profile || isLiking || isLiked) return;
    setIsLiking(true);
    try {
      await recordLike(profile.id);
      setIsLiked(true);
    } finally {
      setIsLiking(false);
    }
  };

  const handlePass = () => {
    router.back();
  };

  const handleMessage = () => {
    if (!profile) return;
    router.push(("/chat/" + profile.id) as never);
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.loadingText, { color: colors.secondary }]}>Loading Gormati member…</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Member not found</Text>
        <Text style={[styles.loadingText, { color: colors.secondary }]}>
          This profile might be private or no longer available.
        </Text>
        <AppButton label="Go back" variant="outline" onPress={() => router.back()} />
      </View>
    );
  }

  const gallery = profile.gallery_urls && profile.gallery_urls.length > 0
    ? profile.gallery_urls
    : profile.avatar_url
    ? [profile.avatar_url]
    : [];

  const prompts = Array.isArray(profile.prompts)
    ? (profile.prompts as { question: string; answer: string }[])
    : [];

  const interests = Array.isArray(profile.interests)
    ? (profile.interests as string[])
    : [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header Bar */}
      <View style={[styles.navBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Icon name="chevronRight" color={colors.text} size={20} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.navTitle, { color: colors.text }]}>
          {profile.display_name}
        </Text>
        <View style={styles.navRight}>
          {profile.is_verified ? <VerifiedBadge /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Member safety options"
            onPress={() => setSafetyModalVisible(true)}
            style={styles.optionsButton}
          >
            <Icon name="more" color={colors.text} size={20} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Photo Carousel or Avatar */}
        {gallery.length > 0 ? (
          <View style={styles.carouselContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const index = Math.round(offsetX / SCREEN_WIDTH);
                setActivePhotoIndex(index);
              }}
              scrollEventThrottle={16}
            >
              {gallery.map((uri, idx) => (
                <Image
                  key={idx}
                  source={{ uri }}
                  style={[styles.carouselImage, { width: SCREEN_WIDTH }]}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>

            {gallery.length > 1 ? (
              <View style={styles.dotsRow}>
                {gallery.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.dot,
                      { backgroundColor: idx === activePhotoIndex ? "#FFFFFF" : "rgba(255,255,255,0.4)" },
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.avatarHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Avatar name={profile.display_name} tone={1} size={110} />
          </View>
        )}

        {/* Identity & Core Badges */}
        <Card style={styles.identityCard}>
          <View style={styles.nameHeader}>
            <View style={styles.nameRow}>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {profile.display_name}
                {profile.age ? `, ${profile.age}` : ""}
              </Text>
              {profile.is_verified ? <VerifiedBadge /> : null}
            </View>
            <Text style={[styles.profileHandle, { color: colors.secondary }]}>@{profile.username}</Text>
          </View>

          {/* Location & Dating Intention Pills */}
          <View style={styles.pillRow}>
            {profile.location ? (
              <View style={[styles.metaPill, { backgroundColor: colors.subtle, borderColor: colors.border }]}>
                <Icon name="location" color={colors.secondary} size={14} />
                <Text style={[styles.metaPillText, { color: colors.text }]}>{profile.location}</Text>
              </View>
            ) : null}

            {profile.dating_intention ? (
              <View style={[styles.intentionPill, { backgroundColor: colors.accent }]}>
                <Text style={styles.intentionPillText}>
                  {profile.dating_intention}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Bio */}
          {profile.bio ? (
            <Text style={[styles.bioText, { color: colors.text }]}>{profile.bio}</Text>
          ) : null}
        </Card>

        {/* Compatibility Score Card */}
        <Card style={[styles.compatCard, { backgroundColor: colors.surface }]}>
          <View style={styles.compatHeader}>
            <View style={[styles.compatBadge, { backgroundColor: colors.accent }]}>
              <Icon name="sparkles" color="#FFFFFF" size={16} />
              <Text style={styles.compatScoreText}>94% Match</Text>
            </View>
            <Text style={[styles.compatTitle, { color: colors.text }]}>Strong Cultural & Lifestyle Alignment</Text>
          </View>
          <Text style={[styles.compatDescription, { color: colors.secondary }]}>
            You both value authentic community conversations, literature, and weekend outdoor exploration.
          </Text>
        </Card>

        {/* Prompt Answer Cards */}
        {prompts.length > 0 ? (
          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Conversation Prompts</Text>
            {prompts.map((prompt, idx) => (
              <Card key={idx} style={[styles.promptCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.promptQuestion, { color: colors.secondary }]}>
                  {prompt.question}
                </Text>
                <Text style={[styles.promptAnswer, { color: colors.text }]}>
                  {prompt.answer}
                </Text>
              </Card>
            ))}
          </View>
        ) : null}

        {/* Interests */}
        {interests.length > 0 ? (
          <Card style={styles.interestsCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Passions & Interests</Text>
            <View style={styles.chipsWrap}>
              {interests.map((interest) => (
                <ChoiceChip key={interest} label={interest} />
              ))}
            </View>
          </Card>
        ) : null}

        {/* Gallery Grid if more than 1 image */}
        {gallery.length > 1 ? (
          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Photo Gallery</Text>
            <View style={styles.galleryGrid}>
              {gallery.map((uri, idx) => (
                <Image key={idx} source={{ uri }} style={styles.gridImage} resizeMode="cover" />
              ))}
            </View>
          </View>
        ) : null}

        {/* Extra spacing for sticky bottom bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pass"
          onPress={handlePass}
          style={({ pressed }) => [
            styles.roundActionButton,
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
            styles.roundActionButton,
            {
              backgroundColor: isLiked ? colors.accentStrong : colors.accent,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          {isLiking ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Icon name="heart" color="#FFFFFF" size={22} />
          )}
        </Pressable>

        <View style={{ flex: 1 }}>
          <AppButton
            label={`Message ${profile.display_name.split(" ")[0]}`}
            icon="chat"
            onPress={handleMessage}
          />
        </View>
      </View>

      {profile && user ? (
        <SafetyActionModal
          visible={safetyModalVisible}
          onClose={() => setSafetyModalVisible(false)}
          memberName={profile.display_name}
          memberId={profile.id}
          currentUserId={user.id}
          onBlockedOrReported={() => {
            router.back();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  loadingText: { fontSize: 14 },
  errorTitle: { fontSize: 18, fontWeight: "800" },
  navBar: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", transform: [{ rotate: "180deg" }] },
  navTitle: { fontSize: 16, fontWeight: "800", flex: 1, textAlign: "center" },
  navRight: { minWidth: 36, flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" },
  optionsButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  scrollContent: { gap: 16 },
  carouselContainer: { width: SCREEN_WIDTH, height: 340, position: "relative" },
  carouselImage: { height: 340, backgroundColor: "#E5E5EA" },
  dotsRow: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  avatarHero: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  identityCard: { padding: 18, gap: 12, marginHorizontal: 16, marginTop: 12 },
  nameHeader: { gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  profileName: { fontSize: 24, fontWeight: "800", letterSpacing: -0.4 },
  profileHandle: { fontSize: 14 },
  pillRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  metaPillText: { fontSize: 12, fontWeight: "600" },
  intentionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  intentionPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  bioText: { fontSize: 15, lineHeight: 22, marginTop: 4 },
  compatCard: { padding: 16, gap: 10, marginHorizontal: 16 },
  compatHeader: { gap: 8 },
  compatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  compatScoreText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  compatTitle: { fontSize: 15, fontWeight: "800" },
  compatDescription: { fontSize: 13, lineHeight: 19 },
  sectionBlock: { gap: 10, marginHorizontal: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  promptCard: { padding: 16, gap: 6 },
  promptQuestion: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  promptAnswer: { fontSize: 15, fontWeight: "600", lineHeight: 22 },
  interestsCard: { padding: 16, gap: 12, marginHorizontal: 16 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  galleryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridImage: { width: (SCREEN_WIDTH - 42) / 2, height: 160, borderRadius: 12, backgroundColor: "#E5E5EA" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  roundActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  passButton: {
    borderWidth: 1.5,
  },
});

