import { useEffect, useRef, useState } from "react";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { UpdateNotificationBanner } from "../components/UpdateNotificationBanner";
import { IncomingCallModal } from "../components/calling/IncomingCallModal";
import {
  logMissedCall,
  subscribeToIncomingCalls,
  updateCallStatus,
  type CallSession,
} from "../lib/calling";
import { startRingtone, stopRingtone } from "../lib/ringtone";
import { fetchFullProfile } from "../lib/gormati-profiles";
import {
  checkAndTriggerProfileCompletionReminder,
  getProfileCompletion,
} from "../lib/profileCompletion";
import {
  checkAndTriggerEngagementReminder,
  dismissIncomingCallNotification,
  presentIncomingCallNotification,
  registerForPushNotificationsAsync,
  useNotificationObserver,
} from "../lib/notifications";
import { checkDailyStreakReminder } from "../lib/streaks";
import { setupUpdateLifecycle } from "../lib/updates";
import { supabase } from "../lib/supabase";
import { markAllIncomingAsDelivered, markMessagesAsDelivered } from "../lib/gormati-chat";
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
  const colors = useAppColors();
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set up listener for notification clicks to auto-route to chats or member profiles
  useNotificationObserver();

  // Check for OTA updates on startup and when returning to foreground
  useEffect(() => {
    return setupUpdateLifecycle();
  }, []);

  // Listen for real-time incoming voice/video calls with VoIP ringtone & missed call timeout
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToIncomingCalls(
      user.id,
      (call) => {
        setIncomingCall(call);
        void startRingtone();
        void presentIncomingCallNotification({
          callId: call.id,
          callerId: call.caller_id,
          callerName: call.caller_name || "Huddle Member",
          callType: call.call_type,
        });

        // 35-second auto-timeout: if unanswered, log as missed call
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = setTimeout(() => {
          stopRingtone();
          void dismissIncomingCallNotification();
          void logMissedCall(call.id);
          setIncomingCall((curr) => (curr?.id === call.id ? null : curr));
        }, 35000);
      },
      (dismissedCallId) => {
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        stopRingtone();
        setIncomingCall((curr) => (curr?.id === dismissedCallId ? null : curr));
        void dismissIncomingCallNotification();
      },
    );
    return () => {
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      stopRingtone();
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

  // Acknowledge delivered status immediately when messages arrive or upon reconnect
  useEffect(() => {
    if (!user?.id) return;

    // 1. Acknowledge messages received while device was offline
    void markAllIncomingAsDelivered(user.id);

    // 2. Realtime listener for live incoming messages while app is in foreground
    const channel = supabase
      .channel(`delivery_receipts_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row?.sender_id) {
            void markMessagesAsDelivered(user.id, row.sender_id);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    stopRingtone();
    const callToAnswer = incomingCall;
    setIncomingCall(null);
    void dismissIncomingCallNotification();
    router.push({
      pathname: "/call/[id]",
      params: {
        id: callToAnswer.caller_id,
        callId: callToAnswer.id,
        type: callToAnswer.call_type,
        incoming: "true",
        channelId: callToAnswer.agora_channel || undefined,
        token: callToAnswer.agora_token || undefined,
      },
    } as never);
  };

  const handleDeclineCall = () => {
    if (!incomingCall) return;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    stopRingtone();
    void dismissIncomingCallNotification();
    void updateCallStatus(incomingCall.id, "declined");
    setIncomingCall(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={colors.background === "#121212" ? "light" : "dark"} />
      <UpdateNotificationBanner />

      {/* Full-Screen VoIP Incoming Call Screen with Ringtone & Pulsing Ring */}
      {incomingCall ? (
        <IncomingCallModal
          call={incomingCall}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
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
        <Stack.Screen name="calls" options={{ presentation: "card" }} />
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
