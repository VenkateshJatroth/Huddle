import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  downloadAndApplyUpdate,
  subscribeToUpdateState,
  type UpdateState,
} from "../lib/updates";
import { useAppColors } from "../theme/colors";

export function UpdateNotificationBanner() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();

  const [state, setState] = useState<UpdateState>({
    isChecking: false,
    isDownloading: false,
    updateAvailable: false,
    error: null,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return subscribeToUpdateState((next) => {
      setState(next);
      if (next.updateAvailable) {
        setDismissed(false);
      }
    });
  }, []);

  if (dismissed || (!state.updateAvailable && !state.isDownloading)) {
    return null;
  }

  return (
    <View
      style={[
        styles.banner,
        {
          paddingTop: Math.max(insets.top, 10),
          backgroundColor: colors.accent,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.contentRow}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>
            {state.isDownloading ? "Updating Huddle…" : "New version available"}
          </Text>
          <Text style={styles.subtitle}>
            {state.isDownloading
              ? "Downloading changes and restarting…"
              : "Tap update to refresh with the latest features."}
          </Text>
        </View>

        {state.isDownloading ? (
          <ActivityIndicator color="#FFFFFF" size="small" style={styles.loader} />
        ) : (
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                void downloadAndApplyUpdate();
              }}
              style={styles.updateButton}
              accessibilityRole="button"
              accessibilityLabel="Update Huddle now"
            >
              <Text style={styles.updateButtonText}>Update</Text>
            </Pressable>
            <Pressable
              onPress={() => setDismissed(true)}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Dismiss update notification"
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    zIndex: 9999,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  subtitle: {
    color: "#E5E5EA",
    fontSize: 11,
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  updateButton: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  updateButtonText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "700",
  },
  closeButton: {
    padding: 6,
  },
  closeText: {
    color: "#FFFFFF",
    fontSize: 14,
    opacity: 0.8,
  },
  loader: {
    paddingHorizontal: 8,
  },
});

