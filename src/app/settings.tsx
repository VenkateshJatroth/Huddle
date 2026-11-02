import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Icon";
import { AppButton, Card, SectionHeading } from "../components/ui";
import { deleteUserAccount, loadBlockedUserIds, subscribeToBlockedUsers } from "../lib/safety";
import { supabase } from "../lib/supabase";
import { checkForAppUpdates } from "../lib/updates";
import { useAppColors } from "../theme/colors";

type NotificationSettings = {
  pushEnabled: boolean;
  matches: boolean;
  messages: boolean;
  updates: boolean;
};

const SETTINGS_STORAGE_KEY = "gormati_settings_notifications";

export default function SettingsScreen() {
  const colors = useAppColors();
  const { user } = useAuth();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);

  const [notifications, setNotifications] = useState<NotificationSettings>(() => {
    try {
      const saved = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return {
      pushEnabled: true,
      matches: true,
      messages: true,
      updates: true,
    };
  });

  // Load saved preferences
  useEffect(() => {
    if (user?.id) {
      void loadBlockedUserIds(user.id);
    }
    return subscribeToBlockedUsers((ids) => {
      setBlockedCount(ids.length);
    });
  }, [user?.id]);

  const updateNotification = (key: keyof NotificationSettings, value: boolean) => {
    const updated = { ...notifications, [key]: value };
    setNotifications(updated);
    try {
      globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Persistence error fallback
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/(auth)" as never);
    } catch (err: unknown) {
      Alert.alert("Sign Out Error", err instanceof Error ? err.message : "Failed to sign out.");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleDeleteAccount = () => {
    if (!user) return;
    Alert.alert(
      "Delete Account Permanently?",
      "Are you sure you want to permanently delete your Gormati account? All your profile information, photos, matches, prompts, and message history will be immediately deleted. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete My Account",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const res = await deleteUserAccount(user.id);
              if (res.success) {
                Alert.alert(
                  "Account Deleted",
                  "Your Gormati account and all associated data have been permanently removed.",
                  [{ text: "OK", onPress: () => router.replace("/(auth)" as never) }],
                );
              } else {
                Alert.alert("Deletion Failed", res.error ?? "Failed to delete account. Please try again.");
              }
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Navigation Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Icon name="chevronRight" color={colors.text} size={20} />
          <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Account Details */}
        <View style={styles.section}>
          <SectionHeading title="Personal Account Details" />
          <Card style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.secondary }]}>Email</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{user?.email ?? "Not available"}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.secondary }]}>Account ID</Text>
              <Text numberOfLines={1} style={[styles.infoValue, { color: colors.text, maxWidth: 200 }]}>
                {user?.id ?? "—"}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.buttonRow}>
              <AppButton
                label={isSigningOut ? "Signing out…" : "Sign out"}
                variant="outline"
                disabled={isSigningOut || isDeleting}
                onPress={() => { void handleSignOut(); }}
              />
              <AppButton
                label={isDeleting ? "Deleting…" : "Delete account"}
                variant="subtle"
                disabled={isSigningOut || isDeleting}
                onPress={handleDeleteAccount}
              />
            </View>
          </Card>
        </View>

        {/* 2. Notification Preferences */}
        <View style={styles.section}>
          <SectionHeading title="Notification Preferences" />
          <Card style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabelBlock}>
                <Text style={[styles.switchTitle, { color: colors.text }]}>Push Notifications</Text>
                <Text style={[styles.switchSubtitle, { color: colors.secondary }]}>
                  Receive real-time alerts on this device
                </Text>
              </View>
              <Switch
                value={notifications.pushEnabled}
                onValueChange={(val) => updateNotification("pushEnabled", val)}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.switchRow}>
              <View style={styles.switchLabelBlock}>
                <Text style={[styles.switchTitle, { color: colors.text }]}>New Matches & Connections</Text>
                <Text style={[styles.switchSubtitle, { color: colors.secondary }]}>
                  When someone connects with you or accepts a request
                </Text>
              </View>
              <Switch
                value={notifications.matches}
                onValueChange={(val) => updateNotification("matches", val)}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.switchRow}>
              <View style={styles.switchLabelBlock}>
                <Text style={[styles.switchTitle, { color: colors.text }]}>Direct Chat Messages</Text>
                <Text style={[styles.switchSubtitle, { color: colors.secondary }]}>
                  When a match sends you a new message
                </Text>
              </View>
              <Switch
                value={notifications.messages}
                onValueChange={(val) => updateNotification("messages", val)}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.switchRow}>
              <View style={styles.switchLabelBlock}>
                <Text style={[styles.switchTitle, { color: colors.text }]}>Community & App Updates</Text>
                <Text style={[styles.switchSubtitle, { color: colors.secondary }]}>
                  Announcements, new features, and version updates
                </Text>
              </View>
              <Switch
                value={notifications.updates}
                onValueChange={(val) => updateNotification("updates", val)}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
          </Card>
        </View>

        {/* 3. App Theme & Appearance */}
        <View style={styles.section}>
          <SectionHeading title="App Theme & Appearance" />
          <Card style={styles.card}>
            <View style={styles.infoRow}>
              <View>
                <Text style={[styles.switchTitle, { color: colors.text }]}>Monochromatic Dark Aesthetic</Text>
                <Text style={[styles.switchSubtitle, { color: colors.secondary }]}>
                  High-contrast pure black (#000000) and crisp white typography
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={styles.badgeText}>Active</Text>
              </View>
            </View>
          </Card>
        </View>

        {/* 4. Activity History */}
        <View style={styles.section}>
          <SectionHeading title="Activity & History" />
          <Card style={styles.card}>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.text }]}>Active</Text>
                <Text style={[styles.statLabel, { color: colors.secondary }]}>Account Status</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.text }]}>{blockedCount}</Text>
                <Text style={[styles.statLabel, { color: colors.secondary }]}>Blocked Users</Text>
              </View>
            </View>
          </Card>
        </View>

        {/* 5. Privacy & Community Safety */}
        <View style={styles.section}>
          <SectionHeading title="Privacy & Safety" />
          <Card style={styles.card}>
            <Pressable
              style={styles.clickableRow}
              onPress={() => {
                Alert.alert(
                  "Community Safety Guidelines",
                  "GorMati is a respectful space for real connections. Harassment, hate speech, inappropriate media, and impersonation are strictly prohibited.",
                );
              }}
            >
              <Text style={[styles.clickableText, { color: colors.text }]}>Community Guidelines</Text>
              <Icon name="chevronRight" color={colors.secondary} size={16} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Pressable
              style={styles.clickableRow}
              onPress={() => {
                Alert.alert(
                  "Privacy Policy",
                  "GorMati respects your privacy. Your personal email and phone are never shared publicly without your explicit consent.",
                );
              }}
            >
              <Text style={[styles.clickableText, { color: colors.text }]}>Privacy Policy</Text>
              <Icon name="chevronRight" color={colors.secondary} size={16} />
            </Pressable>
          </Card>
        </View>

        {/* 6. Version & Updates */}
        <View style={styles.section}>
          <SectionHeading title="App Version & Updates" />
          <Card style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.secondary }]}>Version</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>1.2.4 (Build 8)</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <AppButton
              label="Check for App Updates"
              variant="outline"
              icon="sparkles"
              onPress={() => {
                void checkForAppUpdates({ force: true, showNoUpdateAlert: true, promptUser: true });
              }}
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  backButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingRight: 8 },
  backText: { fontSize: 14, fontWeight: "600" },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  headerRightPlaceholder: { width: 50 },
  scrollContent: { padding: 16, gap: 20 },
  section: { gap: 8 },
  card: { padding: 16, gap: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { fontSize: 14, fontWeight: "500" },
  infoValue: { fontSize: 14, fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth, width: "100%" },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  switchLabelBlock: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 14, fontWeight: "700" },
  switchSubtitle: { fontSize: 12, lineHeight: 17 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  statsGrid: { flexDirection: "row", gap: 12 },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 8, gap: 4 },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 12 },
  clickableRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  clickableText: { fontSize: 14, fontWeight: "600" },
});
