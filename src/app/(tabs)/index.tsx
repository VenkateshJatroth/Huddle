import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
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
import { samplePosts } from "../../data/mockData";
import {
  deletePost,
  editPost,
  fetchFeedPosts,
  subscribeToPosts,
  type PostAudience,
  type PublishedPost,
} from "../../lib/posts";
import {
  demoDiscoverProfiles,
  fetchDiscoverProfiles,
} from "../../lib/gormati-profiles";
import type { DiscoverProfile } from "../../lib/gormati-profiles";
import { followProfile } from "../../lib/relationships";
import { loadBlockedUserIds, subscribeToBlockedUsers } from "../../lib/safety";
import { useAppColors } from "../../theme/colors";

export default function HomeScreen() {
  const colors = useAppColors();
  const { user } = useAuth();
  const [feedFilter, setFeedFilter] = useState<"For you" | "Following">("For you");
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [communityPosts, setCommunityPosts] = useState<PublishedPost[]>([]);

  // Post Editing Modal State
  const [editingPost, setEditingPost] = useState<PublishedPost | null>(null);
  const [editText, setEditText] = useState("");
  const [editAudience, setEditAudience] = useState<PostAudience>("Everyone");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Discover members for home screen spotlight
  const [spotlightProfiles, setSpotlightProfiles] = useState<DiscoverProfile[]>([]);
  const [likedProfileIds, setLikedProfileIds] = useState<Record<string, boolean>>({});
  const [passedProfileIds, setPassedProfileIds] = useState<Record<string, boolean>>({});
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id) {
      void loadBlockedUserIds(user.id);
    }
    return subscribeToBlockedUsers((ids) => {
      setBlockedIds(ids);
    });
  }, [user?.id]);

  useEffect(() => {
    let isCurrent = true;
    async function loadFeed() {
      try {
        const feed = await fetchFeedPosts(feedFilter, user?.id);
        if (!isCurrent) return;
        setCommunityPosts(feed);
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
  }, [feedFilter, user]);

  useEffect(() => {
    let isCurrent = true;
    async function fetchSpotlight() {
      try {
        const live = user ? await fetchDiscoverProfiles(user.id, 5) : [];
        if (!isCurrent) return;
        if (live && live.length > 0) {
          setSpotlightProfiles(live);
        } else {
          setSpotlightProfiles(demoDiscoverProfiles);
        }
      } catch {
        if (!isCurrent) return;
        setSpotlightProfiles(demoDiscoverProfiles);
      }
    }
    void fetchSpotlight();
    return () => {
      isCurrent = false;
    };
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [live, feed] = await Promise.all([
        user ? fetchDiscoverProfiles(user.id, 5) : Promise.resolve([]),
        fetchFeedPosts(feedFilter, user?.id),
      ]);
      setCommunityPosts(feed);
      if (live && live.length > 0) {
        setSpotlightProfiles(live);
      } else {
        setSpotlightProfiles(demoDiscoverProfiles);
      }
    } catch {
      setSpotlightProfiles(demoDiscoverProfiles);
    } finally {
      setRefreshing(false);
    }
  }, [user, feedFilter]);

  const handleLikeMember = async (profile: DiscoverProfile) => {
    setLikedProfileIds((prev) => ({ ...prev, [profile.id]: true }));
    try {
      await followProfile(profile.id, user?.id);
    } catch {
      // Graceful fallback for demo profiles
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
    .filter((p) => !passedProfileIds[p.id])
    .filter((p) => !blockedIds.includes(p.id));
  const visiblePosts = feedFilter === "For you"
    ? samplePosts
    : samplePosts.filter((post) => post.id === "post-bengaluru-cycling");

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
        <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
          <Icon name="sparkles" color="#FFFFFF" size={18} />
        </View>
        <View style={styles.brandText}>
          <Text style={[styles.brandName, { color: colors.text }]}>Gormati</Text>
          <Text style={[styles.brandSubtitle, { color: colors.secondary }]}>Your people, your place</Text>
        </View>
        <IconButton
          name="settings"
          label="App settings"
          onPress={() => router.push("/settings" as never)}
        />
      </View>

      <View style={styles.welcomeBlock}>
        <Text style={[styles.welcomeTitle, { color: colors.text }]}>
          Welcome, {userGreetingName}
        </Text>
        <Text style={[styles.welcomeText, { color: colors.secondary }]}>
          Curated connections and conversations from your community.
        </Text>
      </View>

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
        <View style={styles.filterHint}>
          <Icon name="globe" color={colors.secondary} size={15} />
          <Text style={[styles.filterHintText, { color: colors.secondary }]}>India</Text>
        </View>
      </View>

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
      {(communityPosts.length > 0 ? communityPosts : (visiblePosts as PublishedPost[])).map((post) => (
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
      ))}

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
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  brandText: { flex: 1, gap: 2 },
  brandName: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  brandSubtitle: { fontSize: 12 },
  welcomeBlock: { gap: 5, marginTop: 2 },
  welcomeTitle: { fontSize: 23, lineHeight: 29, fontWeight: "700", letterSpacing: -0.5 },
  welcomeText: { fontSize: 14, lineHeight: 20 },
  spotlightBlock: { gap: 10 },
  viewAllText: { fontSize: 13, fontWeight: "700" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  filterHint: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 4 },
  filterHintText: { fontSize: 12, fontWeight: "600" },
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
});
