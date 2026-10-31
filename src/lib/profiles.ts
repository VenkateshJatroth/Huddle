import type { Database } from "./database.types";
import { supabase } from "./supabase";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type EditableProfile = Pick<Profile, "username" | "display_name" | "bio" | "is_private">;
export type ProfileFieldErrors = Partial<Record<keyof EditableProfile, string>>;

const usernamePattern = /^[a-z0-9][a-z0-9._]{1,38}[a-z0-9]$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function validateProfileDraft(draft: EditableProfile): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  const username = normalizeUsername(draft.username);
  const displayName = draft.display_name.trim();
  const bioLength = codePointLength(draft.bio);

  if (!usernamePattern.test(username)) {
    errors.username = "Use 3–40 lowercase letters, numbers, dots, or underscores. Start and end with a letter or number.";
  }
  if (!displayName) {
    errors.display_name = "Add a display name.";
  } else if (codePointLength(displayName) > 80) {
    errors.display_name = "Display names can be up to 80 characters.";
  }
  if (bioLength > 280) {
    errors.bio = "Your bio can be up to 280 characters.";
  }

  return errors;
}

export class ProfileTableUnavailableError extends Error {
  constructor() {
    super("The public.profiles table is not available in this project yet.");
    this.name = "ProfileTableUnavailableError";
  }
}

export class ProfileNotFoundError extends Error {
  constructor() {
    super("No profile row exists for the signed-in account.");
    this.name = "ProfileNotFoundError";
  }
}

export class ProfileValidationError extends Error {
  constructor(public readonly fieldErrors: ProfileFieldErrors) {
    super("Please review the highlighted profile fields.");
    this.name = "ProfileValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function throwIfProfilesTableMissing(error: unknown): void {
  if (!isRecord(error)) return;
  const code = error.code;
  if (code === "42P01" || code === "PGRST205") {
    throw new ProfileTableUnavailableError();
  }
}

export function isUsernameConflict(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

function requireUserId(userId: string): void {
  if (!userId.trim()) {
    throw new Error("A signed-in user is required to access a profile.");
  }
}

export async function fetchOwnProfile(userId: string): Promise<Profile | null> {
  requireUserId(userId);

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throwIfProfilesTableMissing(error);
    throw error;
  }

  return data;
}

/**
 * Checks for a matching profile that the signed-in user is permitted to see.
 * Private profiles are hidden by RLS, so the unique index remains the final
 * authority and an update may still report a username conflict.
 */
export async function checkUsernameAvailability(usernameInput: string, userId: string): Promise<boolean> {
  requireUserId(userId);
  const username = normalizeUsername(usernameInput);

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .neq("id", userId)
    .maybeSingle();

  if (error) {
    throwIfProfilesTableMissing(error);
    throw error;
  }

  return data === null;
}

export async function updateOwnProfile(userId: string, draft: EditableProfile): Promise<Profile> {
  requireUserId(userId);

  const normalizedDraft: EditableProfile = {
    username: normalizeUsername(draft.username),
    display_name: draft.display_name.trim(),
    bio: draft.bio.trim(),
    is_private: draft.is_private,
  };
  const fieldErrors = validateProfileDraft(normalizedDraft);
  if (Object.keys(fieldErrors).length > 0) {
    throw new ProfileValidationError(fieldErrors);
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(normalizedDraft)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throwIfProfilesTableMissing(error);
    throw error;
  }
  if (!data) {
    throw new ProfileNotFoundError();
  }

  return data;
}
