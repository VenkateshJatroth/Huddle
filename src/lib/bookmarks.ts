import { supabase } from "./supabase";
import type { PublishedPost } from "./posts";

const localBookmarksCache = new Set<string>();

/**
 * Fetches the IDs of all posts bookmarked by the user.
 */
export async function fetchSavedPostIds(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const { data, error } = await (supabase as any)
      .from("saved_posts")
      .select("post_id")
      .eq("user_id", userId);

    if (error) throw error;
    const set = new Set<string>((data || []).map((row: any) => String(row.post_id)));
    set.forEach((id) => localBookmarksCache.add(id));
    return set;
  } catch {
    return new Set(localBookmarksCache);
  }
}

/**
 * Toggles bookmark status for a post.
 */
export async function toggleSavedPost(
  userId: string,
  postId: string,
  currentlySaved: boolean
): Promise<boolean> {
  if (!userId || !postId) return currentlySaved;

  const nextState = !currentlySaved;
  if (nextState) {
    localBookmarksCache.add(postId);
  } else {
    localBookmarksCache.delete(postId);
  }

  try {
    if (nextState) {
      await (supabase as any).from("saved_posts").upsert({
        user_id: userId,
        post_id: postId,
      });
    } else {
      await (supabase as any)
        .from("saved_posts")
        .delete()
        .eq("user_id", userId)
        .eq("post_id", postId);
    }
    return nextState;
  } catch {
    // Keep local cache optimistic
    return nextState;
  }
}

/**
 * Fetches full post details for all saved posts for a user.
 */
export async function fetchSavedPosts(userId: string): Promise<PublishedPost[]> {
  if (!userId) return [];
  try {
    const { data: savedRows, error } = await (supabase as any)
      .from("saved_posts")
      .select("post_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error || !savedRows || savedRows.length === 0) return [];

    const postIds = savedRows.map((r: any) => r.post_id);
    const { data: postsData, error: postsErr } = await (supabase as any)
      .from("posts")
      .select("*")
      .in("id", postIds);

    if (postsErr || !postsData) return [];

    // Map to PublishedPost format
    return postsData.map((p: any) => ({
      id: p.id,
      author: p.author_name || "Community Member",
      username: p.username || "member",
      time: new Date(p.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      text: p.text,
      likes: p.likes_count || 0,
      replies: p.replies_count || 0,
      channel: p.channel || "General",
      author_id: p.author_id,
      audience: p.audience,
      image_url: p.image_url,
      audio_url: p.audio_url,
      audio_duration: p.audio_duration,
      poll_question: p.poll_question,
      poll_options: p.poll_options,
      created_at: p.created_at,
    }));
  } catch {
    return [];
  }
}

