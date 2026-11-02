import { useFocusEffect, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthProvider";
import { Icon } from "../../components/Icon";
import { AppButton, Avatar, Card, VerifiedBadge } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { fetchMemberProfile } from "../../lib/gormati-profiles";
import type { GormatiProfile } from "../../lib/gormati-profiles";
import { fetchRelationshipOverview } from "../../lib/relationships";
import { suggestedAccounts } from "../../data/mockData";
import { useAppColors } from "../../theme/colors";

type ConnectedFriend = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type ConversationThread = {
  partnerId: string;
  partnerProfile: GormatiProfile | null;
  lastMessage: string;
  lastMessageTime: string;
  isUnread: boolean;
};

function formatSnippetTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

export default function ChatTabScreen() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [activeConnections, setActiveConnections] = useState<ConnectedFriend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!user) return;

    try {
      // 1. Fetch direct messages involving the current user
      const { data: messages } = await (supabase as any)
        .from("direct_messages")
        .select("*")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      // Group by conversation partner
      const threadMap = new Map<string, { lastMsg: any; isUnread: boolean }>();

      if (messages && Array.isArray(messages)) {
        messages.forEach((msg: any) => {
          const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
          if (!partnerId) return;

          if (!threadMap.has(partnerId)) {
            const isUnread = msg.receiver_id === user.id && !msg.read_at;
            threadMap.set(partnerId, { lastMsg: msg, isUnread });
          }
        });
      }

      // 2. Load partner profiles for each thread
      const threadItems: ConversationThread[] = await Promise.all(
        Array.from(threadMap.entries()).map(async ([partnerId, info]) => {
          const profile = await fetchMemberProfile(partnerId);
          return {
            partnerId,
            partnerProfile: profile,
            lastMessage: info.lastMsg.content || (info.lastMsg.image_url ? "📷 Photo" : "Message"),
            lastMessageTime: formatSnippetTime(info.lastMsg.created_at),
            isUnread: info.isUnread,
          };
        }),
      );

      setThreads(threadItems);

      // 3. Load active mutual connections for quick start chat strip
      const overview = await fetchRelationshipOverview(user.id);
      const friends: ConnectedFriend[] = [
        ...(overview?.connections.map((c) => ({
          id: c.profile.id,
          display_name: c.profile.display_name,
          avatar_url: c.profile.avatar_url,
        })) ?? []),
        ...suggestedAccounts.map((a) => ({ id: a.id, display_name: a.name, avatar_url: null })),
      ];
      const uniqueFriends = Array.from(new Map(friends.map((f) => [f.id, f])).values());
      setActiveConnections(uniqueFriends);
    } catch {
      // Non-blocking query guard
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
    }, [loadConversations]),
  );

  // Real-time listener on direct_messages table
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("chat_tab_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_messages",
        },
        () => {
          void loadConversations();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, loadConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  }, [loadConversations]);

  const unreadCount = threads.filter((t) => t.isUnread).length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header Bar */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top + 8, 20),
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
          {unreadCount > 0 ? (
            <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explore members"
          onPress={() => router.push("/discover" as never)}
          style={styles.headerAction}
        >
          <Icon name="search" color={colors.text} size={20} />
        </Pressable>
      </View>

      {/* Active Connected Friends Strip */}
      {activeConnections.length > 0 ? (
        <View style={[styles.friendsSection, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionHeadingText, { color: colors.secondary }]}>
            Connected Friends
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendsScroll}
          >
            {activeConnections.map((friend) => (
              <Pressable
                key={friend.id}
                accessibilityRole="button"
                accessibilityLabel={`Chat with ${friend.display_name}`}
                onPress={() => router.push(("/chat/" + friend.id) as never)}
                style={styles.friendItem}
              >
                <Avatar
                  name={friend.display_name}
                  tone={friend.display_name.length % 5}
                  size={52}
                  imageSource={friend.avatar_url ? { uri: friend.avatar_url } : undefined}
                />
                <Text numberOfLines={1} style={[styles.friendName, { color: colors.text }]}>
                  {friend.display_name.split(" ")[0]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Main Conversations Thread List */}
      {isLoading ? (
        <View style={styles.stateCenter}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.stateText, { color: colors.secondary }]}>
            Loading conversations…
          </Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.partnerId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { void onRefresh(); }}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="chat" color={colors.secondary} size={42} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No conversations yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
                Connect with community members from Discover or Circles to begin live messaging.
              </Text>
              <AppButton
                label="Explore Community Members"
                variant="outline"
                icon="search"
                onPress={() => router.push("/discover" as never)}
              />
            </View>
          }
          renderItem={({ item }) => {
            const partnerName = item.partnerProfile?.display_name || "Community Member";
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Chat with ${partnerName}`}
                onPress={() => router.push(("/chat/" + item.partnerId) as never)}
              >
                <Card
                  style={[
                    styles.threadCard,
                    item.isUnread ? { borderColor: colors.accent } : null,
                  ]}
                >
                  <View style={styles.threadRow}>
                    <Avatar
                      name={partnerName}
                      tone={partnerName.length % 5}
                      size={48}
                      imageSource={item.partnerProfile?.avatar_url ? { uri: item.partnerProfile.avatar_url } : undefined}
                    />

                    <View style={styles.threadInfo}>
                      <View style={styles.threadHeaderRow}>
                        <View style={styles.partnerNameWrap}>
                          <Text numberOfLines={1} style={[styles.partnerName, { color: colors.text }]}>
                            {partnerName}
                          </Text>
                          {item.partnerProfile?.is_verified ? <VerifiedBadge /> : null}
                        </View>
                        <Text style={[styles.timeText, { color: colors.secondary }]}>
                          {item.lastMessageTime}
                        </Text>
                      </View>

                      <View style={styles.snippetRow}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.snippetText,
                            { color: item.isUnread ? colors.text : colors.secondary },
                            item.isUnread ? { fontWeight: "700" } : null,
                          ]}
                        >
                          {item.lastMessage}
                        </Text>
                        {item.isUnread ? (
                          <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
                        ) : null}
                      </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  headerAction: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  friendsSection: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  sectionHeadingText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 16,
  },
  friendsScroll: { paddingHorizontal: 16, gap: 14 },
  friendItem: { alignItems: "center", gap: 5, width: 62 },
  friendName: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  listContent: { padding: 16, gap: 10 },
  threadCard: { padding: 12, borderRadius: 14 },
  threadRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  threadInfo: { flex: 1, gap: 4 },
  threadHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  partnerNameWrap: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  partnerName: { fontSize: 15, fontWeight: "700" },
  timeText: { fontSize: 11 },
  snippetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  snippetText: { fontSize: 13, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  stateCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  stateText: { fontSize: 14 },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptySubtitle: { fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 8 },
});

