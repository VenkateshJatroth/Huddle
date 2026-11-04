import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/ui";
import {
  fetchCallHistory,
  startCall,
  type CallHistoryItem,
} from "../lib/calling";
import { formatAudioDuration } from "../lib/audio";
import { useAppColors } from "../theme/colors";

function formatCallTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (diffDays === 0) return `Today, ${timeStr}`;
    if (diffDays === 1) return `Yesterday, ${timeStr}`;
    if (diffDays < 7) {
      const dayName = d.toLocaleDateString([], { weekday: "short" });
      return `${dayName}, ${timeStr}`;
    }
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
  } catch {
    return dateString;
  }
}

export default function CallsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();

  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [filter, setFilter] = useState<"all" | "missed">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dialingId, setDialingId] = useState<string | null>(null);

  const loadCalls = useCallback(async () => {
    if (!user?.id) return;
    try {
      const history = await fetchCallHistory(user.id);
      setCalls(history);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadCalls();
  }, [loadCalls]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadCalls();
  }, [loadCalls]);

  const handleRedial = async (item: CallHistoryItem, callType: "voice" | "video") => {
    if (!user?.id || dialingId) return;
    setDialingId(`${item.id}_${callType}`);
    try {
      const session = await startCall(
        user.id,
        item.otherUserId,
        callType,
        user.email?.split("@")[0] || "Huddle Member",
      );

      router.push({
        pathname: "/call/[id]",
        params: {
          id: item.otherUserId,
          callId: session.id,
          type: callType,
          incoming: "false",
          channelId: session.agora_channel || undefined,
        },
      } as never);
    } catch (err) {
      console.warn("Redial failed:", err);
    } finally {
      setDialingId(null);
    }
  };

  const displayedCalls = filter === "all" ? calls : calls.filter((c) => c.direction === "missed");
  const missedCount = calls.filter((c) => c.direction === "missed").length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header */}
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
        <View style={styles.headerLeft}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)/chat" as never);
            }}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Icon name="arrowBack" color={colors.text} size={22} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Call History</Text>
        </View>

        {/* Filter Pills */}
        <View style={[styles.filterGroup, { backgroundColor: colors.subtle }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show all calls"
            onPress={() => setFilter("all")}
            style={[
              styles.filterTab,
              filter === "all" && [styles.filterTabActive, { backgroundColor: colors.surface }],
            ]}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: filter === "all" ? colors.text : colors.secondary },
              ]}
            >
              All ({calls.length})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show missed calls only"
            onPress={() => setFilter("missed")}
            style={[
              styles.filterTab,
              filter === "missed" && [styles.filterTabActive, { backgroundColor: colors.surface }],
            ]}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: filter === "missed" ? "#EF4444" : colors.secondary },
              ]}
            >
              Missed {missedCount > 0 ? `(${missedCount})` : ""}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.secondary }]}>
            Loading call logs…
          </Text>
        </View>
      ) : displayedCalls.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.accentSoft }]}>
            <Icon name="phone" color={colors.accent} size={36} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {filter === "missed" ? "No Missed Calls" : "No Calls Yet"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
            {filter === "missed"
              ? "You haven't missed any incoming voice or video calls."
              : "Connect with friends and sparks with HD crystal-clear voice and video calling."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Discover members to call"
            onPress={() => router.push("/discover" as never)}
            style={[styles.discoverBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.discoverBtnText}>Explore Members</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayedCalls}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => {
            const isMissed = item.direction === "missed";
            const isOutgoing = item.direction === "outgoing";

            return (
              <View
                style={[
                  styles.callRow,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {/* Caller/Partner Avatar */}
                <Avatar
                  name={item.otherUserName}
                  imageSource={item.otherUserAvatar || undefined}
                  size={48}
                />

                {/* Call Info */}
                <View style={styles.callDetails}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.callerName,
                      { color: isMissed ? "#EF4444" : colors.text },
                    ]}
                  >
                    {item.otherUserName}
                  </Text>

                  <View style={styles.metaRow}>
                    <Icon
                      name={
                        isMissed
                          ? "phoneMissed"
                          : isOutgoing
                            ? "phoneOutgoing"
                            : "phoneIncoming"
                      }
                      color={
                        isMissed
                          ? "#EF4444"
                          : isOutgoing
                            ? "#10B981"
                            : "#3B82F6"
                      }
                      size={14}
                    />
                    <Text
                      style={[
                        styles.callTypeLabel,
                        { color: isMissed ? "#EF4444" : colors.secondary },
                      ]}
                    >
                      {isMissed
                        ? "Missed"
                        : item.durationSeconds > 0
                          ? formatAudioDuration(item.durationSeconds)
                          : item.status === "declined"
                            ? "Declined"
                            : "Ended"}
                      {" • "}
                      {item.callType === "video" ? "Video" : "Voice"}
                    </Text>
                  </View>

                  <Text style={[styles.timeLabel, { color: colors.secondary }]}>
                    {formatCallTime(item.createdAt)}
                  </Text>
                </View>

                {/* Redial Actions */}
                <View style={styles.actionGroup}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Voice call ${item.otherUserName}`}
                    onPress={() => handleRedial(item, "voice")}
                    style={[styles.actionBtn, { backgroundColor: colors.accentSoft }]}
                    hitSlop={8}
                  >
                    <Icon name="phone" color={colors.accent} size={18} />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Video call ${item.otherUserName}`}
                    onPress={() => handleRedial(item, "video")}
                    style={[styles.actionBtn, { backgroundColor: colors.accentSoft }]}
                    hitSlop={8}
                  >
                    <Icon name="video" color={colors.accent} size={18} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  filterGroup: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  filterTabActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "700",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  discoverBtn: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  discoverBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  callRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  callDetails: {
    flex: 1,
    gap: 3,
  },
  callerName: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  callTypeLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  actionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});

