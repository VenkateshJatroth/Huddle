import { supabase } from "./supabase";
import { uploadProfileImage } from "./gormati-profiles";
import { recordUserStreak } from "./streaks";
import type { CommunityPost } from "../data/mockData";

export type PostAudience = "Everyone" | "Connections" | "Only me";

export type CommunityChannel =
  | "General"
  | "Tech & Systems"
  | "Hyderabad"
  | "Dubai"
  | "Fitness"
  | "Philosophy";

export const COMMUNITY_CHANNELS: CommunityChannel[] = [
  "General",
  "Tech & Systems",
  "Hyderabad",
  "Dubai",
  "Fitness",
  "Philosophy",
];

export type PostDraft = {
  authorId: string;
  authorName: string;
  username: string;
  text: string;
  audience: PostAudience;
  channel?: CommunityChannel;
  localImageUri?: string | null;
  localAudioUri?: string | null;
  audioDuration?: number | null;
  pollQuestion?: string | null;
  pollOptions?: string[] | null;
  location?: string;
  isAnonymous?: boolean | null;
  anonymousAlias?: string | null;
};

export type PublishedPost = CommunityPost & {
  author_id?: string;
  audience?: PostAudience;
  channel?: CommunityChannel;
  image_url?: string | null;
  audio_url?: string | null;
  audio_duration?: number | null;
  poll_question?: string | null;
  poll_options?: string[] | null;
  is_anonymous?: boolean | null;
  anonymous_alias?: string | null;
  created_at: string;
};

export type PostReply = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  username: string;
  text: string;
  created_at: string;
  time?: string;
};

const POSTS_STORAGE_KEY = "gormati_local_posts_v2";
const REPLIES_STORAGE_KEY = "gormati_local_replies_v2";
const postListeners: Set<() => void> = new Set();

export function subscribeToPosts(listener: () => void): () => void {
  postListeners.add(listener);
  return () => {
    postListeners.delete(listener);
  };
}

function notifyPostListeners() {
  postListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Listener error guard
    }
  });
}

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatTimeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getLocalStoredPosts(): PublishedPost[] {
  try {
    const raw = globalThis.localStorage?.getItem(POSTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalPosts(posts: PublishedPost[]): void {
  try {
    globalThis.localStorage?.setItem(POSTS_STORAGE_KEY, JSON.stringify(posts));
  } catch {
    // Storage quota guard
  }
}

function getLocalStoredReplies(): Record<string, PostReply[]> {
  try {
    const raw = globalThis.localStorage?.getItem(REPLIES_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLocalReplies(repliesMap: Record<string, PostReply[]>): void {
  try {
    globalThis.localStorage?.setItem(REPLIES_STORAGE_KEY, JSON.stringify(repliesMap));
  } catch {
    // Storage guard
  }
}

/**
 * Creates and publishes a new community post.
 * Attaches photos to Supabase Storage if an image URI is provided.
 */
export async function createPost(draft: PostDraft): Promise<PublishedPost> {
  const postId = generateUUID();
  let remoteImageUrl: string | null = null;

  // 1. Upload photo to Supabase storage if provided
  if (draft.localImageUri) {
    try {
      remoteImageUrl = await uploadProfileImage(draft.authorId, draft.localImageUri, "gallery");
    } catch {
      // If storage upload fails (e.g. offline preview), retain local URI for display
      remoteImageUrl = draft.localImageUri;
    }
  }

  const nowIso = new Date().toISOString();

  const publishedPost: PublishedPost = {
    id: postId,
    author_id: draft.authorId,
    author: draft.authorName,
    username: draft.username,
    tone: 0,
    time: "Just now",
    location: draft.location || "Community",
    language: "English",
    text: draft.text.trim(),
    likes: 0,
    replies: 0,
    audience: draft.audience,
    channel: draft.channel || "General",
    image_url: remoteImageUrl,
    audio_url: draft.localAudioUri || null,
    audio_duration: draft.audioDuration || null,
    poll_question: draft.pollQuestion || null,
    poll_options: draft.pollOptions || null,
    is_anonymous: Boolean(draft.isAnonymous),
    anonymous_alias: draft.anonymousAlias || null,
    created_at: nowIso,
  };

  // 2. Persist locally first for immediate responsiveness
  const current = getLocalStoredPosts();
  saveLocalPosts([publishedPost, ...current.filter((p) => p.id !== postId)]);

  // 3. Save to Supabase posts table
  try {
    await (supabase as any).from("posts").insert({
      id: postId,
      author_id: draft.authorId,
      author_name: draft.authorName,
      username: draft.username,
      text: draft.text.trim(),
      audience: draft.audience,
      channel: draft.channel || "General",
      image_url: remoteImageUrl,
      audio_url: draft.localAudioUri || null,
      audio_duration: draft.audioDuration || null,
      poll_question: draft.pollQuestion || null,
      poll_options: draft.pollOptions || null,
      is_anonymous: Boolean(draft.isAnonymous),
      anonymous_alias: draft.anonymousAlias || null,
      created_at: nowIso,
    });
  } catch {
    // Remote insert error caught gracefully; post remains in local cache
  }

  // 4. Update user's consecutive day streak & activity count
  void recordUserStreak(draft.authorId);

  notifyPostListeners();
  return publishedPost;
}

/**
 * Updates an existing post's text and/or audience.
 */
export async function editPost(
  postId: string,
  newText: string,
  newAudience?: PostAudience,
): Promise<boolean> {
  const current = getLocalStoredPosts();
  const existing = current.find((p) => p.id === postId);

  if (existing) {
    existing.text = newText.trim();
    if (newAudience) existing.audience = newAudience;
    saveLocalPosts(current);
    notifyPostListeners();
  }

  try {
    const updatePayload: Record<string, unknown> = {
      text: newText.trim(),
      updated_at: new Date().toISOString(),
    };
    if (newAudience) updatePayload.audience = newAudience;

    await (supabase as any)
      .from("posts")
      .update(updatePayload)
      .eq("id", postId);
    return true;
  } catch {
    return true;
  }
}

/**
 * Deletes a post locally and from Supabase.
 */
export async function deletePost(postId: string): Promise<boolean> {
  const current = getLocalStoredPosts();
  saveLocalPosts(current.filter((p) => p.id !== postId));

  // Clean replies
  const replies = getLocalStoredReplies();
  delete replies[postId];
  saveLocalReplies(replies);

  notifyPostListeners();

  try {
    await (supabase as any).from("posts").delete().eq("id", postId);
    return true;
  } catch {
    return true;
  }
}

/**
 * Fetches replies for a given post.
 */
export async function fetchPostReplies(postId: string): Promise<PostReply[]> {
  const localMap = getLocalStoredReplies();
  const localReplies = localMap[postId] || [];

  try {
    const { data } = await (supabase as any)
      .from("post_replies")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (data && Array.isArray(data) && data.length > 0) {
      const remoteReplies: PostReply[] = data.map((r: any) => ({
        id: r.id,
        post_id: r.post_id,
        author_id: r.author_id,
        author_name: r.author_name || "Huddle Member",
        username: r.username || "member",
        text: r.text,
        created_at: r.created_at,
        time: formatTimeAgo(r.created_at),
      }));

      // Merge and deduplicate
      const map = new Map<string, PostReply>();
      localReplies.forEach((r) => map.set(r.id, r));
      remoteReplies.forEach((r) => map.set(r.id, r));
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
  } catch {
    // Return local
  }

  return localReplies.map((r) => ({ ...r, time: formatTimeAgo(r.created_at) }));
}

/**
 * Adds a reply to a post.
 */
export async function createPostReply(
  postId: string,
  text: string,
  user: { id: string; name: string; username: string },
): Promise<PostReply> {
  const replyId = generateUUID();
  const nowIso = new Date().toISOString();

  const newReply: PostReply = {
    id: replyId,
    post_id: postId,
    author_id: user.id,
    author_name: user.name,
    username: user.username,
    text: text.trim(),
    created_at: nowIso,
    time: "Just now",
  };

  // 1. Save locally
  const localMap = getLocalStoredReplies();
  const existingReplies = localMap[postId] || [];
  localMap[postId] = [...existingReplies, newReply];
  saveLocalReplies(localMap);

  // Update post replies count locally
  const posts = getLocalStoredPosts();
  const targetPost = posts.find((p) => p.id === postId);
  if (targetPost) {
    targetPost.replies = (targetPost.replies || 0) + 1;
    saveLocalPosts(posts);
  }

  // 2. Persist to Supabase
  try {
    await (supabase as any).from("post_replies").insert({
      id: replyId,
      post_id: postId,
      author_id: user.id,
      author_name: user.name,
      username: user.username,
      text: text.trim(),
      created_at: nowIso,
    });

    if (targetPost) {
      await (supabase as any)
        .from("posts")
        .update({ replies_count: targetPost.replies })
        .eq("id", postId);
    }
  } catch {
    // Local copy maintained
  }

  notifyPostListeners();
  return newReply;
}

/**
 * Fetches community feed posts, merging newly published posts with default community posts.
 */
export async function fetchFeedPosts(
  filter: "For you" | "Following" = "For you",
  currentUserId?: string,
  channelFilter: CommunityChannel | "All" = "All",
): Promise<PublishedPost[]> {
  const localPosts = getLocalStoredPosts();
  let remotePosts: PublishedPost[] = [];

  try {
    const { data } = await (supabase as any)
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (data && Array.isArray(data)) {
      remotePosts = data.map((row: any) => ({
        id: row.id,
        author_id: row.author_id,
        author: row.author_name || "Huddle Member",
        username: row.username || "member",
        tone: 0,
        time: formatTimeAgo(row.created_at),
        location: row.location || "Community",
        language: "English",
        text: row.text,
        likes: row.likes_count ?? 0,
        replies: row.replies_count ?? 0,
        audience: row.audience,
        channel: row.channel || "General",
        image_url: row.image_url,
        audio_url: row.audio_url,
        audio_duration: row.audio_duration,
        poll_question: row.poll_question,
        poll_options: row.poll_options,
        is_anonymous: Boolean(row.is_anonymous),
        anonymous_alias: row.anonymous_alias,
        created_at: row.created_at,
      }));
    }
  } catch {
    // Supabase table not created yet; fallback to local
  }

  // Combine and deduplicate
  const postMap = new Map<string, PublishedPost>();

  // Add local posts
  localPosts.forEach((p) => {
    postMap.set(p.id, { ...p, channel: p.channel || "General", time: formatTimeAgo(p.created_at) });
  });

  // Add remote posts
  remotePosts.forEach((p) => {
    if (!postMap.has(p.id)) {
      postMap.set(p.id, p);
    }
  });

  const customPosts = Array.from(postMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  let merged: PublishedPost[] = customPosts;

  if (filter === "Following") {
    merged = merged.filter(
      (p) => p.audience === "Connections" || p.author_id === currentUserId,
    );
  }

  if (channelFilter && channelFilter !== "All") {
    merged = merged.filter((p) => p.channel === channelFilter);
  }

  return merged;
}

/**
 * Fetches all posts authored by a specific user.
 */
export async function fetchUserPosts(userId: string): Promise<PublishedPost[]> {
  const local = getLocalStoredPosts().filter((p) => p.author_id === userId);

  try {
    const { data } = await (supabase as any)
      .from("posts")
      .select("*")
      .eq("author_id", userId)
      .order("created_at", { ascending: false });

    if (data && Array.isArray(data)) {
      const remote: PublishedPost[] = data.map((row: any) => ({
        id: row.id,
        author_id: row.author_id,
        author: row.author_name || "Huddle Member",
        username: row.username || "member",
        tone: 0,
        time: formatTimeAgo(row.created_at),
        location: row.location || "Community",
        language: "English",
        text: row.text,
        likes: row.likes_count ?? 0,
        replies: row.replies_count ?? 0,
        audience: row.audience,
        channel: row.channel || "General",
        image_url: row.image_url,
        audio_url: row.audio_url,
        audio_duration: row.audio_duration,
        poll_question: row.poll_question,
        poll_options: row.poll_options,
        is_anonymous: Boolean(row.is_anonymous),
        anonymous_alias: row.anonymous_alias,
        created_at: row.created_at,
      }));

      const map = new Map<string, PublishedPost>();
      local.forEach((p) => map.set(p.id, p));
      remote.forEach((p) => map.set(p.id, p));
      return Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
  } catch {
    // Fallback to local
  }

  return local.map((p) => ({ ...p, time: formatTimeAgo(p.created_at) }));
}
