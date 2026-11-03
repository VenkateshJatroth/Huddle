import type { Database } from "./database.types";
import { supabase } from "./supabase";
import { createNotification } from "./notifications";

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
    super("This Huddle profile is no longer available.");
    this.name = "RelationshipTargetUnavailableError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Demo Friends State
// ---------------------------------------------------------------------------
export const DEMO_FRIENDS: Record<string, RelationshipProfileSummary> = {
  "account-sana": {
    id: "account-sana",
    username: "sana.in.pune",
    display_name: "Sana Iqbal",
    is_private: false,
    bio: "Finding the best chai spots and taking photos along the way. Passionate about architecture and storytelling.",
    avatar_url: null,
  },
  "account-dev": {
    id: "account-dev",
    username: "devbuilds",
    display_name: "Dev Menon",
    is_private: false,
    bio: "Weekend rides, open source, and long conversations by the sea.",
    avatar_url: null,
  },
  "account-priya": {
    id: "account-priya",
    username: "priyareads",
    display_name: "Priya Kulkarni",
    is_private: false,
    bio: "Hosting a tiny book club that keeps getting a little bigger. Art lover, museum walker.",
    avatar_url: null,
  },
  "account-karthik": {
    id: "account-karthik",
    username: "karthik.cooks",
    display_name: "Karthik Reddy",
    is_private: false,
    bio: "Learning regional recipes from every place I visit. Tech by day, amateur chef by night.",
    avatar_url: null,
  },
};

type DemoFriendState = {
  status: "incoming_pending" | "outgoing_pending" | "accepted" | "none";
  youFollow: boolean;
  followsYou: boolean;
};

const DEMO_STORAGE_KEY = "gormati_demo_relationships_v2";

function getDemoRelationshipStore(): Record<string, DemoFriendState> {
  try {
    const raw = globalThis.localStorage?.getItem(DEMO_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Fallback to default initial state
  }

  // Default initial demo state: Sana has sent a request, Dev and Priya are connected matches
  const initial: Record<string, DemoFriendState> = {
    "account-sana": { status: "incoming_pending", youFollow: false, followsYou: true },
    "account-dev": { status: "accepted", youFollow: true, followsYou: true },
    "account-priya": { status: "accepted", youFollow: true, followsYou: true },
  };
  saveDemoRelationshipStore(initial);
  return initial;
}

function saveDemoRelationshipStore(store: Record<string, DemoFriendState>): void {
  try {
    globalThis.localStorage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage write guard
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireUserId(userId: string): void {
  if (!userId || !userId.trim()) {
    throw new Error("A valid signed-in Huddle user is required to manage connections.");
  }
}

export function relationshipErrorMessage(error: unknown): string {
  if (error instanceof RelationshipSchemaUnavailableError) {
    return "Follow requests are not enabled in this project yet. Please check again shortly.";
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
    return "Your session or access is no longer valid. Sign in again.";
  }
  return "Unable to update connections right now. Please check your internet connection.";
}

// ---------------------------------------------------------------------------
// Directory Search
// ---------------------------------------------------------------------------
export async function searchDirectoryProfiles(query: string, limit = 20): Promise<DirectoryProfile[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (Array.from(normalizedQuery).length < 2) return [];

  const results: DirectoryProfile[] = [];

  // 1. Search demo friends
  const demoStore = getDemoRelationshipStore();
  Object.values(DEMO_FRIENDS).forEach((df) => {
    if (
      df.username.toLowerCase().includes(normalizedQuery) ||
      df.display_name.toLowerCase().includes(normalizedQuery)
    ) {
      const state = demoStore[df.id] || { status: "none", youFollow: false, followsYou: false };
      results.push({
        id: df.id,
        username: df.username,
        display_name: df.display_name,
        is_private: df.is_private,
        relationship_status: state.status === "accepted" ? "accepted" : state.status === "outgoing_pending" ? "pending" : null,
        follows_you: state.followsYou,
      });
    }
  });

  // 2. Search live Supabase profiles
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, is_private")
      .or(`username.ilike.%${normalizedQuery}%,display_name.ilike.%${normalizedQuery}%`)
      .limit(limit);

    if (data && Array.isArray(data)) {
      data.forEach((p) => {
        if (!results.some((r) => r.id === p.id)) {
          results.push({
            id: p.id,
            username: p.username,
            display_name: p.display_name,
            is_private: p.is_private ?? false,
            relationship_status: null,
            follows_you: false,
          });
        }
      });
    }
  } catch {
    // Supabase search fallback
  }

  return results.slice(0, limit);
}

async function getCurrentUserName(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    return data?.display_name || data?.full_name || "A Huddle member";
  } catch {
    return "A Huddle member";
  }
}

// ---------------------------------------------------------------------------
// Follow / Connect
// ---------------------------------------------------------------------------
export async function followProfile(targetId: string, currentUserId?: string): Promise<RelationshipStatus> {
  // Check if target is a demo account
  if (DEMO_FRIENDS[targetId]) {
    const store = getDemoRelationshipStore();
    const current = store[targetId] || { status: "none", youFollow: false, followsYou: false };
    const newStatus: RelationshipStatus = DEMO_FRIENDS[targetId].is_private ? "pending" : "accepted";
    store[targetId] = {
      status: newStatus === "accepted" ? "accepted" : "outgoing_pending",
      youFollow: true,
      followsYou: current.followsYou,
    };
    saveDemoRelationshipStore(store);
    return newStatus;
  }

  // Real database member
  if (!uuidPattern.test(targetId)) throw new RelationshipTargetUnavailableError();

  try {
    if (currentUserId) {
      const { error } = await (supabase as any)
        .from("follow_relationships")
        .upsert(
          {
            follower_id: currentUserId,
            following_id: targetId,
            status: "accepted",
          },
          { onConflict: "follower_id,following_id" },
        );
      if (error) {
        await (supabase as any).from("follow_relationships").insert({
          follower_id: currentUserId,
          following_id: targetId,
          status: "accepted",
        });
      }

      // Real-time follow notification dispatch to target user
      void (async () => {
        try {
          const actorName = await getCurrentUserName(currentUserId);
          await createNotification({
            userId: targetId,
            actorId: currentUserId,
            actorName,
            type: "follow",
            referenceId: currentUserId,
            content: "started following you. Tap to follow back!",
          });
        } catch {
          // Non-blocking notification dispatch
        }
      })();
    }
    return "accepted";
  } catch {
    return "accepted";
  }
}

// ---------------------------------------------------------------------------
// Approve Follow Request
// ---------------------------------------------------------------------------
export async function approveFollowRequest(requesterId: string, currentUserId?: string): Promise<boolean> {
  // Demo friend approval (e.g. Sana)
  if (DEMO_FRIENDS[requesterId]) {
    const store = getDemoRelationshipStore();
    store[requesterId] = {
      status: "accepted",
      youFollow: true,
      followsYou: true,
    };
    saveDemoRelationshipStore(store);
    return true;
  }

  if (!uuidPattern.test(requesterId)) return false;

  try {
    if (currentUserId) {
      await (supabase as any)
        .from("follow_relationships")
        .update({ status: "accepted" })
        .eq("follower_id", requesterId)
        .eq("following_id", currentUserId);

      // Create reciprocal connection so they appear as mutual matches and can chat
      await (supabase as any)
        .from("follow_relationships")
        .upsert(
          {
            follower_id: currentUserId,
            following_id: requesterId,
            status: "accepted",
          },
          { onConflict: "follower_id,following_id" },
        );

      // Send follow-back / acceptance notification
      void (async () => {
        try {
          const actorName = await getCurrentUserName(currentUserId);
          await createNotification({
            userId: requesterId,
            actorId: currentUserId,
            actorName,
            type: "follow",
            referenceId: currentUserId,
            content: "accepted your follow request and connected with you!",
          });
        } catch {
          // Non-blocking notification dispatch
        }
      })();
    }
    return true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Reject Follow Request
// ---------------------------------------------------------------------------
export async function rejectFollowRequest(requesterId: string, currentUserId?: string): Promise<boolean> {
  // Demo friend rejection
  if (DEMO_FRIENDS[requesterId]) {
    const store = getDemoRelationshipStore();
    store[requesterId] = {
      status: "none",
      youFollow: false,
      followsYou: false,
    };
    saveDemoRelationshipStore(store);
    return true;
  }

  if (!uuidPattern.test(requesterId)) return false;

  try {
    if (currentUserId) {
      await (supabase as any)
        .from("follow_relationships")
        .delete()
        .eq("follower_id", requesterId)
        .eq("following_id", currentUserId);
    }
    return true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Remove Relationship (Unfollow)
// ---------------------------------------------------------------------------
export async function removeFollowRelationship(targetId: string, currentUserId?: string): Promise<boolean> {
  if (DEMO_FRIENDS[targetId]) {
    const store = getDemoRelationshipStore();
    store[targetId] = {
      status: "none",
      youFollow: false,
      followsYou: false,
    };
    saveDemoRelationshipStore(store);
    return true;
  }

  if (!uuidPattern.test(targetId)) return false;

  try {
    if (currentUserId) {
      await (supabase as any)
        .from("follow_relationships")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", targetId);
    }
    return true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Overview & Sync
// ---------------------------------------------------------------------------
export async function fetchRelationshipOverview(userId: string): Promise<RelationshipOverview> {
  requireUserId(userId);

  const incoming: RelationshipEntry[] = [];
  const outgoing: RelationshipEntry[] = [];
  const connectionMap = new Map<string, AcceptedConnection>();

  // 1. Process Demo Friends
  const demoStore = getDemoRelationshipStore();
  Object.entries(demoStore).forEach(([id, state]) => {
    const profile = DEMO_FRIENDS[id];
    if (!profile) return;

    if (state.status === "incoming_pending") {
      incoming.push({
        relationship: {
          requester_id: id,
          target_id: userId,
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        profile,
      });
    } else if (state.status === "outgoing_pending") {
      outgoing.push({
        relationship: {
          requester_id: userId,
          target_id: id,
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        profile,
      });
    } else if (state.status === "accepted") {
      connectionMap.set(id, {
        profile,
        youFollow: state.youFollow,
        followsYou: state.followsYou,
      });
    }
  });

  // 2. Fetch real Supabase relationships using live columns: follower_id & following_id
  try {
    const { data: rows } = await (supabase as any)
      .from("follow_relationships")
      .select("id, follower_id, following_id, status, created_at")
      .or(`follower_id.eq.${userId},following_id.eq.${userId}`);

    if (rows && Array.isArray(rows) && rows.length > 0) {
      const realProfileIds = (rows as any[]).map((r) => (r.follower_id === userId ? r.following_id : r.follower_id));
      const { data: realProfiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, is_private, bio, avatar_url")
        .in("id", realProfileIds);

      const profileMap = new Map((realProfiles ?? []).map((p) => [p.id, p]));

      (rows as any[]).forEach((row: any) => {
        const partnerId = row.follower_id === userId ? row.following_id : row.follower_id;
        const profileRow = profileMap.get(partnerId);
        if (!profileRow) return;

        const summary: RelationshipProfileSummary = {
          id: profileRow.id,
          username: profileRow.username,
          display_name: profileRow.display_name,
          is_private: profileRow.is_private ?? false,
          bio: profileRow.bio ?? null,
          avatar_url: profileRow.avatar_url ?? null,
        };

        if (row.status === "pending") {
          if (row.following_id === userId) {
            incoming.push({
              relationship: {
                requester_id: row.follower_id,
                target_id: row.following_id,
                status: "pending",
                created_at: row.created_at,
                updated_at: row.created_at,
              },
              profile: summary,
            });
          } else {
            outgoing.push({
              relationship: {
                requester_id: row.follower_id,
                target_id: row.following_id,
                status: "pending",
                created_at: row.created_at,
                updated_at: row.created_at,
              },
              profile: summary,
            });
          }
        } else if (row.status === "accepted") {
          const current = connectionMap.get(partnerId) ?? {
            profile: summary,
            youFollow: false,
            followsYou: false,
          };
          if (row.follower_id === userId) current.youFollow = true;
          if (row.following_id === userId) current.followsYou = true;
          connectionMap.set(partnerId, current);
        }
      });
    }
  } catch {
    // Remote database read guard
  }

  return {
    incoming,
    outgoing,
    connections: Array.from(connectionMap.values()).sort((a, b) =>
      a.profile.display_name.localeCompare(b.profile.display_name),
    ),
    unavailableProfiles: false,
  };
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------
export async function fetchRelationshipCounts(userId: string): Promise<RelationshipCounts> {
  const overview = await fetchRelationshipOverview(userId);
  const accepted = overview.connections;

  return {
    followers: accepted.filter((c) => c.followsYou).length,
    following: accepted.filter((c) => c.youFollow).length,
  };
}

export async function fetchRelationshipMembers(userId: string): Promise<{
  followers: RelationshipProfileSummary[];
  following: RelationshipProfileSummary[];
}> {
  const overview = await fetchRelationshipOverview(userId);
  const accepted = overview.connections;

  return {
    followers: accepted.filter((c) => c.followsYou).map((c) => c.profile),
    following: accepted.filter((c) => c.youFollow).map((c) => c.profile),
  };
}
