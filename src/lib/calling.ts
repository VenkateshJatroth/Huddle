import { supabase } from "./supabase";

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
