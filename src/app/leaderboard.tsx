import { useFocusEffect, useNavigation, router } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Icon";
import { Avatar, Card, VerifiedBadge } from "../components/ui";
import {
  fetchLeaderboard,
  fetchUserStreak,
  type LeaderboardMember,
  type UserStreakInfo,
} from "../lib/streaks";
import { useAppColors } from "../theme/colors";

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const navigation = useNavigation();
  const { user } = useAuth();

  const [leaderboard, setLeaderboard] = useState<LeaderboardMember[]>([]);
  const [userStreak, setUserStreak] = useState<UserStreakInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleBack();
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [handleBack]),
  );

  const loadData = useCallback(async () => {
    try {
      const [board, streak] = await Promise.all([
        fetchLeaderboard(20),
        user ? fetchUserStreak(user.id) : Promise.resolve(null),
      ]);
      setLeaderboard(board);
      setUserStreak(streak);
    } catch {
      // Non-blocking
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { label: "🥇", color: "#FFD700" };
    if (rank === 2) return { label: "🥈", color: "#C0C0C0" };
    if (rank === 3) return { label: "🥉", color: "#CD7F32" };
    return { label: `#${rank}`, color: colors.secondary };
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header Bar */}
      <View
        style={[
          styles.headerBar,
          {
            paddingTop: Math.max(insets.top + 8, 20),
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          style={styles.backButton}
        >
          <Icon name="chevronLeft" color={colors.text} size={20} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Community Leaderboard</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* User's Current Streak Summary Card */}
      {userStreak ? (
        <View style={styles.userBannerWrap}>
          <Card style={[styles.userStreakCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.userStreakLeft}>
              <Text style={styles.flameIcon}>🔥</Text>
              <View style={styles.streakTextWrap}>
                <Text style={[styles.userStreakHeading, { color: colors.text }]}>
                  {userStreak.currentStreak > 0
                    ? `${userStreak.currentStreak} Day Posting Streak!`
                    : "Start Your Streak Today!"}
                </Text>
                <Text style={[styles.userStreakSub, { color: colors.secondary }]}>
                  {userStreak.postedToday
                    ? "✓ You’ve posted today. Your streak is safe!"
                    : "Post today to increase your streak rank"}
                </Text>
              </View>
            </View>
            <View style={[styles.streakBadgePill, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.streakBadgePillText, { color: colors.accent }]}>
                {userStreak.totalPosts} {userStreak.totalPosts === 1 ? "post" : "posts"}
              </Text>
            </View>
          </Card>
        </View>
      ) : null}

      {/* Leaderboard List */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.loadingText, { color: colors.secondary }]}>Loading top members…</Text>
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { void onRefresh(); }}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={[styles.listHeaderTitle, { color: colors.secondary }]}>
                TOP ACTIVE MEMBERS
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getRankBadge(item.rank);
            const isTopThree = item.rank <= 3;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View ${item.displayName}'s profile`}
                onPress={() => router.push(("/member/" + item.id) as never)}
              >
                <Card
                  style={[
                    styles.memberCard,
                    isTopThree ? { borderColor: colors.accent } : null,
                  ]}
                >
                  <View style={styles.memberRow}>
                    {/* Rank Badge */}
                    <View style={styles.rankBadgeWrap}>
                      <Text style={[styles.rankBadgeText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>

                    {/* Member Avatar */}
                    <Avatar
                      name={item.displayName}
                      tone={item.displayName.length % 5}
                      size={44}
                      imageSource={item.avatarUrl ? { uri: item.avatarUrl } : undefined}
                    />

                    {/* Member Details */}
                    <View style={styles.memberInfo}>
                      <View style={styles.nameRow}>
                        <Text numberOfLines={1} style={[styles.memberName, { color: colors.text }]}>
                          {item.displayName}
                        </Text>
                        {item.isVerified ? <VerifiedBadge /> : null}
                      </View>
                      <Text numberOfLines={1} style={[styles.memberHandle, { color: colors.secondary }]}>
                        @{item.username}
                      </Text>
                    </View>

                    {/* Streak Count & Activity */}
                    <View style={styles.streakInfo}>
                      <View style={[styles.streakPill, { backgroundColor: colors.accentSoft }]}>
                        <Text style={styles.streakPillFlame}>🔥</Text>
                        <Text style={[styles.streakPillText, { color: colors.accent }]}>
                          {item.currentStreak}d
                        </Text>
                      </View>
                      <Text style={[styles.postsMetaText, { color: colors.secondary }]}>
                        {item.totalPosts} {item.totalPosts === 1 ? "post" : "posts"}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  userBannerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  userStreakCard: {
    padding: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userStreakLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  flameIcon: { fontSize: 26 },
  streakTextWrap: { flex: 1, gap: 2 },
  userStreakHeading: { fontSize: 15, fontWeight: "700" },
  userStreakSub: { fontSize: 12 },
  streakBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  streakBadgePillText: { fontSize: 11, fontWeight: "700" },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14 },
  listContent: {
    padding: 16,
    gap: 10,
  },
  listHeader: {
    paddingBottom: 6,
  },
  listHeaderTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  memberCard: {
    padding: 12,
    borderRadius: 14,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rankBadgeWrap: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: {
    fontSize: 16,
    fontWeight: "800",
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "700",
  },
  memberHandle: {
    fontSize: 12,
  },
  streakInfo: {
    alignItems: "flex-end",
    gap: 3,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  streakPillFlame: { fontSize: 12 },
  streakPillText: { fontSize: 12, fontWeight: "700" },
  postsMetaText: { fontSize: 10 },
});
