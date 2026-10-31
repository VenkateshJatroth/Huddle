import { supabase } from "./supabase";
import { uploadProfileImage } from "./gormati-profiles";
import { samplePosts, type CommunityPost } from "../data/mockData";

export type PostAudience = "Everyone" | "Connections" | "Only me";

export type PostDraft = {
  authorId: string;
  authorName: string;
  username: string;
  text: string;
  audience: PostAudience;
  localImageUri?: string | null;
  location?: string;
};

export type PublishedPost = CommunityPost & {
  author_id?: string;
  audience?: PostAudience;
  image_url?: string | null;
  created_at: string;
};

const POSTS_STORAGE_KEY = "gormati_local_posts";
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

function saveLocalPost(post: PublishedPost): void {
  try {
    const current = getLocalStoredPosts();
    const updated = [post, ...current.filter((p) => p.id !== post.id)];
    globalThis.localStorage?.setItem(POSTS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage quota or parsing error
  }
}

/**
 * Creates and publishes a new community post.
 * Attaches photos to Supabase Storage if an image URI is provided.
 */
export async function createPost(draft: PostDraft): Promise<PublishedPost> {
  const postId = `post_${Date.now()}`;
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
    image_url: remoteImageUrl,
    created_at: nowIso,
  };

  // 2. Persist locally first for immediate responsiveness
  saveLocalPost(publishedPost);

  // 3. Attempt to save to Supabase posts table
  try {
    await (supabase as any).from("posts").insert({
      id: postId,
      author_id: draft.authorId,
      author_name: draft.authorName,
      username: draft.username,
      text: draft.text.trim(),
      audience: draft.audience,
      image_url: remoteImageUrl,
      created_at: nowIso,
    });
  } catch {
    // Table may not be provisioned yet; local copy already stored
  }

  notifyPostListeners();
  return publishedPost;
}

/**
 * Fetches community feed posts, merging newly published posts with default community posts.
 */
export async function fetchFeedPosts(
  filter: "For you" | "Following" = "For you",
  currentUserId?: string,
): Promise<PublishedPost[]> {
  const localPosts = getLocalStoredPosts();
  let remotePosts: PublishedPost[] = [];

  try {
    const { data } = await (supabase as any)
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (data && Array.isArray(data)) {
      remotePosts = data.map((row: any) => ({
        id: row.id,
        author_id: row.author_id,
        author: row.author_name || "Gormati Member",
        username: row.username || "member",
        tone: 0,
        time: formatTimeAgo(row.created_at),
        location: row.location || "Community",
        language: "English",
        text: row.text,
        likes: row.likes_count ?? 0,
        replies: row.replies_count ?? 0,
        audience: row.audience,
        image_url: row.image_url,
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
    postMap.set(p.id, { ...p, time: formatTimeAgo(p.created_at) });
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

  // Convert sample posts to PublishedPost format
  const formattedSamplePosts: PublishedPost[] = samplePosts.map((sp) => ({
    ...sp,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    audience: "Everyone",
  }));

  if (filter === "Following") {
    // Filter to posts with audience Connections or user's own
    return customPosts
      .concat(formattedSamplePosts)
      .filter((p) => p.id === "post-bengaluru-cycling" || p.audience === "Connections" || p.author_id === currentUserId);
  }

  // "For you" feed shows custom user posts first, followed by sample posts
  return [...customPosts, ...formattedSamplePosts];
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
        author: row.author_name || "Gormati Member",
        username: row.username || "member",
        tone: 0,
        time: formatTimeAgo(row.created_at),
        location: row.location || "Community",
        language: "English",
        text: row.text,
        likes: row.likes_count ?? 0,
        replies: row.replies_count ?? 0,
        audience: row.audience,
        image_url: row.image_url,
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
