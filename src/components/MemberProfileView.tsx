import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useAuth } from "../auth/AuthProvider";
import { FeedPostCard } from "./FeedPostCard";
import { Icon } from "./Icon";
import { SafetyActionModal } from "./SafetyActionModal";
import { UserBadge } from "./UserBadge";
import {
  AppButton,
  Avatar,
  Card,
  ChoiceChip,
  SectionHeading,
  VerifiedBadge,
} from "./ui";
import { VoiceIntroCard } from "./VoiceIntroCard";
import { getUserBadges } from "../lib/badges";
import { startCall } from "../lib/calling";
import { fetchMemberProfile, recordLike, type GormatiProfile } from "../lib/gormati-profiles";
import { fetchUserPosts, type PublishedPost } from "../lib/posts";
import { followProfile } from "../lib/relationships";
import { checkSparkStatus, sendSecretSpark, PRESET_COMPLIMENTS } from "../lib/sparks";
import { fetchUserStreak, type UserStreakInfo } from "../lib/streaks";
import { useAppColors } from "../theme/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type MemberProfileViewProps = {
  memberId: string;
  onBack?: () => void;
};

export function MemberProfileView({ memberId, onBack }: MemberProfileViewProps) {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();

  const [profile, setProfile] = useState<GormatiProfile | null>(null);
  const [memberPosts, setMemberPosts] = useState<PublishedPost[]>([]);
  const [userStreak, setUserStreak] = useState<UserStreakInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});

  // Secret Sparks state
  const [sparkStatus, setSparkStatus] = useState<{ hasSent: boolean; isMutual: boolean }>({
    hasSent: false,
    isMutual: false,
  });
  const [sparkModalVisible, setSparkModalVisible] = useState(false);
  const [selectedCompliment, setSelectedCompliment] = useState<string>(PRESET_COMPLIMENTS[0]);
  const [isSendingSpark, setIsSendingSpark] = useState(false);
  const [mutualCelebrationVisible, setMutualCelebrationVisible] = useState(false);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {
      // Fallback if navigation history is missing
    }
    router.replace("/(tabs)");
  }, [onBack]);

  useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [handleBack]);

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      if (!memberId) return;
      setIsLoading(true);
      try {
        const [profileData, postsData, streakData] = await Promise.all([
          fetchMemberProfile(memberId),
          fetchUserPosts(memberId),
          fetchUserStreak(memberId),
        ]);
        if (isCurrent) {
          setProfile(profileData);
          setMemberPosts(postsData);
          setUserStreak(streakData);
        }

        if (user?.id && user.id !== memberId) {
          const sparkInfo = await checkSparkStatus(user.id, memberId);
          if (isCurrent) {
            setSparkStatus(sparkInfo);
          }
        }
      } catch {
        // Non-blocking query guard
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    void load();
    return () => {
      isCurrent = false;
    };
  }, [memberId, user?.id]);

  const handleStartCall = async (callType: "voice" | "video") => {
    if (!user || !profile) return;
    try {
      const call = await startCall(
        user.id,
        profile.id,
        callType,
        user.user_metadata?.full_name || user.email?.split("@")[0] || "Member",
        user.user_metadata?.avatar_url,
      );
      router.push({
        pathname: "/call/[id]",
        params: { id: profile.id, callId: call.id, type: callType },
      } as never);
    } catch {
      router.push({
        pathname: "/call/[id]",
        params: { id: profile.id, type: callType },
      } as never);
    }
  };

  const handleSendSpark = async () => {
    if (!user || !profile || isSendingSpark) return;
    setIsSendingSpark(true);
    try {
      const res = await sendSecretSpark(user.id, profile.id, selectedCompliment);
      if (res.success) {
        setSparkStatus({ hasSent: true, isMutual: res.isMutual });
        setSparkModalVisible(false);
        if (res.isMutual) {
          setMutualCelebrationVisible(true);
        } else {
          Alert.alert(
            "Secret Spark Sent! ⚡",
            `Your compliment was anonymously delivered to ${profile.display_name}. If they send you a spark too, you'll instantly match!`,
          );
        }
      } else {
        Alert.alert("Notice", res.error || "Could not send spark.");
      }
    } finally {
      setIsSendingSpark(false);
    }
  };

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
        <AppButton label="Go back" variant="outline" onPress={handleBack} />
      </View>
    );
  }

  const gallery =
    profile.gallery_urls && profile.gallery_urls.length > 0
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

  const badges = getUserBadges({
    currentStreak: userStreak?.currentStreak ?? 1,
    longestStreak: userStreak?.longestStreak ?? 1,
    totalPosts: memberPosts.length,
    isVerified: profile.is_verified ?? true,
  });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header Bar */}
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
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={10}
        >
          <Icon name="arrowBack" color={colors.text} size={22} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.navTitle, { color: colors.text }]}>
          {profile.display_name}
        </Text>
        <View style={styles.navRight}>
          {profile.is_verified ? <VerifiedBadge /> : null}
          {user?.id && user.id !== profile.id ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Voice call"
                onPress={() => { void handleStartCall("voice"); }}
                style={styles.optionsButton}
                hitSlop={8}
              >
                <Icon name="phone" color={colors.accent} size={19} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Video call"
                onPress={() => { void handleStartCall("video"); }}
                style={styles.optionsButton}
                hitSlop={8}
              >
                <Icon name="video" color={colors.accent} size={19} />
              </Pressable>
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share profile"
            onPress={() => {
              void handleShare();
            }}
            style={styles.optionsButton}
            hitSlop={8}
          >
            <Icon name="share" color={colors.text} size={18} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Member safety options"
            onPress={() => setSafetyModalVisible(true)}
            style={styles.optionsButton}
            hitSlop={8}
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

        {/* Identity & Core Details Card */}
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

          {profile.bio ? <Text style={[styles.bioText, { color: colors.text }]}>{profile.bio}</Text> : null}

          {/* Location & Dating Intention Badges */}
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

        {/* Secret Sparks Feature Card */}
        {user?.id && user.id !== profile.id ? (
          sparkStatus.isMutual ? (
            <Card style={[styles.mutualSparkCard, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
              <View style={styles.sparkRow}>
                <View style={[styles.sparkCircle, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.sparkEmoji, { color: "#FFFFFF" }]}>⚡</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.sparkTitle, { color: colors.accent }]}>Mutual Spark! ⚡</Text>
                  <Text style={[styles.sparkSubtitle, { color: colors.text }]}>
                    You and {profile.display_name.split(" ")[0]} secretly sparked each other!
                  </Text>
                </View>
                <AppButton label="Chat" onPress={handleMessage} />
              </View>
            </Card>
          ) : (
            <Card style={[styles.sparkBannerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sparkRow}>
                <View style={[styles.sparkCircle, { backgroundColor: colors.accentSoft }]}>
                  <Text style={styles.sparkEmoji}>⚡</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.sparkTitle, { color: colors.text }]}>Secret Spark</Text>
                  <Text style={[styles.sparkSubtitle, { color: colors.secondary }]}>
                    Send an anonymous compliment. If it’s mutual, you both match!
                  </Text>
                </View>
                <AppButton
                  label={sparkStatus.hasSent ? "Sent ⚡" : "Spark ⚡"}
                  variant={sparkStatus.hasSent ? "subtle" : "outline"}
                  disabled={sparkStatus.hasSent}
                  onPress={() => setSparkModalVisible(true)}
                />
              </View>
            </Card>
          )
        ) : null}

        {/* Active Daily Streak Banner */}
        {userStreak && (userStreak.currentStreak > 0 || userStreak.longestStreak > 0) ? (
          <Card style={[styles.streakCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.streakRow}>
              <View style={[styles.streakIconCircle, { backgroundColor: colors.subtle }]}>
                <Text style={styles.flameIcon}>🔥</Text>
              </View>
              <View style={styles.streakDetails}>
                <Text style={[styles.streakTitle, { color: colors.text }]}>
                  {userStreak.currentStreak > 0
                    ? `${userStreak.currentStreak} Day Posting Streak`
                    : "Community Member"}
                </Text>
                <Text style={[styles.streakSubtitle, { color: colors.secondary }]}>
                  {userStreak.longestStreak > 0
                    ? `Personal best: ${userStreak.longestStreak} days in a row`
                    : "Maintaining consistent community engagement"}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Achievements & Badges Card */}
        {badges.length > 0 ? (
          <Card style={[styles.badgesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Achievements & Badges</Text>
            <View style={styles.badgeList}>
              {badges.map((badge) => (
                <UserBadge key={badge.id} badge={badge} />
              ))}
            </View>
          </Card>
        ) : null}

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

        {/* Member Published Posts Section */}
        <View style={styles.postsSection}>
          <SectionHeading
            title={`${profile.display_name.split(" ")[0]}’s Posts (${memberPosts.length})`}
          />

          {memberPosts.length > 0 ? (
            memberPosts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                currentUserId={user?.id}
                liked={Boolean(likedPosts[post.id])}
                onToggleLike={() =>
                  setLikedPosts((curr) => ({ ...curr, [post.id]: !curr[post.id] }))
                }
                mediaSource={post.image_url ? { uri: post.image_url } : undefined}
              />
            ))
          ) : (
            <Card
              style={[
                styles.emptyPostsCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={[styles.emptyIconCircle, { backgroundColor: colors.subtle }]}>
                <Icon name="chat" color={colors.accent} size={28} />
              </View>
              <Text style={[styles.emptyPostsTitle, { color: colors.text }]}>No posts yet</Text>
              <Text style={[styles.emptyPostsSub, { color: colors.secondary }]}>
                {profile.display_name} hasn’t shared any community posts yet. Stay tuned for upcoming
                updates!
              </Text>
            </Card>
          )}
        </View>

        <View style={{ height: 100 }} />
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
            onPress={() => {
              void handleLike();
            }}
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
          onBlockedOrReported={handleBack}
        />
      ) : null}

      {/* Secret Spark Compliment Modal */}
      <Modal
        visible={sparkModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSparkModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.sparkModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sparkModalHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.sparkModalTitle, { color: colors.text }]}>Send Secret Spark ⚡</Text>
                <Text style={[styles.sparkModalSubtitle, { color: colors.secondary }]}>
                  Choose a secret compliment for {profile.display_name}. Delivered 100% anonymously. If they spark you back, you both match!
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close spark modal"
                onPress={() => setSparkModalVisible(false)}
                hitSlop={8}
                style={styles.modalCloseBtn}
              >
                <Icon name="close" color={colors.secondary} size={20} />
              </Pressable>
            </View>

            <ScrollView style={styles.complimentsScroll} showsVerticalScrollIndicator={false}>
              {PRESET_COMPLIMENTS.map((item) => {
                const isSelected = selectedCompliment === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityLabel={item}
                    onPress={() => setSelectedCompliment(item)}
                    style={[
                      styles.complimentOption,
                      {
                        backgroundColor: isSelected ? colors.accentSoft : colors.subtle,
                        borderColor: isSelected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.complimentText,
                        { color: isSelected ? colors.accent : colors.text },
                      ]}
                    >
                      {item}
                    </Text>
                    {isSelected ? (
                      <Icon name="check" color={colors.accent} size={18} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <AppButton
                label={isSendingSpark ? "Sending Spark…" : "Send Spark ⚡"}
                disabled={isSendingSpark}
                onPress={() => { void handleSendSpark(); }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Mutual Spark Celebration Modal */}
      <Modal
        visible={mutualCelebrationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMutualCelebrationVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.celebrationCard, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
            <Text style={styles.celebrationBigEmoji}>⚡ 🎉 ⚡</Text>
            <Text style={[styles.celebrationTitle, { color: colors.text }]}>It’s a Mutual Spark!</Text>
            <Text style={[styles.celebrationSub, { color: colors.secondary }]}>
              You and {profile.display_name} secretly sparked each other. The feeling is mutual! Direct chat is now unlocked.
            </Text>
            <View style={{ gap: 10, width: "100%", marginTop: 8 }}>
              <AppButton
                label="Start Chatting Now 💬"
                onPress={() => {
                  setMutualCelebrationVisible(false);
                  handleMessage();
                }}
              />
              <AppButton
                label="Awesome!"
                variant="outline"
                onPress={() => setMutualCelebrationVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
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
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
  badgeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  streakCard: { marginHorizontal: 16, padding: 14 },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  streakIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  flameIcon: { fontSize: 22 },
  streakDetails: { flex: 1, gap: 2 },
  streakTitle: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  streakSubtitle: { fontSize: 12 },
  badgesCard: { marginHorizontal: 16, gap: 10, padding: 14 },
  badgeList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sectionCard: { marginHorizontal: 16, gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  promptCard: { marginHorizontal: 16, gap: 6 },
  promptQuestion: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  promptAnswer: { fontSize: 14, fontWeight: "600", lineHeight: 21 },
  postsSection: { marginHorizontal: 16, gap: 12 },
  emptyPostsCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
    borderRadius: 16,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyPostsTitle: { fontSize: 16, fontWeight: "800" },
  emptyPostsSub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
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
  mutualSparkCard: { marginHorizontal: 16, padding: 14, borderWidth: 1.5 },
  sparkBannerCard: { marginHorizontal: 16, padding: 14 },
  sparkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sparkCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sparkEmoji: { fontSize: 20 },
  sparkTitle: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  sparkSubtitle: { fontSize: 12, lineHeight: 17 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sparkModalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, maxHeight: "80%", gap: 16 },
  sparkModalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sparkModalTitle: { fontSize: 18, fontWeight: "800" },
  sparkModalSubtitle: { fontSize: 13, lineHeight: 18 },
  modalCloseBtn: { padding: 4 },
  complimentsScroll: { maxHeight: 320 },
  complimentOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  complimentText: { flex: 1, fontSize: 14, fontWeight: "600", marginRight: 8, lineHeight: 20 },
  modalActions: { paddingTop: 8 },
  celebrationCard: { margin: 24, borderRadius: 24, borderWidth: 2, padding: 24, alignItems: "center", gap: 12 },
  celebrationBigEmoji: { fontSize: 44, textAlign: "center" },
  celebrationTitle: { fontSize: 22, fontWeight: "900", textAlign: "center", letterSpacing: -0.4 },
  celebrationSub: { fontSize: 14, textAlign: "center", lineHeight: 21 },
});
