import { supabase } from "./supabase";
import { isUserBlocked, subscribeToBlockedUsers } from "./safety";

/**
 * Service for managing private chat media attachments (voice notes, photos, videos)
 * with authenticated uploads, file validation, and short-lived signed URLs.
 */

const SIGNED_URL_CACHE = new Map<string, { signedUrl: string; expiresAt: number }>();
export const DEFAULT_EXPIRATION_SECONDS = 600; // 10 minutes (configurable 300 - 900s)
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// Automatically purge cached signed URLs whenever the blocked users list changes
subscribeToBlockedUsers((blockedIds) => {
  if (blockedIds.length === 0) return;
  const blockedSet = new Set(blockedIds);
  for (const [key] of SIGNED_URL_CACHE.entries()) {
    const ownerId = key.split("/")[0];
    if (ownerId && blockedSet.has(ownerId)) {
      SIGNED_URL_CACHE.delete(key);
    }
  }
});

/**
 * Explicitly evicts cached signed URLs from memory (e.g., when a user blocks another member).
 */
export function clearMediaUrlCache(targetUserId?: string): void {
  if (!targetUserId) {
    SIGNED_URL_CACHE.clear();
    return;
  }
  for (const [key] of SIGNED_URL_CACHE.entries()) {
    const ownerId = key.split("/")[0];
    if (ownerId === targetUserId) {
      SIGNED_URL_CACHE.delete(key);
    }
  }
}

export type ChatMediaType = "image" | "audio" | "video";

export type UploadChatMediaOptions = {
  userId: string;
  localUri: string;
  mediaType: ChatMediaType;
  mimeType?: string;
  fileName?: string;
};

/**
 * Validates and uploads a file to the private `chat_media` Supabase bucket.
 * Falls back safely to `gallery` if the private bucket is pending migration deployment.
 */
export async function uploadPrivateChatMedia({
  userId,
  localUri,
  mediaType,
  mimeType,
  fileName,
}: UploadChatMediaOptions): Promise<{ storagePath: string; resolvedUrl: string }> {
  try {
    const ext =
      mediaType === "audio"
        ? "m4a"
        : mediaType === "video"
          ? "mp4"
          : "jpg";

    const defaultMime =
      mediaType === "audio"
        ? "audio/m4a"
        : mediaType === "video"
          ? "video/mp4"
          : "image/jpeg";

    const finalMime = mimeType || defaultMime;
    const finalName = fileName || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${userId}/${finalName}`;

    // Read binary data safely
    const response = await fetch(localUri);
    const blob = await response.blob();

    if (blob.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size (${(blob.size / 1024 / 1024).toFixed(1)}MB) exceeds 50MB limit.`);
    }

    const arrayBuffer = await new Response(blob).arrayBuffer();

    // 1. Upload to private `chat_media` bucket strictly
    const uploadResult = await supabase.storage
      .from("chat_media")
      .upload(storagePath, arrayBuffer, {
        contentType: finalMime,
        upsert: true,
      });

    if (uploadResult.error) {
      console.warn("chat_media upload error:", uploadResult.error.message);
      throw new Error(
        `Private chat storage upload failed: ${uploadResult.error.message}. Verify that the private 'chat_media' bucket is deployed.`,
      );
    }

    // 2. Generate signed URL for the newly uploaded private file
    const { data: signedData, error: signError } = await supabase.storage
      .from("chat_media")
      .createSignedUrl(storagePath, DEFAULT_EXPIRATION_SECONDS);

    if (signError || !signedData?.signedUrl) {
      throw new Error("Failed to generate secure signed URL for private chat attachment.");
    }

    // Cache the signed URL
    SIGNED_URL_CACHE.set(storagePath, {
      signedUrl: signedData.signedUrl,
      expiresAt: Date.now() + (DEFAULT_EXPIRATION_SECONDS - 300) * 1000,
    });

    return {
      storagePath,
      resolvedUrl: signedData.signedUrl,
    };
  } catch (err: any) {
    console.warn("uploadPrivateChatMedia failed:", err?.message || err);
    throw err;
  }
}

/**
 * Resolves a stored media path or URL into a valid playback/viewing URL.
 * Automatically generates signed URLs for private `chat_media` paths.
 */
export async function resolveMediaUrl(pathOrUrl: string | null | undefined): Promise<string> {
  if (!pathOrUrl) return "";

  // 1. If it's already a local URI, data URI, or external HTTP URL that isn't private storage
  if (
    pathOrUrl.startsWith("file://") ||
    pathOrUrl.startsWith("content://") ||
    pathOrUrl.startsWith("data:") ||
    (pathOrUrl.startsWith("http") && !pathOrUrl.includes("/chat_media/"))
  ) {
    return pathOrUrl;
  }

  // 2. Extract relative storage path if an existing signed or direct URL was passed
  let relativePath = pathOrUrl;
  if (pathOrUrl.includes("/chat_media/")) {
    const parts = pathOrUrl.split("/chat_media/");
    if (parts[1]) {
      // Strip any existing query params (?token=...)
      relativePath = parts[1].split("?")[0];
    }
  }

  // 3. Authorization & Blocking pre-check:
  // If the owner of the media path is blocked, reject immediately and purge cache
  const ownerId = relativePath.split("/")[0];
  if (ownerId && isUserBlocked(ownerId)) {
    SIGNED_URL_CACHE.delete(relativePath);
    return "";
  }

  // 4. Check memory cache
  const cached = SIGNED_URL_CACHE.get(relativePath);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.signedUrl;
  }

  // 4. Request fresh signed URL from Supabase with current authorization check
  try {
    const { data, error } = await supabase.storage
      .from("chat_media")
      .createSignedUrl(relativePath, DEFAULT_EXPIRATION_SECONDS);

    if (error || !data?.signedUrl) {
      console.warn("Signed URL authorization failed:", error?.message);
      return "";
    }

    // Refresh cache 60 seconds before token expires
    SIGNED_URL_CACHE.set(relativePath, {
      signedUrl: data.signedUrl,
      expiresAt: Date.now() + (DEFAULT_EXPIRATION_SECONDS - 60) * 1000,
    });

    return data.signedUrl;
  } catch (err) {
    console.warn("resolveMediaUrl error:", err);
    return "";
  }
}

