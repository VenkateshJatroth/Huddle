import { Alert, AppState, Platform } from "react-native";
import type { AppStateStatus } from "react-native";
import * as Updates from "expo-updates";

export type UpdateState = {
  isChecking: boolean;
  isDownloading: boolean;
  updateAvailable: boolean;
  error: string | null;
};

// Listeners for in-app UI banners or custom modals
const listeners = new Set<(state: UpdateState) => void>();
let currentState: UpdateState = {
  isChecking: false,
  isDownloading: false,
  updateAvailable: false,
  error: null,
};

function updateState(partial: Partial<UpdateState>) {
  currentState = { ...currentState, ...partial };
  listeners.forEach((listener) => listener(currentState));
}

/**
 * Returns true if OTA updates via expo-updates are supported in the current runtime.
 * Disabled in __DEV__, on Web, and inside Expo Go.
 */
export function isUpdatesEnabled(): boolean {
  if (__DEV__ || Platform.OS === "web") {
    return false;
  }
  return Updates.isEnabled;
}

/**
 * Downloads and immediately reloads the app with the new bundle.
 */
export async function downloadAndApplyUpdate(): Promise<boolean> {
  if (!isUpdatesEnabled()) {
    return false;
  }

  updateState({ isDownloading: true, error: null });

  try {
    const fetchResult = await Updates.fetchUpdateAsync();
    if (fetchResult.isNew) {
      updateState({ isDownloading: false, updateAvailable: false });
      // Reload using the new bundle
      await Updates.reloadAsync();
      return true;
    } else {
      updateState({ isDownloading: false });
      return false;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to download update.";
    console.warn("[Updates] Error downloading update:", message);
    updateState({ isDownloading: false, error: message });
    Alert.alert(
      "Update Failed",
      "We encountered an issue downloading the latest update. The app will continue running normally.",
    );
    return false;
  }
}

/**
 * Prompt the user with a confirmation dialog to apply the update now.
 */
export function promptUserForUpdate() {
  Alert.alert(
    "Update Available",
    "A new version of Huddle is available! Would you like to update now?",
    [
      {
        text: "Later",
        style: "cancel",
      },
      {
        text: "Update Now",
        onPress: () => {
          void downloadAndApplyUpdate();
        },
      },
    ],
    { cancelable: true },
  );
}

// Track timestamp of last check to avoid spamming Expo update servers
let lastCheckTimestamp = 0;
const MIN_CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Check the EAS update server for new releases.
 * @param options.promptUser If true and an update is found, presents the confirmation prompt. Default: true.
 * @param options.force If true, bypasses the 3-minute throttle check. Default: false.
 * @param options.showNoUpdateAlert If true, shows an alert if the app is already up-to-date.
 */
export async function checkForAppUpdates(options?: {
  promptUser?: boolean;
  force?: boolean;
  showNoUpdateAlert?: boolean;
}): Promise<boolean> {
  const { promptUser = true, force = false, showNoUpdateAlert = false } = options ?? {};

  if (!isUpdatesEnabled()) {
    console.log("[Updates] Updates are disabled in this environment (development or Expo Go).");
    if (showNoUpdateAlert) {
      Alert.alert("Up to Date", "Huddle is running in development mode.");
    }
    return false;
  }

  const now = Date.now();
  if (!force && now - lastCheckTimestamp < MIN_CHECK_INTERVAL_MS) {
    return false;
  }
  lastCheckTimestamp = now;

  updateState({ isChecking: true, error: null });

  try {
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      updateState({ isChecking: false, updateAvailable: true });
      if (promptUser) {
        promptUserForUpdate();
      }
      return true;
    } else {
      updateState({ isChecking: false, updateAvailable: false });
      if (showNoUpdateAlert) {
        Alert.alert("Up to Date", "Huddle is currently on the latest version.");
      }
      return false;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error checking for updates.";
    console.warn("[Updates] Error checking for updates:", message);
    updateState({ isChecking: false, error: message });
    return false;
  }
}

/**
 * Subscribes a listener to update lifecycle changes.
 */
export function subscribeToUpdateState(listener: (state: UpdateState) => void): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Setup background and on-launch update checking.
 * Checks on initial invocation, and when app returns to foreground.
 */
export function setupUpdateLifecycle(): () => void {
  // Check once on launch
  void checkForAppUpdates({ promptUser: true });

  // Check when returning to foreground
  const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
    if (nextState === "active") {
      void checkForAppUpdates({ promptUser: true });
    }
  });

  return () => {
    subscription.remove();
  };
}

