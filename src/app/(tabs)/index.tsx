import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
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
  demoDiscoverProfiles,
  fetchDiscoverProfiles,
  recordLike,
} from "../../lib/gormati-profiles";
import type { DiscoverProfile } from "../../lib/gormati-profiles";
import { loadBlockedUserIds, subscribeToBlockedUsers } from "../../lib/safety";
import { testSupabaseConnection, type SupabaseConnectionTestResult } from "../../lib/test-supabase";
import { useAppColors } from "../../theme/colors";

export default function HomeScreen() {
  const colors = useAppColors();
  const { user } = useAuth();
  const [feedFilter, setFeedFilter] = useState<"For you" | "Following">("For you");
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [connectionTest, setConnectionTest] = useState<SupabaseConnectionTestResult | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Discover members for home screen spotlight
  const [spotlightProfiles, setSpotlightProfiles] = useState<DiscoverProfile[]>([]);
  const [likedProfileIds, setLikedProfileIds] = useState<Record<string, boolean>>({});
  const [passedProfileIds, setPassedProfileIds] = useState<Record<string, boolean>>({});
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

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
    async function loadMembers() {
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
    void loadMembers();
    return () => { isCurrent = false; };
  }, [user]);

  const handleLikeMember = async (profile: DiscoverProfile) => {
    setLikedProfileIds((prev) => ({ ...prev, [profile.id]: true }));
    try {
      await recordLike(profile.id);
    } catch {
      // Graceful fallback for demo profiles
    }
  };

  const handlePassMember = (profile: DiscoverProfile) => {
    setPassedProfileIds((prev) => ({ ...prev, [profile.id]: true }));
  };

  const visibleSpotlight = spotlightProfiles
    .filter((p) => !passedProfileIds[p.id])
    .filter((p) => !blockedIds.includes(p.id));
  const visiblePosts = feedFilter === "For you"
    ? samplePosts
    : samplePosts.filter((post) => post.id === "post-bengaluru-cycling");

  async function runConnectionTest() {
    setIsTestingConnection(true);
    setConnectionTest(null);

    try {
      setConnectionTest(await testSupabaseConnection());
    } finally {
      setIsTestingConnection(false);
    }
  }

  const userGreetingName = user?.email ? user.email.split("@")[0] : "Member";

  return (
    <AppScreen>
      <View style={styles.brandRow}>
        <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
          <Icon name="sparkles" color="#FFFFFF" size={18} />
        </View>
        <View style={styles.brandText}>
          <Text style={[styles.brandName, { color: colors.text }]}>Gormati</Text>
          <Text style={[styles.brandSubtitle, { color: colors.secondary }]}>Your people, your place</Text>
        </View>
        <IconButton
          name="bell"
          label="Preview notifications"
          onPress={() => Alert.alert("Notifications", "Notification activity is a local preview in this milestone.")}
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
      {visiblePosts.map((post) => (
        <FeedPostCard
          key={post.id}
          post={post}
          liked={Boolean(likedPosts[post.id])}
          demoAvatarId={post.id}
          onToggleLike={() => setLikedPosts((current) => ({ ...current, [post.id]: !current[post.id] }))}
        />
      ))}

      <Card style={styles.connectionTestCard}>
        <View style={styles.connectionTestHeader}>
          <View style={styles.connectionTestCopy}>
            <Text style={[styles.connectionTestTitle, { color: colors.text }]}>Temporary · Supabase connection check</Text>
            <Text style={[styles.connectionTestHint, { color: colors.secondary }]}>Checks Auth reachability only; no sign-in or data access.</Text>
          </View>
          <AppButton
            label={isTestingConnection ? "Checking…" : "Run check"}
            variant="outline"
            disabled={isTestingConnection}
            onPress={() => { void runConnectionTest(); }}
          />
        </View>
        {connectionTest ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.connectionTestResult, { color: connectionTest.success ? colors.success : colors.secondary }]}
          >
            {connectionTest.message}
          </Text>
        ) : null}
      </Card>
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
  connectionTestCard: { gap: 9, padding: 12 },
  connectionTestHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  connectionTestCopy: { flex: 1, gap: 3 },
  connectionTestTitle: { fontSize: 12, fontWeight: "700" },
  connectionTestHint: { fontSize: 11, lineHeight: 15 },
  connectionTestResult: { fontSize: 12, lineHeight: 17 },
});
