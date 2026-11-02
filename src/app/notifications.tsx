import { useCallback, useEffect, useState } from "react";
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
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Icon";
import { AppButton, Avatar, Card } from "../components/ui";
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  subscribeToNotifications,
  type InAppNotification,
} from "../lib/notifications";
import { followProfile } from "../lib/relationships";
import { useAppColors } from "../theme/colors";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followedBackIds, setFollowedBackIds] = useState<Record<string, boolean>>({});
  const [busyFollowId, setBusyFollowId] = useState<string | null>(null);

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

  const loadNotifs = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchNotifications(user.id);
      setNotifications(data);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadNotifs();
  }, [loadNotifs]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToNotifications(user.id, (incoming) => {
      setNotifications((prev) => [incoming, ...prev]);
    });
    return () => {
      unsubscribe();
    };
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifs();
    setRefreshing(false);
  }, [loadNotifs]);

  const handleMarkAllRead = async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllNotificationsAsRead(user.id);
  };

  const handleFollowBack = async (notif: InAppNotification) => {
    if (!user || !notif.actor_id || busyFollowId) return;
    setBusyFollowId(notif.actor_id);
    try {
      await followProfile(notif.actor_id, user.id);
      setFollowedBackIds((prev) => ({ ...prev, [notif.actor_id!]: true }));
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)),
      );
    } catch {
      // Non-blocking
    } finally {
      setBusyFollowId(null);
    }
  };

  const handleNotificationPress = (notif: InAppNotification) => {
    if (notif.type === "message" && notif.reference_id) {
      router.push(("/chat/" + notif.reference_id) as never);
    } else if (notif.type === "follow" && notif.actor_id) {
      router.push(("/member/" + notif.actor_id) as never);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Header Bar with Safe Area Insets */}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          style={styles.backButton}
        >
          <Icon name="chevronLeft" color={colors.text} size={20} />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
          {unreadCount > 0 ? (
            <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          ) : null}
        </View>

        {unreadCount > 0 ? (
          <AppButton
            label="Mark all read"
            variant="text"
            onPress={() => { void handleMarkAllRead(); }}
          />
        ) : <View style={{ width: 40 }} />}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.loadingText, { color: colors.secondary }]}>Loading notifications…</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
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
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="bell" color={colors.secondary} size={36} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications</Text>
              <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
                You’re all caught up! Matches, likes, and messages will appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => handleNotificationPress(item)}
            >
              <Card
                style={[
                  styles.notifCard,
                  !item.is_read ? { borderColor: colors.accent } : null,
                ]}
              >
                <View style={styles.notifRow}>
                  <Avatar name={item.actor_name} tone={item.actor_name.length % 5} size={42} />
                  <View style={styles.notifInfo}>
                    <View style={styles.notifHeaderRow}>
                      <Text style={[styles.actorName, { color: colors.text }]}>
                        {item.actor_name}
                      </Text>
                      <Text style={[styles.timeText, { color: colors.secondary }]}>
                        {item.time}
                      </Text>
                    </View>
                    <Text style={[styles.contentText, { color: colors.text }]}>
                      {item.content}
                    </Text>
                    {item.type === "follow" && item.actor_id ? (
                      <View style={styles.followActionRow}>
                        {followedBackIds[item.actor_id] ? (
                          <View style={[styles.connectedBadge, { backgroundColor: colors.accentSoft }]}>
                            <Icon name="check" color={colors.accent} size={14} />
                            <Text style={[styles.connectedBadgeText, { color: colors.accent }]}>Connected</Text>
                          </View>
                        ) : (
                          <AppButton
                            label={busyFollowId === item.actor_id ? "Connecting…" : "Follow Back / Accept"}
                            disabled={busyFollowId !== null}
                            onPress={() => { void handleFollowBack(item); }}
                          />
                        )}
                      </View>
                    ) : null}
                  </View>
                  {!item.is_read ? (
                    <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
                  ) : null}
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "180deg" }],
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  unreadBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 13 },
  listContent: { padding: 16, gap: 10 },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptySubtitle: { fontSize: 13, lineHeight: 18, textAlign: "center" },
  notifCard: { padding: 12, borderRadius: 14 },
  notifRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  notifInfo: { flex: 1, gap: 4 },
  notifHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actorName: { fontSize: 14, fontWeight: "700" },
  timeText: { fontSize: 11 },
  contentText: { fontSize: 13, lineHeight: 18 },
  followActionRow: { marginTop: 6, flexDirection: "row", alignItems: "center" },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  connectedBadgeText: { fontSize: 12, fontWeight: "700" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});

