import { useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Icon";
import { UpdateNotificationBanner } from "../components/UpdateNotificationBanner";
import { subscribeToIncomingCalls, updateCallStatus, type CallSession } from "../lib/calling";
import { fetchFullProfile } from "../lib/gormati-profiles";
import {
  checkAndTriggerProfileCompletionReminder,
  getProfileCompletion,
} from "../lib/profileCompletion";
import {
  checkAndTriggerEngagementReminder,
  registerForPushNotificationsAsync,
  useNotificationObserver,
} from "../lib/notifications";
import { checkDailyStreakReminder } from "../lib/streaks";
import { setupUpdateLifecycle } from "../lib/updates";
import { AppThemeProvider, useAppColors } from "../theme/colors";

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </AppThemeProvider>
  );
}

function RootNavigator() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);

  // Set up listener for notification clicks to auto-route to chats or member profiles
  useNotificationObserver();

  // Check for OTA updates on startup and when returning to foreground
  useEffect(() => {
    return setupUpdateLifecycle();
  }, []);

  // Listen for real-time incoming voice/video calls
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToIncomingCalls(user.id, (call) => {
      setIncomingCall(call);
    });
    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  // Register push notifications & check engagement & streak reminders when user is authenticated
  useEffect(() => {
    if (user?.id) {
      registerForPushNotificationsAsync(user.id);
      void checkAndTriggerEngagementReminder(user.id);
      void checkDailyStreakReminder(user.id);

      // Verify core profile completion gate
      void fetchFullProfile(user.id).then((profile) => {
        const completion = getProfileCompletion(profile);
        if (!completion.isCoreComplete) {
          router.replace("/onboarding-profile" as never);
        } else if (!completion.isFullyComplete) {
          void checkAndTriggerProfileCompletionReminder(user.id, profile);
        }
      });
    }
  }, [user?.id]);

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    const callToAnswer = incomingCall;
    setIncomingCall(null);
    router.push({
      pathname: "/call/[id]",
      params: {
        id: callToAnswer.caller_id,
        callId: callToAnswer.id,
        type: callToAnswer.call_type,
        incoming: "true",
      },
    } as never);
  };

  const handleDeclineCall = () => {
    if (!incomingCall) return;
    void updateCallStatus(incomingCall.id, "declined");
    setIncomingCall(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={colors.background === "#000000" ? "light" : "dark"} />
      <UpdateNotificationBanner />

      {/* Floating Incoming Call Banner */}
      {incomingCall ? (
        <View
          style={[
            styles.incomingCallToast,
            {
              top: Math.max(insets.top + 8, 20),
              backgroundColor: colors.surface,
              borderColor: colors.accent,
            },
          ]}
        >
          <View style={[styles.callIconCircle, { backgroundColor: colors.accentSoft }]}>
            <Icon
              name={incomingCall.call_type === "video" ? "video" : "phone"}
              color={colors.accent}
              size={22}
            />
          </View>
          <View style={styles.callDetails}>
            <Text numberOfLines={1} style={[styles.callerName, { color: colors.text }]}>
              {incomingCall.caller_name || "GorMati Member"}
            </Text>
            <Text style={[styles.callTypeLabel, { color: colors.secondary }]}>
              Incoming {incomingCall.call_type === "video" ? "Video" : "Voice"} Call…
            </Text>
          </View>
          <View style={styles.callActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decline call"
              onPress={handleDeclineCall}
              style={[styles.callActionBtn, { backgroundColor: "#EF4444" }]}
              hitSlop={8}
            >
              <Icon name="close" color="#FFFFFF" size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Answer call"
              onPress={handleAcceptCall}
              style={[styles.callActionBtn, { backgroundColor: "#10B981" }]}
              hitSlop={8}
            >
              <Icon name="phone" color="#FFFFFF" size={18} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="onboarding-profile"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="onboarding" options={{ presentation: "modal" }} />
        <Stack.Screen name="member/[id]" options={{ presentation: "card" }} />
        <Stack.Screen name="chat/[id]" options={{ presentation: "card" }} />
        <Stack.Screen name="call/[id]" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
        <Stack.Screen name="vibe-check" options={{ presentation: "card" }} />
        <Stack.Screen name="settings" options={{ presentation: "card" }} />
        <Stack.Screen name="notifications" options={{ presentation: "card" }} />
        <Stack.Screen name="discover" options={{ presentation: "card" }} />
        <Stack.Screen name="leaderboard" options={{ presentation: "card" }} />
        <Stack.Screen name="events" options={{ presentation: "card" }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  incomingCallToast: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 12,
    gap: 12,
  },
  callIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  callDetails: {
    flex: 1,
    gap: 2,
  },
  callerName: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  callTypeLabel: {
    fontSize: 12,
  },
  callActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  callActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
