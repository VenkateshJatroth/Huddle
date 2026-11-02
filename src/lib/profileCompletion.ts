import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { GormatiProfile } from "./gormati-profiles";
import { supabase } from "./supabase";

export type MissingProfileField = {
  id: "avatar" | "display_name" | "bio" | "location" | "interests" | "prompts_or_voice";
  label: string;
  shortLabel: string;
};

export type ProfileCompletionResult = {
  completionPercentage: number;
  isComplete: boolean;
  missingFields: MissingProfileField[];
  completedCount: number;
  totalCount: number;
};

function isRunningInExpoGo(): boolean {
  try {
    return (
      Constants.appOwnership === "expo" ||
      (Constants as { executionEnvironment?: string }).executionEnvironment === "storeClient"
    );
  } catch {
    return false;
  }
}

/**
 * Evaluates the completion state of a Gormati member profile.
 * Inspects avatar, display name, bio (10+ chars), city/location,
 * interests tags, and prompt answers or voice introduction.
 */
export function checkProfileCompletion(
  profile?: Partial<GormatiProfile> | null,
): ProfileCompletionResult {
  const missingFields: MissingProfileField[] = [];
  let completionPercentage = 0;
  let completedCount = 0;
  const totalCount = 6;

  // 1. Avatar / Photo (20%)
  const hasAvatar = Boolean(
    (profile?.avatar_url && profile.avatar_url.trim().length > 0) ||
      (Array.isArray(profile?.gallery_urls) && profile.gallery_urls.length > 0),
  );
  if (hasAvatar) {
    completionPercentage += 20;
    completedCount += 1;
  } else {
    missingFields.push({
      id: "avatar",
      label: "Upload a profile photo",
      shortLabel: "Photo",
    });
  }

  // 2. Display Name (15%)
  const displayName = profile?.display_name?.trim();
  const hasDisplayName = Boolean(
    displayName && displayName.length >= 2 && displayName.toLowerCase() !== "member",
  );
  if (hasDisplayName) {
    completionPercentage += 15;
    completedCount += 1;
  } else {
    missingFields.push({
      id: "display_name",
      label: "Set your display name",
      shortLabel: "Name",
    });
  }

  // 3. Bio - at least 10 characters (20%)
  const bio = profile?.bio?.trim();
  const hasBio = Boolean(bio && bio.length >= 10);
  if (hasBio) {
    completionPercentage += 20;
    completedCount += 1;
  } else {
    missingFields.push({
      id: "bio",
      label: "Add a bio (10+ characters)",
      shortLabel: "Bio",
    });
  }

  // 4. Location / City (15%)
  const location = profile?.location?.trim();
  const hasLocation = Boolean(location && location.length >= 2);
  if (hasLocation) {
    completionPercentage += 15;
    completedCount += 1;
  } else {
    missingFields.push({
      id: "location",
      label: "Set your city or location",
      shortLabel: "City",
    });
  }

  // 5. Interests / Tags (15%)
  const hasInterests = Boolean(Array.isArray(profile?.interests) && profile.interests.length >= 1);
  if (hasInterests) {
    completionPercentage += 15;
    completedCount += 1;
  } else {
    missingFields.push({
      id: "interests",
      label: "Select your interests",
      shortLabel: "Interests",
    });
  }

  // 6. Prompt Answer or Voice Introduction (15%)
  const hasPrompts = Boolean(
    Array.isArray(profile?.prompts) &&
      profile.prompts.some((p) => p && typeof p.answer === "string" && p.answer.trim().length > 0),
  );
  const hasVoice = Boolean(profile?.voice_intro_url && profile.voice_intro_url.trim().length > 0);
  if (hasPrompts || hasVoice) {
    completionPercentage += 15;
    completedCount += 1;
  } else {
    missingFields.push({
      id: "prompts_or_voice",
      label: "Answer a prompt or record voice intro",
      shortLabel: "Prompt / Voice",
    });
  }

  return {
    completionPercentage: Math.min(100, completionPercentage),
    isComplete: completionPercentage >= 100,
    missingFields,
    completedCount,
    totalCount,
  };
}

/**
 * Automated reminder for incomplete profiles.
 * Triggers at most once every 24 hours on app launch/session load.
 * Inserts an in-app notification in public.notifications and fires a local push notification.
 */
export async function checkAndTriggerProfileCompletionReminder(
  userId: string,
  profile?: Partial<GormatiProfile> | null,
): Promise<void> {
  if (!userId) return;

  const completion = checkProfileCompletion(profile);
  if (completion.isComplete) return;

  const storageKey = `gormati_last_completion_reminder_${userId}`;
  try {
    const lastReminder = globalThis.localStorage?.getItem(storageKey);
    if (lastReminder) {
      const elapsed = Date.now() - Number(lastReminder);
      // Throttle to once every 24 hours
      if (elapsed < 24 * 60 * 60 * 1000) {
        return;
      }
    }
  } catch {
    // Storage guard
  }

  try {
    const missingSummary = completion.missingFields
      .slice(0, 2)
      .map((f) => f.shortLabel.toLowerCase())
      .join(" and ");

    // 1. In-app notification
    await (supabase as any).from("notifications").insert({
      user_id: userId,
      actor_name: "GorMati Team",
      type: "message",
      content: `Your profile is ${completion.completionPercentage}% complete! Add your ${missingSummary} so other members can discover and connect with you ✨`,
      reference_id: "profile",
      is_read: false,
    });

    // 2. Native push notification
    if (Platform.OS !== "web" && !isRunningInExpoGo()) {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === "granted") {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Complete Your GorMati Profile ✨",
              body: `Your profile is ${completion.completionPercentage}% complete! Add your ${missingSummary} to get discovered by the community.`,
              data: { url: "/(tabs)/profile" },
            },
            trigger: null,
          });
        }
      } catch {
        // Notification schedule guard
      }
    }

    globalThis.localStorage?.setItem(storageKey, String(Date.now()));
  } catch {
    // Non-blocking
  }
}
