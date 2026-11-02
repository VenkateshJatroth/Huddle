import { useEffect, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { fetchFullProfile } from "../../lib/gormati-profiles";
import { getProfileCompletion } from "../../lib/profileCompletion";
import { useAppColors } from "../../theme/colors";

export function AuthenticatedRouteGuard({ children }: PropsWithChildren) {
  const { isLoading, session, user } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [isCoreComplete, setIsCoreComplete] = useState<boolean | null>(null);

  useEffect(() => {
    let isCurrent = true;
    async function verify() {
      if (!user) {
        if (isCurrent) setCheckingProfile(false);
        return;
      }
      try {
        const profile = await fetchFullProfile(user.id);
        if (!isCurrent) return;
        const completion = getProfileCompletion(profile);
        setIsCoreComplete(completion.isCoreComplete);
      } catch {
        // Do not block on network failure
        if (isCurrent) setIsCoreComplete(true);
      } finally {
        if (isCurrent) setCheckingProfile(false);
      }
    }
    void verify();
    return () => {
      isCurrent = false;
    };
  }, [user]);

  if (isLoading || checkingProfile) return <AuthLoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;
  if (isCoreComplete === false) return <Redirect href={"/onboarding-profile" as never} />;
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
        Restoring your Huddle session…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  loadingText: { fontSize: 14 },
});
