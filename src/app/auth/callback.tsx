import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";
import { useAppColors } from "../../theme/colors";

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
    code?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>();
  const colors = useAppColors();
  const [statusMessage, setStatusMessage] = useState("Completing authentication…");

  useEffect(() => {
    let active = true;

    async function handleCallback() {
      try {
        const url = await Linking.getInitialURL();
        let accessToken = params.access_token;
        let refreshToken = params.refresh_token;
        let code = params.code;
        let authError = params.error || params.error_description;

        if (url) {
          const hashIdx = url.indexOf("#");
          if (hashIdx !== -1) {
            const hash = url.substring(hashIdx + 1);
            const hashParams = new URLSearchParams(hash);
            accessToken = accessToken || hashParams.get("access_token") || undefined;
            refreshToken = refreshToken || hashParams.get("refresh_token") || undefined;
            authError = authError || hashParams.get("error_description") || hashParams.get("error") || undefined;
          }

          const qIdx = url.indexOf("?");
          if (qIdx !== -1) {
            const query = url.substring(qIdx + 1).split("#")[0];
            const qParams = new URLSearchParams(query);
            code = code || qParams.get("code") || undefined;
            authError = authError || qParams.get("error_description") || qParams.get("error") || undefined;
          }
        }

        // If an OAuth error was returned (e.g. Google code exchange issue)
        if (authError) {
          if (!active) return;
          setStatusMessage("Redirecting to Google sign-in…");
          router.replace("/sign-in?oauth_fallback=true" as never);
          return;
        }

        // Handle direct access_token + refresh_token
        if (accessToken && refreshToken) {
          if (!active) return;
          setStatusMessage("Securing your session…");
          const { error } = await supabase.auth.setSession({
            access_token: decodeURIComponent(accessToken),
            refresh_token: decodeURIComponent(refreshToken),
          });

          if (!error && active) {
            router.replace("/(tabs)");
            return;
          }
        }

        // Handle OAuth authorization code exchange
        if (code) {
          if (!active) return;
          setStatusMessage("Verifying authorization code…");
          const { error } = await supabase.auth.exchangeCodeForSession(decodeURIComponent(code));
          if (!error && active) {
            router.replace("/(tabs)");
            return;
          }
        }

        // Check if session was already populated
        const { data: { session } } = await supabase.auth.getSession();
        if (session && active) {
          router.replace("/(tabs)");
          return;
        }

        // Fallback: redirect to sign-in with Google modal open
        if (active) {
          router.replace("/sign-in?oauth_fallback=true" as never);
        }
      } catch {
        if (active) {
          router.replace("/sign-in?oauth_fallback=true" as never);
        }
      }
    }

    void handleCallback();

    return () => {
      active = false;
    };
  }, [params]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.statusText, { color: colors.text }]}>{statusMessage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  statusText: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});

