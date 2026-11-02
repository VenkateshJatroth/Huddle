import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { UpdateNotificationBanner } from "../components/UpdateNotificationBanner";
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
  const colors = useAppColors();
  const { user } = useAuth();

  // Set up listener for notification clicks to auto-route to chats or member profiles
  useNotificationObserver();

  // Check for OTA updates on startup and when returning to foreground
  useEffect(() => {
    return setupUpdateLifecycle();
  }, []);

  // Register push notifications & check engagement & streak reminders when user is authenticated
  useEffect(() => {
    if (user?.id) {
      registerForPushNotificationsAsync(user.id);
      void checkAndTriggerEngagementReminder(user.id);
      void checkDailyStreakReminder(user.id);
    }
  }, [user?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={colors.background === "#000000" ? "light" : "dark"} />
      <UpdateNotificationBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ presentation: "modal" }} />
        <Stack.Screen name="member/[id]" options={{ presentation: "card" }} />
        <Stack.Screen name="chat/[id]" options={{ presentation: "card" }} />
        <Stack.Screen name="settings" options={{ presentation: "card" }} />
        <Stack.Screen name="notifications" options={{ presentation: "card" }} />
        <Stack.Screen name="discover" options={{ presentation: "card" }} />
        <Stack.Screen name="leaderboard" options={{ presentation: "card" }} />
      </Stack>
    </View>
  );
}
