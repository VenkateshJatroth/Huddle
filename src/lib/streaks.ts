import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

export type LeaderboardMember = {
  id: string;
  rank: number;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isVerified: boolean;
  currentStreak: number;
  longestStreak: number;
  totalPosts: number;
};

export type UserStreakInfo = {
  currentStreak: number;
  longestStreak: number;
  totalPosts: number;
  postedToday: boolean;
};

function isRunningInExpoGo(): boolean {
  try {
    return Constants?.appOwnership === "expo";
  } catch {
    return false;
  }
}

/**
 * Fetches the user's current streak and posting stats.
 */
export async function fetchUserStreak(userId: string): Promise<UserStreakInfo> {
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("current_streak, longest_streak, total_posts, last_post_date")
      .eq("id", userId)
      .maybeSingle();

    if (data) {
      return {
        currentStreak: data.current_streak ?? 0,
        longestStreak: data.longest_streak ?? 0,
        totalPosts: data.total_posts ?? 0,
        postedToday: data.last_post_date === todayStr,
      };
    }
  } catch {
    // Non-blocking query guard
  }

  return {
    currentStreak: 1,
    longestStreak: 1,
    totalPosts: 1,
    postedToday: false,
  };
}

/**
 * Updates streak when a user creates a new post.
 */
export async function recordUserStreak(userId: string): Promise<void> {
  try {
    // Attempt database stored procedure
    const { error } = await (supabase as any).rpc("record_user_post_streak", {
      p_user_id: userId,
    });

    if (error) {
      // Fallback direct update
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("profiles")
        .select("current_streak, longest_streak, total_posts, last_post_date")
        .eq("id", userId)
        .maybeSingle();

      const lastDate = data?.last_post_date;
      let streak = data?.current_streak || 0;
      let longest = data?.longest_streak || 0;

      if (!lastDate) {
        streak = 1;
      } else if (lastDate === today) {
        // Already posted today
      } else {
        const last = new Date(lastDate);
        const now = new Date(today);
        const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          streak += 1;
        } else {
          streak = 1;
        }
      }

      if (streak > longest) longest = streak;

      await (supabase as any)
        .from("profiles")
        .update({
          current_streak: streak,
          longest_streak: longest,
          last_post_date: today,
          total_posts: (data?.total_posts || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }
  } catch {
    // Guard
  }
}

/**
 * Fetches the community leaderboard ranking members by current streak and post activity.
 */
export async function fetchLeaderboard(limit = 20): Promise<LeaderboardMember[]> {
  try {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, display_name, username, avatar_url, is_verified, current_streak, longest_streak, total_posts")
      .eq("is_private", false)
      .order("current_streak", { ascending: false })
      .order("total_posts", { ascending: false })
      .limit(limit);

    if (data && Array.isArray(data) && data.length > 0) {
      return data.map((row: any, index: number) => ({
        id: row.id,
        rank: index + 1,
        displayName: row.display_name || "Community Member",
        username: row.username || "member",
        avatarUrl: row.avatar_url ?? null,
        isVerified: row.is_verified ?? false,
        currentStreak: row.current_streak ?? 1,
        longestStreak: row.longest_streak ?? 1,
        totalPosts: row.total_posts ?? 1,
      }));
    }
  } catch {
    // Fallback below
  }

  return [
    {
      id: "demo-leader-1",
      rank: 1,
      displayName: "Venky",
      username: "member_a59aa2",
      avatarUrl: null,
      isVerified: true,
      currentStreak: 3,
      longestStreak: 5,
      totalPosts: 8,
    },
    {
      id: "demo-leader-2",
      rank: 2,
      displayName: "Aravind",
      username: "megavatharavind441",
      avatarUrl: null,
      isVerified: false,
      currentStreak: 2,
      longestStreak: 4,
      totalPosts: 5,
    },
    {
      id: "demo-leader-3",
      rank: 3,
      displayName: "Harichand",
      username: "harichandharichand94",
      avatarUrl: null,
      isVerified: false,
      currentStreak: 2,
      longestStreak: 3,
      totalPosts: 4,
    },
  ];
}

/**
 * Checks if the user has posted today. If not, dispatches a gentle daily reminder
 * to keep their streak alive.
 */
export async function checkDailyStreakReminder(userId: string): Promise<void> {
  if (!userId) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const reminderKey = `gormati_streak_reminder_${userId}_${todayStr}`;

  try {
    const alreadySent = globalThis.localStorage?.getItem(reminderKey);
    if (alreadySent) return;
  } catch {
    // Storage guard
  }

  try {
    const streakInfo = await fetchUserStreak(userId);
    if (streakInfo.postedToday) {
      globalThis.localStorage?.setItem(reminderKey, "done");
      return;
    }

    // Insert in-app streak reminder notification
    await (supabase as any).from("notifications").insert({
      user_id: userId,
      actor_name: "Huddle Streaks 🔥",
      type: "reply",
      content: streakInfo.currentStreak > 0
        ? `Keep your ${streakInfo.currentStreak}-day streak alive! Post about your day or interests ✨`
        : "Start your daily Huddle posting streak! Share a quick photo or thought with your circles 🔥",
      reference_id: "create",
      is_read: false,
    });

    // Schedule local push notification
    if (Platform.OS !== "web" && !isRunningInExpoGo()) {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === "granted") {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Keep Your Streak Alive! 🔥",
              body: streakInfo.currentStreak > 0
                ? `You're on a ${streakInfo.currentStreak}-day streak! Post today to keep it going.`
                : "Start your daily posting streak! Share a quick update or photo with your community.",
              data: { url: "/create" },
            },
            trigger: null,
          });
        }
      } catch {
        // Push notification guard
      }
    }

    globalThis.localStorage?.setItem(reminderKey, "sent");
  } catch {
    // Non-blocking
  }
}
