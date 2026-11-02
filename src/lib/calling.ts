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
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
  caller_name?: string;
  caller_avatar?: string | null;
};

/**
 * Initiates a new 1-on-1 voice or video call.
 */
export async function startCall(
  callerId: string,
  receiverId: string,
  callType: CallType,
  callerName?: string,
  callerAvatar?: string | null,
): Promise<CallSession> {
  const roomUrl = `https://meet.gormati.app/room-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  const { data, error } = await (supabase as any)
    .from("call_sessions")
    .insert({
      caller_id: callerId,
      receiver_id: receiverId,
      call_type: callType,
      status: "ringing",
      room_url: roomUrl,
    })
    .select("*")
    .single();

  if (error || !data) {
    // Local fallback for offline/demo simulation
    return {
      id: `call-${Date.now()}`,
      caller_id: callerId,
      receiver_id: receiverId,
      call_type: callType,
      status: "ringing",
      room_url: roomUrl,
      created_at: new Date().toISOString(),
      caller_name: callerName || "GorMati Member",
      caller_avatar: callerAvatar,
    };
  }

  // Send an in-app notification to the receiver
  try {
    await (supabase as any).from("notifications").insert({
      user_id: receiverId,
      actor_id: callerId,
      actor_name: callerName || "GorMati Member",
      type: "message",
      content: `Incoming ${callType === "video" ? "Video" : "Voice"} Call from ${callerName || "a member"} 📞`,
      reference_id: data.id,
      is_read: false,
    });
  } catch {
    // Non-blocking notification guard
  }

  return {
    ...data,
    caller_name: callerName,
    caller_avatar: callerAvatar,
  };
}

/**
 * Updates call status (e.g. connected, ended, declined).
 */
export async function updateCallStatus(callId: string, status: CallStatus): Promise<void> {
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
 * Subscribes to live updates on a specific call session.
 */
export function subscribeToCall(
  callId: string,
  onUpdate: (session: CallSession) => void,
): () => void {
  const channel = supabase
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

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Listens for incoming calls directed to the logged-in user.
 */
export function subscribeToIncomingCalls(
  userId: string,
  onIncoming: (call: CallSession) => void,
): () => void {
  const channel = supabase
    .channel(`incoming_calls_${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "call_sessions",
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as CallSession;
        if (row && row.status === "ringing") {
          onIncoming(row);
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
