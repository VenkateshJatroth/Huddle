import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { supabase } from "./supabase";

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

/**
 * Checks if the app is currently running inside the Expo Go sandbox.
 * Expo Go on Android does not support remote push notifications or custom channels since SDK 53.
 */
function isRunningInExpoGo(): boolean {
  return (
    Constants.appOwnership === "expo" ||
    (Constants as { executionEnvironment?: string }).executionEnvironment === "storeClient"
  );
}

/**
 * Request notification permissions, obtain the Expo Push Token,
 * and sync it with the user's Supabase profile row.
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }

  // Gracefully skip in Expo Go on Android where remote notifications & channels are unsupported
  if (isRunningInExpoGo()) {
    console.log(
      "[PushNotifications] Running inside Expo Go. Remote push notifications are disabled in Expo Go on Android. Use a development build (APK) or production build (AAB) for live push notifications.",
    );
    return null;
  }

  if (!Device.isDevice) {
    console.log("[PushNotifications] Must use a physical device for remote push notifications.");
    return null;
  }

  // Create high-importance Android notification channel with defensive try/catch
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Gormati Notifications",
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#000000",
      });
    } catch (channelErr) {
      console.warn("[PushNotifications] Notification channel setup notice:", channelErr);
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
      console.log("[PushNotifications] Notification permissions not granted.");
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
      const { error } = await supabase
        .from("profiles")
        .update({ push_token: token })
        .eq("id", userId);

      if (error) {
        console.warn("[PushNotifications] Failed to save push token to Supabase:", error.message);
      } else {
        console.log("[PushNotifications] Push token registered and saved for user:", userId);
      }
    }

    return token;
  } catch (err) {
    console.warn("[PushNotifications] Error registering for push notifications:", err);
    return null;
  }
}

/**
 * Route user based on notification response payload
 */
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

/**
 * Hook to listen for notification responses (user tapping on a notification)
 * and deep link them directly to the chat or member screen.
 */
export function useNotificationObserver() {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    // In Expo Go on Android, notification listeners can reject if native services are absent
    if (isRunningInExpoGo() && Platform.OS === "android") {
      return;
    }

    // Check if the app was launched by tapping a notification
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (isMounted.current && response) {
          handleNotificationResponse(response);
        }
      })
      .catch((err) => {
        console.log("[PushNotifications] Notice reading last notification response:", err);
      });

    // Listen for notification taps while the app is running in background or foreground
    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationResponse(response);
      });
    } catch (err) {
      console.log("[PushNotifications] Notification response listener notice:", err);
    }

    return () => {
      isMounted.current = false;
      subscription?.remove();
    };
  }, []);
}

/**
 * Client helper to send an Expo push notification via the Expo Push API.
 * Primarily used for direct notifications or fallback/testing.
 */
export async function sendExpoPushNotification({
  to,
  title,
  body,
  data = {},
}: {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        sound: "default",
        title,
        body,
        data,
      }),
    });
    return await response.json();
  } catch (error) {
    console.warn("[PushNotifications] Error sending push notification:", error);
    return null;
  }
}
