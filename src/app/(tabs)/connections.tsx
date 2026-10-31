import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { RelationshipProfileCard } from "../../components/RelationshipProfileCard";
import {
  AppScreen,
  AppButton,
  Avatar,
  Card,
  LocalPreviewNotice,
  MutedText,
  PageHeading,
  SectionHeading,
} from "../../components/ui";
import {
  approveFollowRequest,
  fetchRelationshipOverview,
  followProfile,
  rejectFollowRequest,
  relationshipErrorMessage,
  RelationshipSchemaUnavailableError,
  removeFollowRelationship,
} from "../../lib/relationships";
import type { RelationshipOverview } from "../../lib/relationships";
import { useAppColors } from "../../theme/colors";

type LoadState = "loading" | "ready" | "migration-missing" | "error";

const sampleMatches = [
  { id: "account-sana", name: "Sana Iqbal", username: "sana.in.pune", location: "Pune, MH" },
  { id: "account-dev", name: "Dev Menon", username: "devbuilds", location: "Kochi, KL" },
  { id: "account-priya", name: "Priya Kulkarni", username: "priyareads", location: "Mumbai, MH" },
];

export default function ConnectionsScreen() {
  const colors = useAppColors();
  const { user } = useAuth();
  const [overview, setOverview] = useState<RelationshipOverview | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoadState("loading");
    setLoadError(null);
    try {
      setOverview(await fetchRelationshipOverview(user.id));
      setLoadState("ready");
    } catch (error: unknown) {
      setOverview(null);
      setLoadError(relationshipErrorMessage(error));
      setLoadState(error instanceof RelationshipSchemaUnavailableError ? "migration-missing" : "error");
    }
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  useFocusEffect(useCallback(() => {
    void reload();
  }, [reload]));

  const performAction = async (key: string, action: () => Promise<boolean | string>) => {
    if (busyKey) return;
    setBusyKey(key);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await action();
      if (result === false) {
        setActionNotice("That request changed before the action completed. The list has been refreshed.");
      }
      await reload();
    } catch (error: unknown) {
      setActionError(relationshipErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  // Find mutual matches (users who follow each other)
  const mutualConnections = overview?.connections.filter((c) => c.youFollow && c.followsYou) ?? [];

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
      <PageHeading
        title="Connections"
        subtitle="Grow your circle, one conversation at a time."
        eyebrow="Your community"
      />

      {/* Active Matches & Direct Chats */}
      <View style={styles.section}>
        <SectionHeading title="Matches & Active Chats" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.matchesScroll}>
          {mutualConnections.length > 0 ? (
            mutualConnections.map(({ profile }) => (
              <Pressable
                key={profile.id}
                onPress={() => router.push(("/chat/" + profile.id) as never)}
                style={[styles.matchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.matchAvatarWrap}>
                  <Avatar name={profile.display_name} tone={1} size={54} imageSource={profile.avatar_url ? { uri: profile.avatar_url } : undefined} />
                  <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
                </View>
                <Text numberOfLines={1} style={[styles.matchName, { color: colors.text }]}>{profile.display_name}</Text>
                <Text numberOfLines={1} style={[styles.matchActionText, { color: colors.accent }]}>Chat</Text>
              </Pressable>
            ))
          ) : (
            sampleMatches.map((match) => (
              <Pressable
                key={match.id}
                onPress={() => router.push(("/chat/" + match.id) as never)}
                style={[styles.matchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.matchAvatarWrap}>
                  <Avatar name={match.name} tone={2} size={54} />
                  <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
                </View>
                <Text numberOfLines={1} style={[styles.matchName, { color: colors.text }]}>{match.name}</Text>
                <Text numberOfLines={1} style={[styles.matchActionText, { color: colors.accent }]}>Chat</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      <LocalPreviewNotice>
        Follow and connection state is synchronized with your signed-in Gormati account. Tap on any member to view their full profile or open a chat.
      </LocalPreviewNotice>

      {loadState === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <MutedText>Loading your connections…</MutedText>
        </View>
      ) : null}

      {loadState === "migration-missing" ? (
        <View style={styles.stateBlock}>
          <Card><Text accessibilityLiveRegion="polite" style={[styles.stateText, { color: colors.secondary }]}>{loadError}</Text></Card>
          <AppButton label="Try again" variant="outline" onPress={() => { void reload(); }} />
          <MutedText>No follow or request state is simulated or saved locally.</MutedText>
        </View>
      ) : null}

      {loadState === "error" ? (
        <View style={styles.stateBlock}>
          <Card><Text accessibilityLiveRegion="polite" style={[styles.stateText, { color: colors.accentStrong }]}>{loadError}</Text></Card>
          <AppButton label="Retry" variant="outline" onPress={() => { void reload(); }} />
        </View>
      ) : null}

      {actionError ? <Text accessibilityLiveRegion="polite" style={[styles.actionError, { color: colors.accentStrong }]}>{actionError}</Text> : null}
      {actionNotice ? <Text accessibilityLiveRegion="polite" style={[styles.actionNotice, { color: colors.secondary }]}>{actionNotice}</Text> : null}

      {loadState === "ready" && overview ? (
        <>
          {overview.unavailableProfiles ? (
            <LocalPreviewNotice>A relationship exists for a profile row that could not be loaded. Refresh or ask an administrator to reconcile the profile data.</LocalPreviewNotice>
          ) : null}

          <View style={styles.section}>
            <SectionHeading title="Follow requests" action={<Text style={[styles.count, { color: colors.accent, backgroundColor: colors.accentSoft }]}>{overview.incoming.length}</Text>} />
            {overview.incoming.length ? overview.incoming.map(({ relationship, profile }) => {
              const key = `incoming:${relationship.requester_id}`;
              const isBusy = busyKey === key;
              return (
                <RelationshipProfileCard
                  key={relationship.requester_id}
                  profile={profile}
                  statusLabel="Wants to follow you"
                  actionDisabled={busyKey !== null}
                  onCardPress={() => router.push(("/member/" + profile.id) as never)}
                  secondaryAction={(
                    <View style={styles.actionRow}>
                      <AppButton
                        label={isBusy ? "Please wait…" : "Approve"}
                        disabled={busyKey !== null}
                        onPress={() => { void performAction(key, () => approveFollowRequest(relationship.requester_id, user?.id)); }}
                      />
                      <AppButton
                        label="Reject"
                        variant="outline"
                        disabled={busyKey !== null}
                        onPress={() => { void performAction(key, () => rejectFollowRequest(relationship.requester_id, user?.id)); }}
                      />
                    </View>
                  )}
                />
              );
            }) : (
              <Card style={styles.emptyCard}><MutedText>You have no pending follow requests.</MutedText></Card>
            )}
          </View>

          <View style={styles.section}>
            <SectionHeading title="Outgoing requests" action={<Text style={[styles.count, { color: colors.accent, backgroundColor: colors.accentSoft }]}>{overview.outgoing.length}</Text>} />
            {overview.outgoing.length ? overview.outgoing.map(({ relationship, profile }) => {
              const key = `outgoing:${relationship.target_id}`;
              return (
                <RelationshipProfileCard
                  key={relationship.target_id}
                  profile={profile}
                  statusLabel="Requested · waiting for approval"
                  actionLabel={busyKey === key ? "Please wait…" : "Cancel request"}
                  actionAccessibilityLabel={`Cancel follow request to @${profile.username}`}
                  actionVariant="outline"
                  actionDisabled={busyKey !== null}
                  onCardPress={() => router.push(("/member/" + profile.id) as never)}
                  onAction={() => { void performAction(key, () => removeFollowRelationship(relationship.target_id, user?.id)); }}
                />
              );
            }) : (
              <Card style={styles.emptyCard}><MutedText>You have no outgoing follow requests.</MutedText></Card>
            )}
          </View>

          <View style={styles.section}>
            <SectionHeading title="Accepted connections" action={<Text style={[styles.count, { color: colors.accent, backgroundColor: colors.accentSoft }]}>{overview.connections.length}</Text>} />
            {overview.connections.length ? overview.connections.map(({ profile, youFollow, followsYou }) => {
              const key = `connection:${profile.id}`;
              const statusLabel = youFollow && followsYou
                ? "You follow each other · Match"
                : youFollow ? "You follow this account" : "Follows you";
              const actionLabel = busyKey === key
                ? "Please wait…"
                : youFollow ? "Following" : profile.is_private ? "Request back" : "Follow back";
              return (
                <RelationshipProfileCard
                  key={profile.id}
                  profile={profile}
                  statusLabel={statusLabel}
                  actionLabel={actionLabel}
                  actionAccessibilityLabel={youFollow ? `Unfollow @${profile.username}` : `Follow @${profile.username} back`}
                  actionVariant={youFollow ? "outline" : "primary"}
                  actionIcon={youFollow ? "check" : undefined}
                  actionDisabled={busyKey !== null}
                  onCardPress={() => router.push(("/member/" + profile.id) as never)}
                  onMessage={() => router.push(("/chat/" + profile.id) as never)}
                  onAction={() => {
                    void performAction(key, () => youFollow
                      ? removeFollowRelationship(profile.id, user?.id)
                      : followProfile(profile.id, user?.id));
                  }}
                />
              );
            }) : (
              <Card style={styles.emptyCard}><MutedText>No accepted follows yet. Search for Gormati members in Discover to get started.</MutedText></Card>
            )}
          </View>
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  count: { minWidth: 24, height: 24, borderRadius: 12, textAlign: "center", textAlignVertical: "center", fontSize: 11, fontWeight: "700", overflow: "hidden" },
  loading: { minHeight: 90, alignItems: "center", justifyContent: "center", gap: 12 },
  stateBlock: { gap: 12 },
  stateText: { fontSize: 13, lineHeight: 19 },
  matchesScroll: { gap: 12, paddingVertical: 4 },
  matchCard: {
    width: 90,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  matchAvatarWrap: { position: "relative" },
  activeDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  matchName: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  matchActionText: { fontSize: 11, fontWeight: "800" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  emptyCard: { minHeight: 62, justifyContent: "center" },
  actionError: { fontSize: 13, lineHeight: 19 },
  actionNotice: { fontSize: 13, lineHeight: 19 },
});
