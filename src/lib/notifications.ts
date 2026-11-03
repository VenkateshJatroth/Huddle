import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { supabase } from "./supabase";

// =============================================================================
// 1. In-App Notifications
// =============================================================================

export type InAppNotification = {
  id: string;
  user_id: string;
  actor_id?: string | null;
  actor_name: string;
  type: "like" | "reply" | "follow" | "message";
  reference_id?: string | null;
  content?: string | null;
  is_read: boolean;
  created_at: string;
  time?: string;
};

const demoNotifications: InAppNotification[] = [
  {
    id: "notif-1",
    user_id: "me",
    actor_name: "Sana Iqbal",
    type: "message",
    content: "Sent you a message: 'Hey there! Loved your take on exploring old neighborhoods...'",
    is_read: false,
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    time: "15m ago",
  },
  {
    id: "notif-2",
    user_id: "me",
    actor_name: "Dev Menon",
    type: "follow",
    content: "Connected with you on Huddle.",
    is_read: false,
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    time: "2h ago",
  },
  {
    id: "notif-3",
    user_id: "me",
    actor_name: "Priya Kulkarni",
    type: "like",
    content: "Liked your community post.",
    is_read: true,
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    time: "1d ago",
  },
];

function formatTimeAgo(dateString: string): string {
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "Recently";
  }
}

export async function fetchNotifications(userId: string): Promise<InAppNotification[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error || !data) {
      return [];
    }

    if (data.length === 0) {
      return [];
    }

    return (data as any[]).map((n) => ({
      ...n,
      actor_name: n.actor_name || "Huddle Member",
      time: formatTimeAgo(n.created_at),
    }));
  } catch {
    return [];
  }
}

export async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  try {
    const { count, error } = await (supabase as any)
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error || count == null) {
      return 0;
    }

    return count;
  } catch {
    return 0;
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  demoNotifications.forEach((n) => { n.is_read = true; });

  try {
    await (supabase as any)
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
  } catch {
    // Non-blocking
  }
}

export async function createNotification(payload: {
  userId: string;
  actorId?: string;
  actorName: string;
  type: "like" | "reply" | "follow" | "message";
  referenceId?: string;
  content?: string;
}): Promise<void> {
  try {
    await (supabase as any).from("notifications").insert({
      user_id: payload.userId,
      actor_id: payload.actorId,
      actor_name: payload.actorName,
      type: payload.type,
      reference_id: payload.referenceId,
      content: payload.content,
    });
  } catch {
    // Non-blocking
  }
}

export function subscribeToNotifications(
  userId: string,
  onNewNotification: (notif: InAppNotification) => void,
): () => void {
  const channel = supabase
    .channel(`notifs_${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as any;
        onNewNotification({
          ...row,
          time: "Just now",
        });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// =============================================================================
// 2. Push Notifications & Observers
// =============================================================================

// Configure how notifications appear when the app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function isRunningInExpoGo(): boolean {
  return (
    Constants.appOwnership === "expo" ||
    (Constants as { executionEnvironment?: string }).executionEnvironment === "storeClient"
  );
}

export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }

  if (isRunningInExpoGo()) {
    return null;
  }

  if (!Device.isDevice) {
    return null;
  }

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Huddle Notifications",
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#000000",
      });
    } catch {
      // Channel setup guard
    }
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      "2bec6c32-3d58-45ed-9490-6f46da5ad030";

    const pushTokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = pushTokenData.data;

    if (token && userId) {
      await supabase
        .from("profiles")
        .update({ push_token: token })
        .eq("id", userId);
    }

    return token;
  } catch {
    return null;
  }
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as {
    url?: string;
    chatId?: string;
    memberId?: string;
  } | undefined;

  if (!data) return;

  if (data.url) {
    router.push(data.url as never);
  } else if (data.chatId) {
    router.push({ pathname: "/chat/[id]", params: { id: data.chatId } } as never);
  } else if (data.memberId) {
    router.push({ pathname: "/member/[id]", params: { id: data.memberId } } as never);
  }
}

export function useNotificationObserver() {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    if (isRunningInExpoGo() && Platform.OS === "android") {
      return;
    }

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (isMounted.current && response) {
          handleNotificationResponse(response);
        }
      })
      .catch(() => {});

    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationResponse(response);
      });
    } catch {
      // Listener notice
    }

    return () => {
      isMounted.current = false;
      subscription?.remove();
    };
  }, []);
}

/**
 * Sends a gentle push/in-app reminder to encourage users to share updates and post inside GorMati.
 * Triggers at most once every 24 hours if the user hasn't shared a post recently.
 */
export async function checkAndTriggerEngagementReminder(userId: string): Promise<void> {
  if (!userId) return;

  const storageKey = `gormati_last_engagement_reminder_${userId}`;
  try {
    const lastReminder = globalThis.localStorage?.getItem(storageKey);
    if (lastReminder) {
      const elapsed = Date.now() - Number(lastReminder);
      // Run once every 24 hours
      if (elapsed < 24 * 60 * 60 * 1000) {
        return;
      }
    }
  } catch {
    // Storage guard
  }

  try {
    // Check if user has posted recently (in the last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await (supabase as any)
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("author_id", userId)
      .gte("created_at", oneDayAgo);

    if (count && count > 0) {
      // User is already active; record timestamp and skip
      globalThis.localStorage?.setItem(storageKey, String(Date.now()));
      return;
    }

    // Insert gentle in-app reminder
    await (supabase as any).from("notifications").insert({
      user_id: userId,
      actor_name: "Huddle Community",
      type: "reply",
      content: "What's happening in your world? Share a thought, photo, or update with your circles ✨",
      reference_id: "create",
      is_read: false,
    });

    // Schedule gentle native local push notification if permissions granted
    if (Platform.OS !== "web" && !isRunningInExpoGo()) {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === "granted") {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Huddle Community ✨",
              body: "What's new with you today? Share a story, photo, or thought with your circles!",
              data: { url: "/create" },
            },
            trigger: null,
          });
        }
      } catch {
        // Notification schedule guard
      }
    }

    globalThis.localStorage?.setItem(storageKey, String(Date.now()));
  } catch {
    // Non-blocking
  }
}
