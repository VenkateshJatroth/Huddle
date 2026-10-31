import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { useAppColors } from "../../theme/colors";

export function AuthenticatedRouteGuard({ children }: PropsWithChildren) {
  const { isLoading, session } = useAuth();

  if (isLoading) return <AuthLoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;
  return children;
}

export function GuestRouteGuard({ children }: PropsWithChildren) {
  const { isLoading, session } = useAuth();

  if (isLoading) return <AuthLoadingScreen />;
  if (session) return <Redirect href="/" />;
  return children;
}

function AuthLoadingScreen() {
  const colors = useAppColors();

  return (
    <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.accent} />
      <Text accessibilityLiveRegion="polite" style={[styles.loadingText, { color: colors.secondary }]}>
        Restoring your Gormati session…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  loadingText: { fontSize: 14 },
});
