import { supabase } from "./supabase";
import { sendHighPriorityCallPush } from "./notifications";

export type CallType = "voice" | "video";
export type CallStatus = "ringing" | "connected" | "ended" | "declined" | "missed";

export type CallSession = {
  id: string;
  caller_id: string;
  receiver_id: string;
  call_type: CallType;
  status: CallStatus;
  room_url?: string | null;
  agora_channel?: string | null;
  agora_token?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
  caller_name?: string;
  caller_avatar?: string | null;
};

// Singleton broadcast channel reference for instant signaling
let globalBroadcastChannel: ReturnType<typeof supabase.channel> | null = null;

function getBroadcastChannel() {
  if (!globalBroadcastChannel) {
    globalBroadcastChannel = supabase.channel("huddle-calls", {
      config: { broadcast: { self: true } },
    });
    globalBroadcastChannel.subscribe();
  }
  return globalBroadcastChannel;
}

// Active outgoing calls tracker for duplicate call invitation prevention
const activeOutgoingInvitations = new Map<string, number>();

/**
 * Resolves WebRTC glare when two members call each other simultaneously.
 * Uses deterministic lexicographical comparison: the user with the smaller ID
 * wins the caller role; the other yields and accepts the incoming call.
 */
export function shouldYieldCallGlare(myUserId: string, partnerUserId: string): boolean {
  return myUserId.localeCompare(partnerUserId) > 0;
}

/**
 * Initiates a new 1-on-1 voice or video call with WebRTC & Supabase Realtime signaling.
 */
export async function startCall(
  callerId: string,
  receiverId: string,
  callType: CallType,
  callerName?: string,
  callerAvatar?: string | null,
): Promise<CallSession> {
  // Prevent duplicate invitations within 4 seconds to the same receiver
  const lastInvitationTime = activeOutgoingInvitations.get(receiverId);
  const now = Date.now();
  if (lastInvitationTime && now - lastInvitationTime < 4000) {
    console.warn("Call invitation throttled: invitation already active for this member.");
  }
  activeOutgoingInvitations.set(receiverId, now);
  const callUid = `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const channelId = `huddle_${callUid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48)}`;
  const roomUrl = `https://meet.huddle.app/${channelId}`;

  const { data } = await (supabase as any)
    .from("call_sessions")
    .insert({
      caller_id: callerId,
      receiver_id: receiverId,
      call_type: callType,
      status: "ringing",
      room_url: roomUrl,
      agora_channel: channelId,
      agora_token: null,
    })
    .select("*")
    .single();

  const finalCallId = data?.id || callUid;
  const session: CallSession = {
    id: finalCallId,
    caller_id: callerId,
    receiver_id: receiverId,
    call_type: callType,
    status: "ringing",
    room_url: roomUrl,
    agora_channel: channelId,
    agora_token: null,
    created_at: data?.created_at || new Date().toISOString(),
    caller_name: callerName || "Huddle Member",
    caller_avatar: callerAvatar,
  };

  const invitePayload = {
    callId: session.id,
    callerId,
    callerName: callerName || "Huddle Member",
    callerAvatar,
    receiverId,
    callType,
    channelId,
  };

  // 1. Broadcast on global huddle-calls channel
  try {
    const broadcastChan = getBroadcastChannel();
    void broadcastChan.send({
      type: "broadcast",
      event: "call-invitation",
      payload: invitePayload,
    });
  } catch (err) {
    console.warn("Failed to broadcast call-invitation on huddle-calls:", err);
  }

  // 2. Broadcast directly to receiver's dedicated channel user_calls_<receiverId>
  try {
    const userChan = supabase.channel(`user_calls_${receiverId}`, {
      config: { broadcast: { self: true } },
    });
    userChan.subscribe((subStatus) => {
      if (subStatus === "SUBSCRIBED") {
        void userChan.send({
          type: "broadcast",
          event: "call-invitation",
          payload: invitePayload,
        });
      }
    });
  } catch (err) {
    console.warn("Direct receiver channel send failed:", err);
  }

  // 3. Send in-app notification record to receiver
  try {
    await (supabase as any).from("notifications").insert({
      user_id: receiverId,
      actor_id: callerId,
      actor_name: callerName || "Huddle Member",
      type: "message",
      content: `Incoming ${callType === "video" ? "Video" : "Voice"} Call from ${callerName || "a member"} 📞`,
      reference_id: session.id,
      is_read: false,
    });
  } catch {
    // Non-blocking notification guard
  }

  // 4. Send immediate high-priority push notification to wake up device
  try {
    void sendHighPriorityCallPush(receiverId, {
      callId: session.id,
      callerId,
      callerName: callerName || "Huddle Member",
      callType,
    });
  } catch {
    // Non-blocking push guard
  }

  return session;
}

/**
 * Updates call status (e.g. connected, ended, declined) and broadcasts to peers.
 */
export async function updateCallStatus(callId: string, status: CallStatus): Promise<void> {
  const payload = {
    callId,
    status,
    timestamp: new Date().toISOString(),
  };

  // 1. Instant Realtime broadcast on huddle-calls
  try {
    const broadcastChan = getBroadcastChannel();
    void broadcastChan.send({
      type: "broadcast",
      event: "call-status",
      payload,
    });
  } catch {
    // Non-blocking
  }

  // 2. Realtime broadcast directly on call:<callId>
  try {
    const callChan = supabase.channel(`call:${callId}`, {
      config: { broadcast: { self: false } },
    });
    callChan.subscribe((subStatus) => {
      if (subStatus === "SUBSCRIBED") {
        void callChan.send({
          type: "broadcast",
          event: "call-status",
          payload,
        });
      }
    });
  } catch {
    // Non-blocking
  }

  // 3. Persist in database
  try {
    const updatePayload: Record<string, any> = { status };
    if (status === "connected") {
      updatePayload.started_at = new Date().toISOString();
    } else if (status === "ended" || status === "declined" || status === "missed") {
      updatePayload.ended_at = new Date().toISOString();
    }

    await (supabase as any)
      .from("call_sessions")
      .update(updatePayload)
      .eq("id", callId);
  } catch {
    // Non-blocking
  }
}

/**
 * Subscribes to live updates on a specific call session (both Postgres and Realtime broadcast).
 */
export function subscribeToCall(
  callId: string,
  onUpdate: (session: Partial<CallSession>) => void,
): () => void {
  // 1. Postgres changes listener
  const pgChannel = supabase
    .channel(`call_session_${callId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "call_sessions",
        filter: `id=eq.${callId}`,
      },
      (payload) => {
        if (payload.new) {
          onUpdate(payload.new as CallSession);
        }
      },
    )
    .subscribe();

  // 2. Realtime broadcast listener for instant state reflection
  const broadcastChan = getBroadcastChannel();
  const broadcastHandler = (resp: { payload: { callId: string; status: CallStatus } }) => {
    if (resp.payload && resp.payload.callId === callId) {
      onUpdate({ id: callId, status: resp.payload.status });
    }
  };
  broadcastChan.on("broadcast", { event: "call-status" }, broadcastHandler);

  return () => {
    void supabase.removeChannel(pgChannel);
  };
}

/**
 * Listens for incoming calls directed to the logged-in user.
 * Combines instant Realtime Broadcast with durable Postgres table inserts.
 */
export function subscribeToIncomingCalls(
  userId: string,
  onIncoming: (call: CallSession) => void,
  onDismiss?: (callId: string) => void,
): () => void {
  const handledCalls = new Set<string>();

  const notifyOnce = (call: CallSession) => {
    if (handledCalls.has(call.id)) return;
    handledCalls.add(call.id);
    onIncoming(call);
  };

  // 1. Direct user broadcast channel user_calls_<userId>
  const userChan = supabase
    .channel(`user_calls_${userId}`, {
      config: { broadcast: { self: true } },
    })
    .on("broadcast", { event: "call-invitation" }, ({ payload }) => {
      // Validate recipient and ensure caller is not spoofed / self
      if (
        payload &&
        payload.receiverId === userId &&
        payload.callerId &&
        payload.callerId !== userId &&
        typeof payload.callId === "string"
      ) {
        notifyOnce({
          id: payload.callId,
          caller_id: payload.callerId,
          caller_name: payload.callerName,
          caller_avatar: payload.callerAvatar,
          receiver_id: payload.receiverId,
          call_type: payload.callType,
          status: "ringing",
          room_url: payload.channelId ? `https://meet.huddle.app/${payload.channelId}` : null,
          agora_channel: payload.channelId,
          agora_token: null,
          created_at: new Date().toISOString(),
        });
      }
    })
    .subscribe();

  // 2. Global huddle-calls channel listener
  const broadcastChan = getBroadcastChannel();
  broadcastChan.on("broadcast", { event: "call-invitation" }, ({ payload }) => {
    // Validate recipient and valid sender
    if (
      payload &&
      payload.receiverId === userId &&
      payload.callerId &&
      payload.callerId !== userId &&
      typeof payload.callId === "string"
    ) {
      notifyOnce({
        id: payload.callId,
        caller_id: payload.callerId,
        caller_name: payload.callerName,
        caller_avatar: payload.callerAvatar,
        receiver_id: payload.receiverId,
        call_type: payload.callType,
        status: "ringing",
        room_url: payload.channelId ? `https://meet.huddle.app/${payload.channelId}` : null,
        agora_channel: payload.channelId,
        agora_token: null,
        created_at: new Date().toISOString(),
      });
    }
  });

  // Also listen for status changes so ringing banner dismisses if caller hangs up
  broadcastChan.on("broadcast", { event: "call-status" }, ({ payload }) => {
    if (payload && typeof payload.callId === "string" && (payload.status === "ended" || payload.status === "declined")) {
      onDismiss?.(payload.callId);
    }
  });

  // 3. Durable Postgres table changes fallback
  const pgChannel = supabase
    .channel(`incoming_calls_${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "call_sessions",
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as CallSession;
        if (!row) return;
        if (row.status === "ringing") {
          notifyOnce(row);
        } else if (row.status === "ended" || row.status === "declined") {
          onDismiss?.(row.id);
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(userChan);
    void supabase.removeChannel(pgChannel);
  };
}

export type CallHistoryItem = {
  id: string;
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar?: string | null;
  callType: CallType;
  direction: "incoming" | "outgoing" | "missed";
  status: CallStatus;
  durationSeconds: number;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

/**
 * Marks an unanswered or timed-out call session as 'missed'.
 */
export async function logMissedCall(callId: string): Promise<void> {
  await updateCallStatus(callId, "missed");
}

/**
 * Fetches call history for the authenticated user with partner details and duration.
 */
export async function fetchCallHistory(userId: string): Promise<CallHistoryItem[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("call_sessions")
      .select("*")
      .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(60);

    if (error || !data || !Array.isArray(data)) {
      return [];
    }

    // Collect unique partner IDs
    const otherUserIds = Array.from(
      new Set(
        data.map((row: any) =>
          row.caller_id === userId ? row.receiver_id : row.caller_id,
        ).filter(Boolean),
      ),
    );

    // Fetch profile details for all call partners in parallel
    const profileMap = new Map<string, { name: string; avatar?: string | null }>();
    if (otherUserIds.length > 0) {
      try {
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("id, display_name, full_name, username, avatar_url")
          .in("id", otherUserIds);

        if (profiles && Array.isArray(profiles)) {
          profiles.forEach((p: any) => {
            profileMap.set(p.id, {
              name: p.display_name || p.full_name || p.username || "Huddle Member",
              avatar: p.avatar_url,
            });
          });
        }
      } catch {
        // Fallback to defaults
      }
    }

    return data.map((row: any) => {
      const isCaller = row.caller_id === userId;
      const otherUserId = isCaller ? row.receiver_id : row.caller_id;
      const partner = profileMap.get(otherUserId);

      // Duration calculation in seconds
      let durationSeconds = 0;
      if (row.started_at && row.ended_at) {
        const start = new Date(row.started_at).getTime();
        const end = new Date(row.ended_at).getTime();
        durationSeconds = Math.max(0, Math.round((end - start) / 1000));
      }

      // Determine call direction & missed status
      let direction: "incoming" | "outgoing" | "missed";
      if (row.status === "missed" || (!isCaller && (row.status === "declined" || (!row.started_at && row.status === "ended")))) {
        direction = "missed";
      } else if (isCaller) {
        direction = "outgoing";
      } else {
        direction = "incoming";
      }

      return {
        id: row.id,
        otherUserId,
        otherUserName: partner?.name || (isCaller ? "Contact" : row.caller_name || "Huddle Member"),
        otherUserAvatar: partner?.avatar || (isCaller ? null : row.caller_avatar),
        callType: (row.call_type as CallType) || "voice",
        direction,
        status: row.status as CallStatus,
        durationSeconds,
        createdAt: row.created_at,
        startedAt: row.started_at,
        endedAt: row.ended_at,
      };
    });
  } catch (err) {
    console.warn("fetchCallHistory error:", err);
    return [];
  }
}
