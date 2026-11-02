import { useFocusEffect, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { GormatiDiscoverCard } from "../components/GormatiDiscoverCard";
import { Icon } from "../components/Icon";
import { RelationshipProfileCard } from "../components/RelationshipProfileCard";
import {
  AppButton,
  AppScreen,
  Card,
  ChoiceChip,
  LocalPreviewNotice,
  PageHeading,
  SectionHeading,
} from "../components/ui";
import { interestOptions } from "../data/mockData";
import type { DiscoverProfile } from "../lib/gormati-profiles";
import {
  demoDiscoverProfiles,
  fetchDiscoverProfiles,
} from "../lib/gormati-profiles";
import type { DirectoryProfile } from "../lib/relationships";
import {
  followProfile,
  relationshipErrorMessage,
  removeFollowRelationship,
  searchDirectoryProfiles,
} from "../lib/relationships";
import { loadBlockedUserIds, subscribeToBlockedUsers } from "../lib/safety";
import { useAppColors } from "../theme/colors";

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);

  // Live discover feed state
  const [discoverProfiles, setDiscoverProfiles] = useState<DiscoverProfile[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(true);
  const [isFallbackData, setIsFallbackData] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [passedIds, setPassedIds] = useState<Record<string, boolean>>({});
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [handleBack]);

  // Subscribe to blocked users changes
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        void loadBlockedUserIds(user.id);
      }
      return subscribeToBlockedUsers((ids) => {
        setBlockedIds(ids);
      });
    }, [user]),
  );

  // Direct username search state
  const [directoryProfiles, setDirectoryProfiles] = useState<DirectoryProfile[]>([]);
  const [directoryState, setDirectoryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load Discover Feed from Supabase
  const loadDiscoverFeed = useCallback(async () => {
    setIsOffline(false);
    try {
      if (user) {
        const live = await fetchDiscoverProfiles(user.id);
        if (live && live.length > 0) {
          setDiscoverProfiles(live);
          setIsFallbackData(false);
        } else {
          setDiscoverProfiles([]);
          setIsFallbackData(false);
        }
      } else {
        setDiscoverProfiles(demoDiscoverProfiles);
        setIsFallbackData(true);
      }
    } catch {
      setIsOffline(true);
      setDiscoverProfiles(demoDiscoverProfiles);
      setIsFallbackData(true);
    } finally {
      setIsLoadingDiscover(false);
    }
  }, [user]);

  // Initial load
  useFocusEffect(
    useCallback(() => {
      void loadDiscoverFeed();
    }, [loadDiscoverFeed]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDiscoverFeed();
    setRefreshing(false);
  }, [loadDiscoverFeed]);

  // Debounced search query
  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      const normalizedQuery = query.trim();

      if (!user || Array.from(normalizedQuery).length < 2) {
        setDirectoryProfiles([]);
        setDirectoryState("idle");
        setDirectoryError(null);
        return () => { isCurrent = false; };
      }

      const timeout = setTimeout(() => {
        setDirectoryState("loading");
        setDirectoryError(null);
        void searchDirectoryProfiles(normalizedQuery)
          .then((profiles) => {
            if (!isCurrent) return;
            setDirectoryProfiles(profiles);
            setDirectoryState("ready");
          })
          .catch((error: unknown) => {
            if (!isCurrent) return;
            setDirectoryProfiles([]);
            setDirectoryError(relationshipErrorMessage(error));
            setDirectoryState("error");
          });
      }, 300);

      return () => {
        isCurrent = false;
        clearTimeout(timeout);
      };
    }, [query, user]),
  );

  const handleRelationshipAction = async (profile: DirectoryProfile) => {
    if (!user || busyProfileId) return;
    setBusyProfileId(profile.id);
    setActionError(null);

    try {
      if (profile.relationship_status) {
        await removeFollowRelationship(profile.id, user.id);
        setDirectoryProfiles((current) => current.map((item) => item.id === profile.id ? { ...item, relationship_status: null } : item));
      } else {
        await followProfile(profile.id, user.id);
        setDirectoryProfiles((current) => current.map((item) => item.id === profile.id ? { ...item, relationship_status: "accepted" } : item));
      }
    } catch (error: unknown) {
      setActionError(relationshipErrorMessage(error));
    } finally {
      setBusyProfileId(null);
    }
  };

  // Like interaction
  const handleLike = async (profile: DiscoverProfile) => {
    setLikedIds((prev) => ({ ...prev, [profile.id]: true }));
    try {
      await followProfile(profile.id, user?.id);
    } catch {
      // Non-blocking interaction
    }
  };

  // Pass interaction
  const handlePass = (profile: DiscoverProfile) => {
    setPassedIds((prev) => ({ ...prev, [profile.id]: true }));
    setDiscoverProfiles((prev) => prev.filter((p) => p.id !== profile.id));
  };

  // Filtered discover cards
  const visibleDiscoverProfiles = useMemo(() => {
    return discoverProfiles
      .filter((p) => !likedIds[p.id])
      .filter((p) => !passedIds[p.id])
      .filter((p) => !blockedIds.includes(p.id))
      .filter((p) => {
        if (!selectedInterest) return true;
        return p.interests?.includes(selectedInterest);
      });
  }, [discoverProfiles, likedIds, passedIds, blockedIds, selectedInterest]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header Bar with Safe Area & Back Button */}
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
        <Text style={[styles.headerBarTitle, { color: colors.text }]}>Discover & Search</Text>
        <View style={{ width: 40 }} />
      </View>

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
        <PageHeading
          title="Explore Members"
          subtitle="Search and connect with curated Huddle community members."
          eyebrow="Community Discovery"
        />

        {/* Search Input */}
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="search" color={colors.secondary} size={19} />
          <TextInput
            accessibilityLabel="Search people and interests"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, handle, or interest…"
            placeholderTextColor={colors.secondary}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query.length > 0 ? (
            <Text onPress={() => setQuery("")} style={[styles.clearText, { color: colors.accent }]}>
              Clear
            </Text>
          ) : null}
        </View>

        {/* Specific member search results when query is active */}
        {query.trim().length >= 2 ? (
          <View style={styles.directoryBlock}>
            <SectionHeading
              title="Search results"
              action={directoryState === "ready"
                ? <Text style={[styles.resultCount, { color: colors.secondary }]}>{directoryProfiles.length} found</Text>
                : undefined}
            />

            {directoryState === "loading" ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={[styles.stateText, { color: colors.secondary }]}>Searching members…</Text>
              </View>
            ) : null}

            {directoryState === "error" ? (
              <Card style={styles.errorCard}>
                <Text style={[styles.errorText, { color: colors.accent }]}>{directoryError}</Text>
              </Card>
            ) : null}

            {actionError ? (
              <Card style={styles.errorCard}>
                <Text style={[styles.errorText, { color: colors.accent }]}>{actionError}</Text>
              </Card>
            ) : null}

            {directoryState === "ready" && directoryProfiles.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Icon name="person" color={colors.secondary} size={28} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No members found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
                  Try searching with a different name, handle, or location.
                </Text>
              </Card>
            ) : null}

            {directoryProfiles.map((profile) => {
              const pending = profile.relationship_status === "pending";
              const following = profile.relationship_status === "accepted";
              const buttonLabel = pending ? "Cancel request" : following ? "Following" : profile.is_private ? "Request" : "Connect";
              return (
                <RelationshipProfileCard
                  key={profile.id}
                  profile={{
                    id: profile.id,
                    username: profile.username,
                    display_name: profile.display_name,
                    is_private: profile.is_private,
                    bio: null,
                    avatar_url: null,
                  }}
                  statusLabel={profile.follows_you ? "Follows you" : undefined}
                  actionLabel={busyProfileId === profile.id ? "Please wait…" : buttonLabel}
                  actionAccessibilityLabel={pending ? `Cancel follow request to @${profile.username}` : following ? `Unfollow @${profile.username}` : `Connect with @${profile.username}`}
                  actionVariant={pending || following ? "outline" : "primary"}
                  actionIcon={following ? "check" : undefined}
                  actionDisabled={busyProfileId !== null}
                  onAction={() => { void handleRelationshipAction(profile); }}
                />
              );
            })}
          </View>
        ) : (
          /* Live Curated Member Discover Feed */
          <View style={styles.discoverBlock}>
            {isOffline ? (
              <LocalPreviewNotice>
                You’re offline. Showing cached demo profiles for discovery.
              </LocalPreviewNotice>
            ) : isFallbackData ? (
              <LocalPreviewNotice>
                Showing preview profiles. Sign in to connect with live members across India.
              </LocalPreviewNotice>
            ) : null}

            <SectionHeading
              title="Browse by interest"
              action={selectedInterest ? (
                <Text onPress={() => setSelectedInterest(null)} style={[styles.clearFilter, { color: colors.accent }]}>
                  Show all
                </Text>
              ) : undefined}
            />

            {/* Interest Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.interestRow}
            >
              {interestOptions.slice(0, 10).map((interest) => (
                <ChoiceChip
                  key={interest}
                  label={interest}
                  selected={selectedInterest === interest}
                  onPress={() => setSelectedInterest(selectedInterest === interest ? null : interest)}
                />
              ))}
            </ScrollView>

            {/* Discover Cards Feed */}
            {isLoadingDiscover ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={[styles.stateText, { color: colors.secondary }]}>Curating members for you…</Text>
              </View>
            ) : visibleDiscoverProfiles.length > 0 ? (
              <View style={styles.cardStack}>
                {visibleDiscoverProfiles.map((profile) => (
                  <GormatiDiscoverCard
                    key={profile.id}
                    profile={profile}
                    isLiked={Boolean(likedIds[profile.id])}
                    onLike={handleLike}
                    onPass={handlePass}
                  />
                ))}
              </View>
            ) : (
              <Card style={styles.emptyCard}>
                <Icon name="sparkles" color={colors.secondary} size={32} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up!</Text>
                <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
                  You’ve reviewed all available members in this circle. Check back soon for new community members.
                </Text>
                <AppButton
                  label="Refresh Feed"
                  variant="outline"
                  onPress={() => {
                    setLikedIds({});
                    setPassedIds({});
                    setSelectedInterest(null);
                    void loadDiscoverFeed();
                  }}
                />
              </Card>
            )}
          </View>
        )}
      </AppScreen>
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
  headerBarTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  searchBox: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
  clearText: { fontSize: 13, fontWeight: "600", paddingHorizontal: 4 },
  directoryBlock: { gap: 12, marginTop: 4 },
  resultCount: { fontSize: 12, fontWeight: "600" },
  discoverBlock: { gap: 14 },
  interestRow: { gap: 8, paddingVertical: 4 },
  cardStack: { gap: 16, marginTop: 4 },
  stateCard: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 },
  stateText: { fontSize: 14 },
  errorCard: { padding: 14 },
  errorText: { fontSize: 13, textAlign: "center" },
  emptyCard: { alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptySubtitle: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  clearFilter: { fontSize: 12, fontWeight: "600" },
});

