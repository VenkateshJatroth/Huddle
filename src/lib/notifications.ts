import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { AndroidImportance, AndroidNotificationVisibility } from "expo-notifications";
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

type UnreadCountListener = (count: number) => void;
const unreadListeners = new Set<UnreadCountListener>();

export function subscribeToUnreadCount(listener: UnreadCountListener): () => void {
  unreadListeners.add(listener);
  return () => {
    unreadListeners.delete(listener);
  };
}

export function notifyUnreadCountChange(count: number): void {
  unreadListeners.forEach((fn) => {
    try {
      fn(count);
    } catch {
      // Safe dispatch
    }
  });
}

export async function fetchNotifications(userId: string): Promise<InAppNotification[]> {
  if (!userId) return [];
  try {
    const { data, error } = await (supabase as any)
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data) {
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
  if (!userId) return 0;
  try {
    const { count, error } = await (supabase as any)
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .or("is_read.eq.false,is_read.is.null");

    if (error || count == null) {
      const fallback = await (supabase as any)
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      return fallback.count || 0;
    }

    return count;
  } catch {
    return 0;
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  if (!userId) return;
  // Instantly reset unread count badge
  notifyUnreadCountChange(0);

  try {
    await (supabase as any)
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId);
  } catch (err) {
    console.warn("markAllNotificationsAsRead db error:", err);
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  if (!notificationId) return;

  try {
    await (supabase as any)
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);
  } catch (err) {
    console.warn("markNotificationAsRead db error:", err);
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

export const INCOMING_CALL_CHANNEL_ID = "incoming-calls";
export const INCOMING_CALL_CATEGORY_ID = "incoming-call-category";

export async function setupCallNotificationChannel(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync(INCOMING_CALL_CHANNEL_ID, {
        name: "Incoming Calls",
        description: "Ringtone and high-priority alerts for incoming voice and video calls.",
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 500, 500, 500],
        lightColor: "#ec4899",
        lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
        sound: "default",
        bypassDnd: true,
      });
    } catch {
      // Channel setup guard
    }
  }

  try {
    await Notifications.setNotificationCategoryAsync(INCOMING_CALL_CATEGORY_ID, [
      {
        identifier: "ANSWER_CALL",
        buttonTitle: "Answer",
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: "DECLINE_CALL",
        buttonTitle: "Decline",
        options: {
          isDestructive: true,
          opensAppToForeground: false,
        },
      },
    ]);
  } catch {
    // Category setup guard
  }
}

/**
 * Triggers an immediate high-priority incoming call notification on the device.
 */
export async function presentIncomingCallNotification(params: {
  callId: string;
  callerId: string;
  callerName: string;
  callType: "voice" | "video";
}): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    await setupCallNotificationChannel();

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `📞 Incoming ${params.callType === "video" ? "Video" : "Voice"} Call`,
        body: `${params.callerName} is calling you on Huddle...`,
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
        categoryIdentifier: INCOMING_CALL_CATEGORY_ID,
        data: {
          type: "incoming_call",
          callId: params.callId,
          callerId: params.callerId,
          callType: params.callType,
          callerName: params.callerName,
        },
      },
      trigger: {
        channelId: INCOMING_CALL_CHANNEL_ID,
      },
    });

    return notifId;
  } catch (err) {
    console.warn("presentIncomingCallNotification error:", err);
    return null;
  }
}

/**
 * Dismisses an active incoming call notification.
 */
export async function dismissIncomingCallNotification(notificationId?: string | null): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (notificationId) {
      await Notifications.dismissNotificationAsync(notificationId);
    } else {
      await Notifications.dismissAllNotificationsAsync();
    }
  } catch {
    // Non-blocking
  }
}

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

  // Setup both general and high-importance call channels
  await setupCallNotificationChannel();

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
    type?: string;
    callId?: string;
    callerId?: string;
    callType?: "voice" | "video";
    callerName?: string;
  } | undefined;

  if (!data) return;

  if (data.type === "incoming_call" && data.callId && data.callerId) {
    if (response.actionIdentifier === "DECLINE_CALL") {
      void Notifications.dismissNotificationAsync(response.notification.request.identifier);
      void (supabase as any)
        .from("call_sessions")
        .update({ status: "declined", ended_at: new Date().toISOString() })
        .eq("id", data.callId);
      return;
    }

    void Notifications.dismissNotificationAsync(response.notification.request.identifier);
    router.push({
      pathname: "/call/[id]",
      params: {
        id: data.callerId,
        callId: data.callId,
        type: data.callType || "voice",
        isIncoming: "true",
      },
    } as never);
    return;
  }

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
