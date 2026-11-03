/**
 * Gormati-specific profile helpers.
 *
 * These functions extend the base profile layer with dating-app fields,
 * Supabase Storage uploads, and a Discover feed query.
 *
 * RPC names are kept as-is (indiana_* prefix) — they exist in the database.
 */

import type { Database } from "./database.types";
import { supabase } from "./supabase";
import { compressImage } from "../utils/imageCompression";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GormatiProfile = Database["public"]["Tables"]["profiles"]["Row"] & {
  voice_intro_url?: string | null;
  voice_duration_sec?: number | null;
};

/**
 * Fields the user can update on their own profile.
 * Mirrors the Database Update type but uses non-nullable defaults for the UI.
 */
export type GormatiProfileDraft = {
  display_name: string;
  username: string;
  bio: string;
  is_private: boolean;
  full_name: string;
  age: string; // stored as string in the form; parsed to number on save
  location: string;
  dating_intention: string;
  interests: string[];
  prompts: { question: string; answer: string }[];
  gallery_urls?: string[];
  voice_intro_url?: string | null;
  voice_duration_sec?: number | null;
};

/** Subset of profile data returned for discover/browse cards. */
export type DiscoverProfile = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  age: number | null;
  location: string | null;
  dating_intention: string | null;
  bio: string;
  interests: string[];
  is_verified: boolean;
  prompts?: { question: string; answer: string }[] | null;
};

// ---------------------------------------------------------------------------
// Discover feed
// ---------------------------------------------------------------------------

/**
 * Fetches public profiles (excluding the signed-in user and any already
 * followed/connected profiles) for the Discover feed.
 * Falls back gracefully: returns filtered demo data if no live profiles.
 */
export async function fetchDiscoverProfiles(
  currentUserId: string,
  limit = 20,
): Promise<DiscoverProfile[]> {
  const excludedIds = new Set<string>();
  excludedIds.add(currentUserId);

  // 1. Collect all followed, requested, or connected relationship IDs
  try {
    const { data: relationships } = await (supabase as any)
      .from("follow_relationships")
      .select("follower_id, following_id")
      .or(`follower_id.eq.${currentUserId},following_id.eq.${currentUserId}`);

    if (relationships && Array.isArray(relationships)) {
      relationships.forEach((r: any) => {
        if (r.follower_id === currentUserId && r.following_id) excludedIds.add(r.following_id);
        if (r.following_id === currentUserId && r.follower_id) excludedIds.add(r.follower_id);
      });
    }
  } catch {
    // Non-blocking query guard
  }

  // 2. Query live profiles from Supabase excluding current user
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, display_name, username, avatar_url, age, location, dating_intention, bio, interests, is_verified, prompts",
      )
      .eq("is_private", false)
      .neq("id", currentUserId)
      .limit(limit * 2);

    if (!error && data && data.length > 0) {
      const filtered = data
        .filter((row) => !excludedIds.has(row.id))
        .slice(0, limit)
        .map((row) => ({
          id: row.id,
          display_name: row.display_name,
          username: row.username,
          avatar_url: row.avatar_url ?? null,
          age: row.age ?? null,
          location: row.location ?? null,
          dating_intention: row.dating_intention ?? null,
          bio: row.bio ?? "",
          interests: Array.isArray(row.interests) ? (row.interests as string[]) : [],
          is_verified: row.is_verified ?? false,
          prompts: Array.isArray(row.prompts)
            ? (row.prompts as { question: string; answer: string }[])
            : null,
        }));

      if (filtered.length > 0) {
        return filtered;
      }
    }
  } catch {
    // Network / query failure returns empty array
  }

  return [];
}

// ---------------------------------------------------------------------------
// Like / Pass interactions
// ---------------------------------------------------------------------------

/**
 * Records a "like" interaction by following the profile via the existing RPC.
 * "Pass" is intentionally client-side only (no DB write needed for a skip).
 */
export async function recordLike(toId: string): Promise<void> {
  await supabase.rpc("indiana_follow_profile", { p_target_id: toId });
}

// ---------------------------------------------------------------------------
// Storage uploads
// ---------------------------------------------------------------------------

/**
 * Uploads a local file URI to Supabase Storage and returns the public URL.
 * Automatically resizes and compresses image on-device (800px for avatars, 1200px for gallery)
 * to 0.75 JPEG quality before upload.
 *
 * @param userId   - The authenticated user's ID (used as a path namespace).
 * @param localUri - Local file URI from expo-image-picker.
 * @param bucket   - "avatars" or "gallery".
 */
export async function uploadProfileImage(
  userId: string,
  localUri: string,
  bucket: "avatars" | "gallery",
): Promise<string> {
  const compressionType = bucket === "avatars" ? "avatar" : "feed";
  const { uri: compressedUri } = await compressImage(localUri, { type: compressionType });

  const fileName = `${userId}/${Date.now()}.jpg`;
  const mimeType = "image/jpeg";

  const response = await fetch(compressedUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, arrayBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// ---------------------------------------------------------------------------
// Profile update (extended fields)
// ---------------------------------------------------------------------------

/**
 * Saves all Gormati profile fields for the signed-in user.
 * Only columns present in the DB Update type are sent.
 */
export async function updateGormatiProfile(
  userId: string,
  draft: Partial<GormatiProfileDraft> & { avatar_url?: string | null },
): Promise<GormatiProfile> {
  const update: Database["public"]["Tables"]["profiles"]["Update"] = {};

  if (draft.display_name !== undefined) update.display_name = draft.display_name.trim();
  if (draft.username !== undefined) update.username = draft.username.trim().toLowerCase();
  if (draft.bio !== undefined) update.bio = draft.bio.trim();
  if (draft.is_private !== undefined) update.is_private = draft.is_private;
  if (draft.full_name !== undefined) update.full_name = draft.full_name.trim() || null;
  if (draft.age !== undefined) {
    const parsed = parseInt(String(draft.age), 10);
    update.age = Number.isNaN(parsed) ? null : parsed;
  }
  if (draft.location !== undefined) update.location = draft.location.trim() || null;
  if (draft.dating_intention !== undefined) update.dating_intention = draft.dating_intention || null;
  if (draft.interests !== undefined) update.interests = draft.interests;
  if (draft.prompts !== undefined) update.prompts = draft.prompts;
  if (draft.avatar_url !== undefined) update.avatar_url = draft.avatar_url;
  if (draft.gallery_urls !== undefined) update.gallery_urls = draft.gallery_urls;
  if (draft.voice_intro_url !== undefined) (update as any).voice_intro_url = draft.voice_intro_url;
  if (draft.voice_duration_sec !== undefined) (update as any).voice_duration_sec = draft.voice_duration_sec;

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Profile not found after update.");

  return data;
}

/**
 * Creates or updates a profile row for the signed-in user.
 * Useful during initial onboarding if the row was not backfilled.
 */
export async function upsertGormatiProfile(
  userId: string,
  draft: Partial<GormatiProfileDraft> & { avatar_url?: string | null },
): Promise<GormatiProfile> {
  const parsedAge = draft.age ? parseInt(String(draft.age), 10) : null;
  const username = draft.username ? draft.username.trim().toLowerCase() : `user_${userId.slice(0, 8)}`;
  const displayName = draft.display_name?.trim() || draft.full_name?.trim() || "Huddle Member";

  const payload: Database["public"]["Tables"]["profiles"]["Insert"] = {
    id: userId,
    username,
    display_name: displayName,
    bio: draft.bio?.trim() || "",
    is_private: draft.is_private ?? false,
    full_name: draft.full_name?.trim() || null,
    age: Number.isNaN(parsedAge) ? null : parsedAge,
    location: draft.location?.trim() || null,
    dating_intention: draft.dating_intention || null,
    interests: draft.interests || [],
    prompts: draft.prompts || [],
    avatar_url: draft.avatar_url || null,
    gallery_urls: draft.gallery_urls || [],
    is_verified: false,
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Profile not created or found after upsert.");

  return data;
}

// ---------------------------------------------------------------------------
// Fetch full own profile (extended fields)
// ---------------------------------------------------------------------------

export async function fetchFullProfile(userId: string): Promise<GormatiProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Fetch public member profile (with demo fallback)
// ---------------------------------------------------------------------------

export async function fetchMemberProfile(memberId: string): Promise<GormatiProfile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", memberId)
      .maybeSingle();

    if (!error && data) {
      return data;
    }
  } catch {
    // Return null on failure
  }

  return null;
}

