import type { Database } from "./database.types";
import { supabase } from "./supabase";

export type RelationshipStatus = "pending" | "accepted";
export type FollowRelationship = Database["public"]["Tables"]["follow_relationships"]["Row"];

export type DirectoryProfile = {
  id: string;
  username: string;
  display_name: string;
  is_private: boolean;
  relationship_status: RelationshipStatus | null;
  follows_you: boolean;
};

export type RelationshipProfileSummary = {
  id: string;
  username: string;
  display_name: string;
  is_private: boolean;
  bio: string | null;
  avatar_url: string | null;
};

export type RelationshipEntry = {
  relationship: FollowRelationship;
  profile: RelationshipProfileSummary;
};

export type AcceptedConnection = {
  profile: RelationshipProfileSummary;
  youFollow: boolean;
  followsYou: boolean;
};

export type RelationshipOverview = {
  incoming: RelationshipEntry[];
  outgoing: RelationshipEntry[];
  connections: AcceptedConnection[];
  unavailableProfiles: boolean;
};

export type RelationshipCounts = {
  followers: number;
  following: number;
};

export class RelationshipSchemaUnavailableError extends Error {
  constructor() {
    super("The follow relationship migration is not available in this Supabase project yet.");
    this.name = "RelationshipSchemaUnavailableError";
  }
}

export class RelationshipTargetUnavailableError extends Error {
  constructor() {
    super("This Gormati profile is no longer available.");
    this.name = "RelationshipTargetUnavailableError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireUserId(userId: string): void {
  if (!uuidPattern.test(userId)) {
    throw new Error("A valid signed-in Gormati user is required to manage connections.");
  }
}

function throwIfRelationshipSchemaMissing(error: unknown): void {
  if (!isRecord(error)) return;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(String(error.code))) {
    throw new RelationshipSchemaUnavailableError();
  }
}

function throwIfTargetUnavailable(error: unknown): void {
  if (isRecord(error) && error.code === "P0002") {
    throw new RelationshipTargetUnavailableError();
  }
}

export function relationshipErrorMessage(error: unknown): string {
  if (error instanceof RelationshipSchemaUnavailableError) {
    return "Follow requests are not enabled in this project yet. The reviewed relationship migration must be applied to a staging database first.";
  }
  if (error instanceof RelationshipTargetUnavailableError) {
    return error.message;
  }
  if (isRecord(error) && (
    error.status === 401
    || error.status === 403
    || error.code === "42501"
    || error.code === "PGRST301"
  )) {
    return "Your session or access is no longer valid. Sign in again, and contact the project administrator if this continues.";
  }
  return "We couldn’t update connections. Check your internet connection and try again.";
}

export async function searchDirectoryProfiles(query: string, limit = 20): Promise<DirectoryProfile[]> {
  const normalizedQuery = query.trim();
  if (Array.from(normalizedQuery).length < 2) return [];

  const { data, error } = await supabase.rpc("indiana_search_profiles", {
    p_query: normalizedQuery,
    p_limit: limit,
  });

  if (error) {
    throwIfRelationshipSchemaMissing(error);
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.profile_id,
    username: row.profile_username,
    display_name: row.profile_display_name,
    is_private: row.profile_is_private,
    relationship_status: row.outgoing_status,
    follows_you: row.follows_you,
  }));
}

export async function followProfile(targetId: string): Promise<RelationshipStatus> {
  if (!uuidPattern.test(targetId)) throw new RelationshipTargetUnavailableError();

  const { data, error } = await supabase.rpc("indiana_follow_profile", { p_target_id: targetId });
  if (error) {
    throwIfRelationshipSchemaMissing(error);
    throwIfTargetUnavailable(error);
    throw error;
  }
  if (data !== "pending" && data !== "accepted") {
    throw new Error("The follow action returned an unexpected status.");
  }
  return data;
}

export async function approveFollowRequest(requesterId: string): Promise<boolean> {
  if (!uuidPattern.test(requesterId)) return false;
  const { data, error } = await supabase.rpc("indiana_approve_follow_request", { p_requester_id: requesterId });
  if (error) {
    throwIfRelationshipSchemaMissing(error);
    throw error;
  }
  return data;
}

export async function rejectFollowRequest(requesterId: string): Promise<boolean> {
  if (!uuidPattern.test(requesterId)) return false;
  const { data, error } = await supabase.rpc("indiana_reject_follow_request", { p_requester_id: requesterId });
  if (error) {
    throwIfRelationshipSchemaMissing(error);
    throw error;
  }
  return data;
}

export async function removeFollowRelationship(targetId: string): Promise<boolean> {
  if (!uuidPattern.test(targetId)) return false;
  const { data, error } = await supabase.rpc("indiana_remove_follow_relationship", { p_target_id: targetId });
  if (error) {
    throwIfRelationshipSchemaMissing(error);
    throw error;
  }
  return data;
}

export async function fetchRelationshipState(
  userId: string,
  profileId: string,
): Promise<{ outgoing: RelationshipStatus | null; incoming: RelationshipStatus | null }> {
  requireUserId(userId);
  if (!uuidPattern.test(profileId)) return { outgoing: null, incoming: null };

  const [outgoingResult, incomingResult] = await Promise.all([
    supabase
      .from("follow_relationships")
      .select("status")
      .eq("requester_id", userId)
      .eq("target_id", profileId)
      .maybeSingle(),
    supabase
      .from("follow_relationships")
      .select("status")
      .eq("requester_id", profileId)
      .eq("target_id", userId)
      .maybeSingle(),
  ]);

  const error = outgoingResult.error ?? incomingResult.error;
  if (error) {
    throwIfRelationshipSchemaMissing(error);
    throw error;
  }

  return {
    outgoing: outgoingResult.data?.status ?? null,
    incoming: incomingResult.data?.status ?? null,
  };
}

async function fetchRelatedProfiles(profileIds: string[]): Promise<Map<string, RelationshipProfileSummary>> {
  const uniqueIds = [...new Set(profileIds)];
  if (uniqueIds.length === 0) return new Map();

  const batches = Array.from({ length: Math.ceil(uniqueIds.length / 100) }, (_, index) => (
    uniqueIds.slice(index * 100, (index + 1) * 100)
  ));
  const results = await Promise.all(batches.map((batch) => (
    supabase.rpc("indiana_relationship_profile_summaries", { p_profile_ids: batch })
  )));
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    throwIfRelationshipSchemaMissing(firstError);
    throw firstError;
  }

  return new Map(results.flatMap((result) => (result.data ?? []).map((row) => [row.profile_id, {
    id: row.profile_id,
    username: row.profile_username,
    display_name: row.profile_display_name,
    is_private: row.profile_is_private,
    bio: row.profile_bio,
    avatar_url: row.profile_avatar_url,
  }] as const)));
}

async function fetchAllRelationshipRows(userId: string): Promise<FollowRelationship[]> {
  const pageSize = 500;
  const rows: FollowRelationship[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("follow_relationships")
      .select("*")
      .or(`requester_id.eq.${userId},target_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .order("requester_id", { ascending: true })
      .order("target_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throwIfRelationshipSchemaMissing(error);
      throw error;
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function fetchRelationshipOverview(userId: string): Promise<RelationshipOverview> {
  requireUserId(userId);

  const relationships = await fetchAllRelationshipRows(userId);
  const profileIds = relationships.map((relationship) => (
    relationship.requester_id === userId ? relationship.target_id : relationship.requester_id
  ));
  const profiles = await fetchRelatedProfiles(profileIds);
  const withProfile = (relationship: FollowRelationship): RelationshipEntry | null => {
    const profileId = relationship.requester_id === userId ? relationship.target_id : relationship.requester_id;
    const profile = profiles.get(profileId);
    return profile ? { relationship, profile } : null;
  };

  const incoming = relationships
    .filter((relationship) => relationship.target_id === userId && relationship.status === "pending")
    .map(withProfile)
    .filter((entry): entry is RelationshipEntry => entry !== null);
  const outgoing = relationships
    .filter((relationship) => relationship.requester_id === userId && relationship.status === "pending")
    .map(withProfile)
    .filter((entry): entry is RelationshipEntry => entry !== null);

  const connectionMap = new Map<string, AcceptedConnection>();
  relationships
    .filter((relationship) => relationship.status === "accepted")
    .forEach((relationship) => {
      const profileId = relationship.requester_id === userId ? relationship.target_id : relationship.requester_id;
      const profile = profiles.get(profileId);
      if (!profile) return;
      const current = connectionMap.get(profileId) ?? { profile, youFollow: false, followsYou: false };
      if (relationship.requester_id === userId) current.youFollow = true;
      if (relationship.target_id === userId) current.followsYou = true;
      connectionMap.set(profileId, current);
    });

  return {
    incoming,
    outgoing,
    connections: [...connectionMap.values()].sort((left, right) => (
      left.profile.display_name.localeCompare(right.profile.display_name)
    )),
    unavailableProfiles: profiles.size < new Set(profileIds).size,
  };
}

export async function fetchRelationshipCounts(userId: string): Promise<RelationshipCounts> {
  requireUserId(userId);

  const [followers, following] = await Promise.all([
    supabase
      .from("follow_relationships")
      .select("requester_id", { count: "exact", head: true })
      .eq("target_id", userId)
      .eq("status", "accepted"),
    supabase
      .from("follow_relationships")
      .select("target_id", { count: "exact", head: true })
      .eq("requester_id", userId)
      .eq("status", "accepted"),
  ]);

  const error = followers.error ?? following.error;
  if (error) {
    throwIfRelationshipSchemaMissing(error);
    throw error;
  }

  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}
