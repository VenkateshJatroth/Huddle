import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { FeedPostCard } from "../../components/FeedPostCard";
import { GormatiDiscoverCard } from "../../components/GormatiDiscoverCard";
import { Icon } from "../../components/Icon";
import {
  AppButton,
  AppScreen,
  Avatar,
  Card,
  ChoiceChip,
  IconButton,
  rowStyles,
  SectionHeading,
} from "../../components/ui";
import {
  COMMUNITY_CHANNELS,
  deletePost,
  editPost,
  fetchFeedPosts,
  subscribeToPosts,
  type CommunityChannel,
  type PostAudience,
  type PublishedPost,
} from "../../lib/posts";
import {
  fetchUnreadNotificationCount,
  subscribeToNotifications,
  subscribeToUnreadCount,
} from "../../lib/notifications";
import {
  fetchDiscoverProfiles,
  fetchFullProfile,
  type DiscoverProfile,
} from "../../lib/gormati-profiles";
import { followProfile } from "../../lib/relationships";
import { loadBlockedUserIds, subscribeToBlockedUsers } from "../../lib/safety";
import { fetchUserStreak, type UserStreakInfo } from "../../lib/streaks";
import {
  checkProfileCompletion,
  checkAndTriggerProfileCompletionReminder,
  type ProfileCompletionResult,
} from "../../lib/profileCompletion";
import { ProfileCompletionBanner } from "../../components/ProfileCompletionBanner";
import { DailyHotTakeCard } from "../../components/DailyHotTakeCard";
import { supabase } from "../../lib/supabase";
import { useAppColors } from "../../theme/colors";

export default function HomeScreen() {
  const colors = useAppColors();
  const { user } = useAuth();
  const [feedFilter, setFeedFilter] = useState<"For you" | "Following" | "Confessions">("For you");
  const [selectedChannel, setSelectedChannel] = useState<CommunityChannel | "All">("All");
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [communityPosts, setCommunityPosts] = useState<PublishedPost[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Post Editing Modal State
  const [editingPost, setEditingPost] = useState<PublishedPost | null>(null);
  const [editText, setEditText] = useState("");
  const [editAudience, setEditAudience] = useState<PostAudience>("Everyone");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Discover members for home screen spotlight
  const [spotlightProfiles, setSpotlightProfiles] = useState<DiscoverProfile[]>([]);
  const [likedProfileIds, setLikedProfileIds] = useState<Record<string, boolean>>({});
  const [passedProfileIds, setPassedProfileIds] = useState<Record<string, boolean>>({});
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [userStreak, setUserStreak] = useState<UserStreakInfo | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<ProfileCompletionResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id) {
      void loadBlockedUserIds(user.id);
      void fetchUnreadNotificationCount(user.id).then(setUnreadCount);
      void fetchUserStreak(user.id).then(setUserStreak);
      void fetchFullProfile(user.id).then((prof) => {
        if (prof) {
          const comp = checkProfileCompletion(prof);
          setProfileCompletion(comp);
          void checkAndTriggerProfileCompletionReminder(user.id, prof);
        }
      });
    }
    const unsubBlocked = subscribeToBlockedUsers((ids) => {
      setBlockedIds(ids);
    });
    const unsubNotifs = user?.id
      ? subscribeToNotifications(user.id, () => {
          setUnreadCount((c) => c + 1);
        })
      : () => {};
    const unsubUnread = subscribeToUnreadCount((count) => {
      setUnreadCount(count);
    });

    return () => {
      unsubBlocked();
      unsubNotifs();
      unsubUnread();
    };
  }, [user]);

  // Recalculate unread notifications whenever Home tab gains focus
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        void fetchUnreadNotificationCount(user.id).then(setUnreadCount);
      }
    }, [user]),
  );

  useEffect(() => {
    let isCurrent = true;
    async function loadFeed() {
      try {
        const queryFilter = feedFilter === "Following" ? "Following" : "For you";
        const feed = await fetchFeedPosts(queryFilter, user?.id, selectedChannel);
        if (!isCurrent) return;
        const finalFeed = feedFilter === "Confessions" ? feed.filter((p) => Boolean(p.is_anonymous)) : feed;
        setCommunityPosts(finalFeed);
      } catch {
        // Fallback
      }
    }
    void loadFeed();
    const unsubscribe = subscribeToPosts(() => {
      void loadFeed();
    });
    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, [feedFilter, selectedChannel, user]);

  const fetchFollowedIds = useCallback(async (): Promise<Set<string>> => {
    if (!user) return new Set<string>();
    try {
      const { data } = await (supabase as any)
        .from("follow_relationships")
        .select("following_id")
        .eq("follower_id", user.id);
      if (data && Array.isArray(data)) {
        const set = new Set<string>(data.map((r: any) => r.following_id));
        setFollowedIds(set);
        return set;
      }
    } catch {
      // Non-blocking
    }
    return new Set<string>();
  }, [user]);

  const loadSpotlight = useCallback(async () => {
    try {
      const [live, rels] = await Promise.all([
        user ? fetchDiscoverProfiles(user.id, 8) : Promise.resolve([]),
        fetchFollowedIds(),
      ]);
      const filtered = (live || []).filter((p) => !rels.has(p.id));
      setSpotlightProfiles(filtered);
    } catch {
      setSpotlightProfiles([]);
    }
  }, [user, fetchFollowedIds]);

  useEffect(() => {
    let isCurrent = true;
    async function init() {
      try {
        const [live, rels] = await Promise.all([
          user ? fetchDiscoverProfiles(user.id, 8) : Promise.resolve([]),
          fetchFollowedIds(),
        ]);
        if (!isCurrent) return;
        const filtered = (live || []).filter((p) => !rels.has(p.id));
        setSpotlightProfiles(filtered);
      } catch {
        if (isCurrent) setSpotlightProfiles([]);
      }
    }
    void init();
    return () => {
      isCurrent = false;
    };
  }, [user, fetchFollowedIds]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const queryFilter = feedFilter === "Following" ? "Following" : "For you";
      const [, rawFeed, unread, streak, prof] = await Promise.all([
        loadSpotlight(),
        fetchFeedPosts(queryFilter, user?.id, selectedChannel),
        user ? fetchUnreadNotificationCount(user.id) : Promise.resolve(0),
        user ? fetchUserStreak(user.id) : Promise.resolve(null),
        user ? fetchFullProfile(user.id) : Promise.resolve(null),
      ]);
      const finalFeed = feedFilter === "Confessions" ? rawFeed.filter((p) => Boolean(p.is_anonymous)) : rawFeed;
      setCommunityPosts(finalFeed);
      setUnreadCount(unread);
      if (streak) setUserStreak(streak);
      if (prof) setProfileCompletion(checkProfileCompletion(prof));
    } finally {
      setRefreshing(false);
    }
  }, [loadSpotlight, feedFilter, user, selectedChannel]);

  const handleLikeMember = async (profile: DiscoverProfile) => {
    // Optimistic UI update
    setLikedProfileIds((prev) => ({ ...prev, [profile.id]: true }));
    setFollowedIds((prev) => new Set([...prev, profile.id]));
    try {
      await followProfile(profile.id, user?.id);
    } catch {
      // Rollback on failure
      setLikedProfileIds((prev) => {
        const next = { ...prev };
        delete next[profile.id];
        return next;
      });
      setFollowedIds((prev) => {
        const next = new Set(prev);
        next.delete(profile.id);
        return next;
      });
      Alert.alert("Unable to Connect", "Could not connect with member. Please check your internet connection.");
    }
  };

  const handlePassMember = (profile: DiscoverProfile) => {
    setPassedProfileIds((prev) => ({ ...prev, [profile.id]: true }));
  };

  const handleOpenEdit = (post: PublishedPost) => {
    setEditingPost(post);
    setEditText(post.text);
    setEditAudience(post.audience || "Everyone");
  };

  const handleSaveEdit = async () => {
    if (!editingPost || !editText.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await editPost(editingPost.id, editText.trim(), editAudience);
      setEditingPost(null);
    } catch {
      Alert.alert("Error", "Could not save your changes. Please try again.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeletePost = async (post: PublishedPost) => {
    try {
      await deletePost(post.id);
    } catch {
      Alert.alert("Error", "Could not delete this post.");
    }
  };

  const visibleSpotlight = spotlightProfiles
    .filter((p) => !followedIds.has(p.id))
    .filter((p) => !likedProfileIds[p.id])
    .filter((p) => !passedProfileIds[p.id])
    .filter((p) => !blockedIds.includes(p.id));

  const userGreetingName = user?.email ? user.email.split("@")[0] : "Member";

  return (
    <AppScreen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { void onRefresh(); }}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <View style={styles.brandRow}>
        <Image
          source={require("../../../assets/logo.png")}
          style={styles.brandLogo}
          resizeMode="cover"
        />
        <View style={styles.brandText}>
          <Text style={[styles.brandName, { color: colors.text }]}>Huddle</Text>
          <Text style={[styles.brandSubtitle, { color: colors.secondary }]}>{"Let's connect"}</Text>
        </View>
        <View style={styles.headerRightActions}>
          <IconButton
            name="bell"
            label="Notifications"
            badge={unreadCount > 0 ? String(unreadCount) : undefined}
            onPress={() => router.push("/notifications" as never)}
          />
          <IconButton
            name="chat"
            label="Messages"
            onPress={() => router.push("/(tabs)/chat" as never)}
          />
          <IconButton
            name="search"
            label="Search & Discover"
            onPress={() => router.push("/discover" as never)}
          />
        </View>
      </View>

      <View style={styles.welcomeBlock}>
        <Text style={[styles.welcomeTitle, { color: colors.text }]}>
          Welcome, {userGreetingName}
        </Text>
        <Text style={[styles.welcomeText, { color: colors.secondary }]}>
          Curated connections and conversations from your community.
        </Text>
      </View>

      {/* Profile Completion Reminder Banner */}
      {profileCompletion && profileCompletion.completionPercentage < 100 ? (
        <ProfileCompletionBanner
          completion={profileCompletion}
          onCompletePress={() =>
            router.push({ pathname: "/(tabs)/profile", params: { edit: "true" } } as never)
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {/* Daily Streak & Community Leaderboard Widget */}
      {userStreak ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Community Leaderboard"
          onPress={() => router.push("/leaderboard" as never)}
        >
          <Card style={[styles.streakWidgetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.streakWidgetLeft}>
              <Text style={styles.streakWidgetFlame}>🔥</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.streakWidgetTitle, { color: colors.text }]}>
                  {userStreak.currentStreak > 0 ? `${userStreak.currentStreak} Day Posting Streak!` : "Daily Streak"}
                </Text>
                <Text style={[styles.streakWidgetSub, { color: colors.secondary }]}>
                  {userStreak.postedToday ? "Streak protected today! Great job" : "Post today to keep your streak going"}
                </Text>
              </View>
            </View>
            <View style={[styles.streakWidgetBadge, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.streakWidgetBadgeText, { color: colors.accent }]}>Leaderboard 🏆</Text>
            </View>
          </Card>
        </Pressable>
      ) : null}

      {/* Daily Hot Take Battle Widget */}
      <DailyHotTakeCard />

      {/* Featured Gormati Members Spotlight */}
      {visibleSpotlight.length > 0 ? (
        <View style={styles.spotlightBlock}>
          <SectionHeading
            title="Curated members"
            action={
              <Pressable onPress={() => router.push("/discover")}>
                <Text style={[styles.viewAllText, { color: colors.accent }]}>Explore all</Text>
              </Pressable>
            }
          />
          <GormatiDiscoverCard
            profile={visibleSpotlight[0]}
            isLiked={Boolean(likedProfileIds[visibleSpotlight[0].id])}
            onLike={handleLikeMember}
            onPass={handlePassMember}
          />
        </View>
      ) : null}

      <View style={styles.filterRow}>
        <ChoiceChip label="For you" selected={feedFilter === "For you"} onPress={() => setFeedFilter("For you")} />
        <ChoiceChip label="Following" selected={feedFilter === "Following"} onPress={() => setFeedFilter("Following")} />
        <ChoiceChip label="Confessions 🎭" selected={feedFilter === "Confessions"} onPress={() => setFeedFilter("Confessions")} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start 3-Minute Vibe Check Speed Match"
          onPress={() => router.push("/vibe-check" as never)}
          style={[styles.eventsBadgeBtn, { backgroundColor: colors.accentSoft }]}
        >
          <Text style={[styles.eventsBadgeText, { color: colors.accent }]}>Vibe Check ⚡</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explore local meetups and events"
          onPress={() => router.push("/events" as never)}
          style={[styles.eventsBadgeBtn, { backgroundColor: colors.accentSoft }]}
        >
          <Text style={[styles.eventsBadgeText, { color: colors.accent }]}>Meetups 📍</Text>
        </Pressable>
        <View style={styles.filterHint}>
          <Icon name="globe" color={colors.secondary} size={15} />
          <Text style={[styles.filterHintText, { color: colors.secondary }]}>India</Text>
        </View>
      </View>

      {/* Community Circles Horizontal Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.circlesScroll}
      >
        <ChoiceChip
          label="All Circles"
          selected={selectedChannel === "All"}
          onPress={() => setSelectedChannel("All")}
        />
        {COMMUNITY_CHANNELS.map((ch) => (
          <ChoiceChip
            key={ch}
            label={`# ${ch}`}
            selected={selectedChannel === ch}
            onPress={() => setSelectedChannel(ch)}
          />
        ))}
      </ScrollView>

      <Card style={styles.composerCard}>
        <View style={[rowStyles.row, styles.composerTop]}>
          <Avatar name={userGreetingName} tone={1} size={40} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Write a post"
            onPress={() => router.push("/create")}
            style={[styles.composerPrompt, { backgroundColor: colors.subtle, borderColor: colors.border }]}
          >
            <Text style={[styles.composerPlaceholder, { color: colors.secondary }]}>
              Share something with your community…
            </Text>
          </Pressable>
        </View>
        <View style={[styles.composerBottom, { borderTopColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a photo to your post"
            onPress={() => router.push("/create")}
            style={[rowStyles.row, styles.composerAction]}
          >
            <Icon name="photo" color={colors.secondary} size={18} />
            <Text style={[styles.composerActionText, { color: colors.secondary }]}>Photo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a post"
            onPress={() => router.push("/create")}
            style={[rowStyles.row, styles.composerAction]}
          >
            <Icon name="sparkles" color={colors.accent} size={17} />
            <Text style={[styles.composerActionText, { color: colors.secondary }]}>Start a conversation</Text>
          </Pressable>
        </View>
      </Card>

      <SectionHeading title="Community feed" />
      {communityPosts.length > 0 ? (
        communityPosts.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            liked={Boolean(likedPosts[post.id])}
            demoAvatarId={post.id}
            mediaSource={post.image_url ? { uri: post.image_url } : undefined}
            currentUserId={user?.id}
            onToggleLike={() => setLikedPosts((current) => ({ ...current, [post.id]: !current[post.id] }))}
            onEditPost={handleOpenEdit}
            onDeletePost={handleDeletePost}
          />
        ))
      ) : (
        <Card style={[styles.emptyFeedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="sparkles" color={colors.accent} size={30} />
          <Text style={[styles.emptyFeedTitle, { color: colors.text }]}>No posts yet in this circle</Text>
          <Text style={[styles.emptyFeedSub, { color: colors.secondary }]}>
            Be the first member to share an update, photo, or conversation with the community!
          </Text>
          <View style={{ marginTop: 6 }}>
            <AppButton
              label="Create First Post"
              variant="primary"
              onPress={() => router.push("/create")}
            />
          </View>
        </Card>
      )}

      {/* Edit Post Modal */}
      <Modal
        visible={Boolean(editingPost)}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingPost(null)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Post</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setEditingPost(null)}
                hitSlop={8}
              >
                <Icon name="close" color={colors.secondary} size={20} />
              </Pressable>
            </View>

            <TextInput
              multiline
              value={editText}
              onChangeText={setEditText}
              placeholder="What would you like to update?"
              placeholderTextColor={colors.secondary}
              style={[
                styles.modalTextInput,
                { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border },
              ]}
              maxLength={500}
            />

            <View style={styles.modalAudienceRow}>
              <Text style={[styles.modalAudienceLabel, { color: colors.secondary }]}>Audience:</Text>
              {(["Everyone", "Connections", "Only me"] as PostAudience[]).map((aud) => (
                <ChoiceChip
                  key={aud}
                  label={aud}
                  selected={editAudience === aud}
                  onPress={() => setEditAudience(aud)}
                />
              ))}
            </View>

            <View style={styles.modalActionButtons}>
              <AppButton
                label="Cancel"
                variant="outline"
                onPress={() => setEditingPost(null)}
              />
              <AppButton
                label={isSavingEdit ? "Saving…" : "Save Changes"}
                disabled={isSavingEdit || !editText.trim()}
                onPress={() => { void handleSaveEdit(); }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandLogo: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#000000" },
  brandMark: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  brandText: { flex: 1, gap: 2 },
  brandName: { fontSize: 24, fontWeight: "800", letterSpacing: -0.6 },
  brandSubtitle: { fontSize: 12, fontWeight: "500" },
  headerRightActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  welcomeBlock: { gap: 5, marginTop: 2 },
  welcomeTitle: { fontSize: 23, lineHeight: 29, fontWeight: "700", letterSpacing: -0.5 },
  welcomeText: { fontSize: 14, lineHeight: 20 },
  spotlightBlock: { gap: 10 },
  viewAllText: { fontSize: 13, fontWeight: "700" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  filterHint: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 4 },
  filterHintText: { fontSize: 12, fontWeight: "600" },
  circlesScroll: { gap: 8, paddingVertical: 2 },
  composerCard: { padding: 14, gap: 12 },
  composerTop: { gap: 10 },
  composerPrompt: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, justifyContent: "center" },
  composerPlaceholder: { fontSize: 13 },
  composerBottom: { flexDirection: "row", alignItems: "center", gap: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  composerAction: { minHeight: 32, gap: 7 },
  composerActionText: { fontSize: 12, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    padding: 20,
    gap: 16,
    borderRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 17, fontWeight: "800" },
  modalTextInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    textAlignVertical: "top",
  },
  modalAudienceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  modalAudienceLabel: { fontSize: 13, fontWeight: "600" },
  modalActionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  streakWidgetCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    gap: 12,
  },
  streakWidgetLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  streakWidgetFlame: {
    fontSize: 26,
  },
  streakWidgetTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  streakWidgetSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  streakWidgetBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  streakWidgetBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyFeedCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
    textAlign: "center",
  },
  emptyFeedTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyFeedSub: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  eventsBadgeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  eventsBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
