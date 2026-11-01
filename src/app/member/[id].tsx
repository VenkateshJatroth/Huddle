import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useAuth } from "../../auth/AuthProvider";
import { FeedPostCard } from "../../components/FeedPostCard";
import { Icon } from "../../components/Icon";
import { SafetyActionModal } from "../../components/SafetyActionModal";
import {
  AppButton,
  Avatar,
  Card,
  ChoiceChip,
  SectionHeading,
  VerifiedBadge,
} from "../../components/ui";
import { VoiceIntroCard } from "../../components/VoiceIntroCard";
import { fetchMemberProfile, recordLike } from "../../lib/gormati-profiles";
import type { GormatiProfile } from "../../lib/gormati-profiles";
import { fetchUserPosts, type PublishedPost } from "../../lib/posts";
import { followProfile } from "../../lib/relationships";
import { useAppColors } from "../../theme/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function MemberProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();

  const [profile, setProfile] = useState<GormatiProfile | null>(null);
  const [memberPosts, setMemberPosts] = useState<PublishedPost[]>([]);
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
        const [profileData, postsData] = await Promise.all([
          fetchMemberProfile(id),
          fetchUserPosts(id),
        ]);
        if (isCurrent) {
          setProfile(profileData);
          setMemberPosts(postsData);
        }
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
      await followProfile(profile.id, user?.id);
      setIsLiked(true);
    } finally {
      setIsLiking(false);
    }
  };

  const handleShare = async () => {
    if (!profile) return;
    try {
      const profileUrl = `https://gormati.app/m/${profile.username || profile.id}`;
      await Share.share({
        title: `${profile.display_name}'s Profile on GorMati`,
        message: `Connect with ${profile.display_name} (@${profile.username}) on GorMati:\n${profileUrl}`,
        url: profileUrl,
      });
    } catch {
      // User cancelled
    }
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
      {/* Top Header Bar with Safe Area Insets to prevent status bar collision */}
      <View
        style={[
          styles.navBar,
          {
            paddingTop: Math.max(insets.top + 8, 20),
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
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
            accessibilityLabel="Share profile"
            onPress={() => { void handleShare(); }}
            style={styles.optionsButton}
          >
            <Icon name="share" color={colors.text} size={18} />
          </Pressable>
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
        {/* Photo Gallery Carousel or Large Avatar */}
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
                  contentFit="cover"
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

          {profile.bio ? (
            <Text style={[styles.bioText, { color: colors.text }]}>{profile.bio}</Text>
          ) : null}

          {/* Quick Badges: Location & Dating Intention */}
          <View style={styles.badgesRow}>
            {profile.location ? (
              <View style={[styles.badgeItem, { backgroundColor: colors.subtle }]}>
                <Icon name="location" color={colors.secondary} size={13} />
                <Text style={[styles.badgeText, { color: colors.text }]}>{profile.location}</Text>
              </View>
            ) : null}
            {profile.dating_intention ? (
              <View style={[styles.badgeItem, { backgroundColor: colors.subtle }]}>
                <Icon name="heart" color={colors.accent} size={13} />
                <Text style={[styles.badgeText, { color: colors.text }]}>{profile.dating_intention}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {/* 15-Second Voice Introduction */}
        <VoiceIntroCard
          voiceUrl={profile.voice_intro_url}
          durationSec={profile.voice_duration_sec || 15}
          isOwner={user?.id === profile.id}
        />

        {/* Interests */}
        {interests.length > 0 ? (
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Interests</Text>
            <View style={styles.chipsRow}>
              {interests.map((interest) => (
                <ChoiceChip key={interest} label={interest} />
              ))}
            </View>
          </Card>
        ) : null}

        {/* Prompts */}
        {prompts.map((p, idx) => (
          <Card key={idx} style={styles.promptCard}>
            <Text style={[styles.promptQuestion, { color: colors.secondary }]}>{p.question}</Text>
            <Text style={[styles.promptAnswer, { color: colors.text }]}>{p.answer}</Text>
          </Card>
        ))}

        {/* Member Posts Feed */}
        {memberPosts.length > 0 ? (
          <View style={styles.postsSection}>
            <SectionHeading title={`${profile.display_name.split(" ")[0]}’s Posts`} />
            {memberPosts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                currentUserId={user?.id}
                onToggleLike={() => {}}
                mediaSource={post.image_url ? { uri: post.image_url } : undefined}
              />
            ))}
          </View>
        ) : null}

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Floating Bottom Action Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={styles.bottomBarButton}>
          <AppButton
            label="Message"
            variant="outline"
            icon="chat"
            onPress={handleMessage}
          />
        </View>
        <View style={styles.bottomBarButton}>
          <AppButton
            label={isLiked ? "Connected ✓" : "Connect"}
            icon={isLiked ? "check" : "sparkles"}
            disabled={isLiked || isLiking}
            onPress={() => { void handleLike(); }}
          />
        </View>
      </View>

      {user ? (
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
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  loadingText: { fontSize: 13 },
  errorTitle: { fontSize: 18, fontWeight: "800" },
  navBar: {
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "180deg" }],
  },
  navTitle: { flex: 1, fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },
  navRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  optionsButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { gap: 14 },
  carouselContainer: { width: "100%", height: 380, position: "relative" },
  carouselImage: { height: "100%" },
  dotsRow: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  avatarHero: {
    width: "100%",
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  identityCard: { marginHorizontal: 16, marginTop: 4, gap: 10 },
  nameHeader: { gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  profileName: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  profileHandle: { fontSize: 13 },
  bioText: { fontSize: 14, lineHeight: 21 },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  badgeItem: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  sectionCard: { marginHorizontal: 16, gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  promptCard: { marginHorizontal: 16, gap: 6 },
  promptQuestion: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  promptAnswer: { fontSize: 14, fontWeight: "600", lineHeight: 21 },
  postsSection: { marginHorizontal: 16, gap: 12 },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomBarButton: { flex: 1 },
});
