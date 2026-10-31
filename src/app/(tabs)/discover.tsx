import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { GormatiDiscoverCard } from "../../components/GormatiDiscoverCard";
import { Icon } from "../../components/Icon";
import { RelationshipProfileCard } from "../../components/RelationshipProfileCard";
import { AppScreen, Card, ChoiceChip, LocalPreviewNotice, PageHeading, SectionHeading } from "../../components/ui";
import { interestOptions } from "../../data/mockData";
import type { DiscoverProfile } from "../../lib/gormati-profiles";
import {
  demoDiscoverProfiles,
  fetchDiscoverProfiles,
  recordLike,
} from "../../lib/gormati-profiles";
import type { DirectoryProfile } from "../../lib/relationships";
import {
  followProfile,
  relationshipErrorMessage,
  removeFollowRelationship,
  searchDirectoryProfiles,
} from "../../lib/relationships";
import { loadBlockedUserIds, subscribeToBlockedUsers } from "../../lib/safety";
import { useAppColors } from "../../theme/colors";

export default function DiscoverScreen() {
  const colors = useAppColors();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);

  // Live discover feed state
  const [discoverProfiles, setDiscoverProfiles] = useState<DiscoverProfile[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(true);
  const [isFallbackData, setIsFallbackData] = useState(false);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [passedIds, setPassedIds] = useState<Record<string, boolean>>({});
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

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
    setIsLoadingDiscover(true);
    try {
      const live = user ? await fetchDiscoverProfiles(user.id) : [];
      if (live && live.length > 0) {
        setDiscoverProfiles(live);
        setIsFallbackData(false);
      } else {
        // Fallback to rich demo profiles
        setDiscoverProfiles(demoDiscoverProfiles);
        setIsFallbackData(true);
      }
    } catch {
      setDiscoverProfiles(demoDiscoverProfiles);
      setIsFallbackData(true);
    } finally {
      setIsLoadingDiscover(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadDiscoverFeed();
    }, [loadDiscoverFeed]),
  );

  // Search directory when query is typed
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
        await removeFollowRelationship(profile.id);
        setDirectoryProfiles((current) => current.map((item) => item.id === profile.id
          ? { ...item, relationship_status: null }
          : item));
      } else {
        const status = await followProfile(profile.id);
        setDirectoryProfiles((current) => current.map((item) => item.id === profile.id
          ? { ...item, relationship_status: status }
          : item));
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
      // Record like in Supabase via RPC
      await recordLike(profile.id);
    } catch {
      // If error (or demo profile), keep client visual feedback intact
    }
  };

  // Pass interaction
  const handlePass = (profile: DiscoverProfile) => {
    setPassedIds((prev) => ({ ...prev, [profile.id]: true }));
  };

  // Filtered discover cards
  const visibleDiscoverProfiles = useMemo(() => {
    return discoverProfiles
      .filter((p) => !passedIds[p.id])
      .filter((p) => !blockedIds.includes(p.id))
      .filter((p) => {
        if (!selectedInterest) return true;
        return p.interests?.includes(selectedInterest);
      });
  }, [discoverProfiles, passedIds, blockedIds, selectedInterest]);

  return (
    <AppScreen>
      <PageHeading
        title="Discover"
        subtitle="Connect with curated Gormati members."
        eyebrow="Curated for you"
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
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>Searching Gormati members…</Text>
            </View>
          ) : null}
          {directoryState === "error" ? (
            <Card style={styles.emptyCard}>
              <Text accessibilityLiveRegion="polite" style={[styles.emptyText, { color: colors.secondary }]}>
                {directoryError}
              </Text>
            </Card>
          ) : null}
          {directoryState === "ready" && directoryProfiles.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.secondary }]}>No matching Gormati members found.</Text>
            </Card>
          ) : null}
          {directoryState === "ready" ? directoryProfiles.map((profile) => {
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
          }) : null}
          {actionError ? (
            <Text accessibilityLiveRegion="polite" style={[styles.actionError, { color: colors.accentStrong }]}>
              {actionError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Filter by Interest Chips */}
      <View style={styles.interestsFilterBlock}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
          <ChoiceChip
            label="All interests"
            selected={selectedInterest === null}
            onPress={() => setSelectedInterest(null)}
          />
          {interestOptions.map((interest) => (
            <ChoiceChip
              key={interest}
              label={interest}
              selected={selectedInterest === interest}
              onPress={() => setSelectedInterest(selectedInterest === interest ? null : interest)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Discover Profile Feed */}
      <View style={styles.feedBlock}>
        <SectionHeading
          title="Gormati members"
          action={
            <Text style={[styles.resultCount, { color: colors.secondary }]}>
              {visibleDiscoverProfiles.length} profiles
            </Text>
          }
        />

        {isFallbackData ? (
          <LocalPreviewNotice>
            Showing preview Gormati member profiles. As new members join and create public profiles, they will appear here live.
          </LocalPreviewNotice>
        ) : null}

        {isLoadingDiscover ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.emptyText, { color: colors.secondary }]}>Loading Gormati members…</Text>
          </View>
        ) : visibleDiscoverProfiles.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{"You've caught up!"}</Text>
            <Text style={[styles.emptyText, { color: colors.secondary }]}>
              Check back soon for new profiles or explore different interests.
            </Text>
          </Card>
        ) : (
          visibleDiscoverProfiles.map((profile) => (
            <GormatiDiscoverCard
              key={profile.id}
              profile={profile}
              isLiked={Boolean(likedIds[profile.id])}
              onLike={handleLike}
              onPass={handlePass}
            />
          ))
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, minHeight: 46, fontSize: 14, paddingVertical: 0 },
  clearText: { fontSize: 12, fontWeight: "700", padding: 6 },
  interestsFilterBlock: { marginTop: -4 },
  horizontalChips: { gap: 8, paddingVertical: 4 },
  directoryBlock: { gap: 12 },
  loadingRow: { minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  actionError: { fontSize: 13, lineHeight: 19 },
  feedBlock: { gap: 14 },
  resultCount: { fontSize: 12, fontWeight: "600" },
  emptyCard: { alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
});
