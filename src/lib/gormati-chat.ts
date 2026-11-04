/**
 * Production-ready real-time chat & messaging services for Huddle.
 *
 * Supports:
 * - Persistent 1-on-1 direct messages in `public.direct_messages`
 * - Supabase Realtime subscriptions (postgres_changes and broadcast)
 * - Sent, delivered, and read receipt tracking
 * - Typing indicators with automatic expiry
 * - Online/offline conversation presence
 * - Client-side idempotency & duplicate-message prevention (client_id)
 * - Offline message queueing and auto-retry via AsyncStorage
 * - Cursor-based message pagination
 * - Secure private media attachments (voice notes, photos, videos)
 * - In-app notification creation
 */

import { supabase } from "./supabase";
import { uploadPrivateChatMedia } from "./chatMedia";
import { createNotification } from "./notifications";
import { getLocalStorage } from "./localStorageAdapter";

const memoryStore = new Map<string, string>();

export type MessageDeliveryStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export type ChatMessage = {
  id: string;
  client_id?: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  image_url?: string | null;
  media_type?: "text" | "image" | "audio" | "video";
  media_duration?: number | null;
  read_at?: string | null;
  delivered_at?: string | null;
  created_at: string;
  raw_created_at?: string;
  status?: MessageDeliveryStatus;
  is_offline_queued?: boolean;
};

export type MessagePaginationOptions = {
  limit?: number;
  before?: string; // Cursor: fetch messages created before this timestamp
  beforeId?: string; // Secondary cursor for deterministic tie-breaking
};

export const DATE_PROMPTS = [
  "☕ How about coffee this weekend?",
  "✨ What's your ideal Sunday?",
  "📍 Favorite spot in your city?",
  "🎶 Best song you listened to recently?",
  "📚 What book changed your perspective?",
];

const OFFLINE_QUEUE_KEY = "@huddle_offline_msg_queue";

// Fallback demo message history for demo accounts
const demoMessageThreads: Record<string, ChatMessage[]> = {
  "account-sana": [
    {
      id: "demo-1",
      sender_id: "account-sana",
      receiver_id: "me",
      content: "Hey there! Loved your take on exploring old neighborhoods. Any favorite spot in mind?",
      read_at: new Date().toISOString(),
      created_at: "10:14 AM",
      status: "read",
    },
    {
      id: "demo-2",
      sender_id: "me",
      receiver_id: "account-sana",
      content: "Hi Sana! Absolutely, there are some beautiful quiet lanes near the heritage center.",
      read_at: new Date().toISOString(),
      created_at: "10:18 AM",
      status: "read",
    },
  ],
  "account-dev": [
    {
      id: "demo-3",
      sender_id: "account-dev",
      receiver_id: "me",
      content: "Hey! Saw you're into tech and weekend cycling. We have a ride planned this Sunday!",
      read_at: new Date().toISOString(),
      created_at: "Yesterday",
      status: "read",
    },
  ],
  "account-priya": [
    {
      id: "demo-4",
      sender_id: "account-priya",
      receiver_id: "me",
      content: "Hi! Always great to connect with fellow book lovers. What are you reading right now?",
      read_at: new Date().toISOString(),
      created_at: "2 days ago",
      status: "read",
    },
  ],
};

function formatMessageTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateString;
  }
}

function deriveMessageStatus(msg: {
  read_at?: string | null;
  delivered_at?: string | null;
  is_failed?: boolean;
}): MessageDeliveryStatus {
  if (msg.is_failed) return "failed";
  if (msg.read_at) return "read";
  if (msg.delivered_at) return "delivered";
  return "sent";
}

// =============================================================================
// Offline Message Queue
// =============================================================================

type QueuedMessage = {
  clientId: string;
  senderId: string;
  receiverId: string;
  content: string;
  imageUrl?: string | null;
  mediaType: "text" | "image" | "audio" | "video";
  mediaDuration?: number;
  timestamp: string;
};

async function getOfflineQueue(): Promise<QueuedMessage[]> {
  try {
    const storage = getLocalStorage();
    const raw = storage ? storage.getItem(OFFLINE_QUEUE_KEY) : memoryStore.get(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveOfflineQueue(queue: QueuedMessage[]): Promise<void> {
  try {
    const serialized = JSON.stringify(queue);
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(OFFLINE_QUEUE_KEY, serialized);
    }
    memoryStore.set(OFFLINE_QUEUE_KEY, serialized);
  } catch {
    // Non-blocking
  }
}

async function enqueueOfflineMessage(msg: QueuedMessage): Promise<void> {
  const queue = await getOfflineQueue();
  // Filter out duplicate clientId
  const filtered = queue.filter((m) => m.clientId !== msg.clientId);
  filtered.push(msg);
  await saveOfflineQueue(filtered);
}

async function removeOfflineMessage(clientId: string): Promise<void> {
  const queue = await getOfflineQueue();
  const filtered = queue.filter((m) => m.clientId !== clientId);
  await saveOfflineQueue(filtered);
}

// =============================================================================
// Message Queries & Pagination
// =============================================================================

/**
 * Fetches 1-on-1 messages between two members with cursor-based pagination.
 */
export async function fetchConversationMessages(
  userId: string,
  otherUserId: string,
  options?: MessagePaginationOptions,
): Promise<ChatMessage[]> {
  const limit = options?.limit ?? 50;

  try {
    let query = (supabase as any)
      .from("direct_messages")
      .select("*")
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`,
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (options?.before) {
      if (options.beforeId) {
        query = query.or(
          `created_at.lt.${options.before},and(created_at.eq.${options.before},id.lt.${options.beforeId})`,
        );
      } else {
        query = query.lt("created_at", options.before);
      }
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      if (!options?.before) {
        return demoMessageThreads[otherUserId] ?? [];
      }
      return [];
    }

    // Convert and reverse to ascending order for chronological chat display
    const mapped: ChatMessage[] = (data as any[]).map((msg) => ({
      id: msg.id,
      client_id: msg.client_id,
      sender_id: msg.sender_id,
      receiver_id: msg.receiver_id,
      content: msg.content,
      image_url: msg.image_url,
      media_type: msg.media_type || (msg.image_url ? "image" : "text"),
      media_duration: msg.media_duration,
      read_at: msg.read_at,
      delivered_at: msg.delivered_at,
      created_at: formatMessageTime(msg.created_at),
      raw_created_at: msg.created_at,
      status: deriveMessageStatus(msg),
    }));

    mapped.reverse();
    return mapped;
  } catch (err) {
    console.warn("fetchConversationMessages error:", err);
    if (!options?.before) {
      return demoMessageThreads[otherUserId] ?? [];
    }
    return [];
  }
}

/**
 * Marks messages received by current user from partner as delivered.
 */
export async function markMessagesAsDelivered(userId: string, partnerId: string): Promise<void> {
  try {
    await (supabase as any)
      .from("direct_messages")
      .update({ delivered_at: new Date().toISOString() })
      .eq("sender_id", partnerId)
      .eq("receiver_id", userId)
      .is("delivered_at", null);
  } catch {
    // Non-blocking
  }
}

/**
 * Acknowledges all undelivered incoming messages for the current user across all conversations (e.g. upon app launch/reconnect).
 */
export async function markAllIncomingAsDelivered(userId: string): Promise<void> {
  try {
    await (supabase as any)
      .from("direct_messages")
      .update({ delivered_at: new Date().toISOString() })
      .eq("receiver_id", userId)
      .is("delivered_at", null);
  } catch {
    // Non-blocking
  }
}

/**
 * Marks messages received by current user from partner as read and delivered.
 */
export async function markMessagesAsRead(userId: string, partnerId: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    await (supabase as any)
      .from("direct_messages")
      .update({ read_at: now, delivered_at: now })
      .eq("sender_id", partnerId)
      .eq("receiver_id", userId)
      .is("read_at", null);
  } catch {
    // Non-blocking
  }
}

/**
 * Returns total unread messages count for a specific conversation.
 */
export async function fetchConversationUnreadCount(userId: string, partnerId: string): Promise<number> {
  try {
    const { count, error } = await (supabase as any)
      .from("direct_messages")
      .select("*", { count: "exact", head: true })
      .eq("sender_id", partnerId)
      .eq("receiver_id", userId)
      .is("read_at", null);

    return error ? 0 : (count || 0);
  } catch {
    return 0;
  }
}

/**
 * Returns total unread messages count across all conversations for this user.
 */
export async function fetchTotalUnreadMessagesCount(userId: string): Promise<number> {
  try {
    const { count, error } = await (supabase as any)
      .from("direct_messages")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .is("read_at", null);

    return error ? 0 : (count || 0);
  } catch {
    return 0;
  }
}

// =============================================================================
// Message Sending & Media Attachments
// =============================================================================

/**
 * Sends a message in the 1-on-1 conversation with client_id idempotency,
 * private media upload, and automatic offline queue fallback.
 */
export async function sendChatMessage(
  senderId: string,
  receiverId: string,
  content: string,
  localPhotoUri?: string | null,
  clientId?: string,
): Promise<ChatMessage> {
  const resolvedClientId = clientId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let mediaUrl: string | null = null;
  const mediaType: "text" | "image" = localPhotoUri ? "image" : "text";

  const nowIso = new Date().toISOString();

  if (localPhotoUri) {
    try {
      const upload = await uploadPrivateChatMedia({
        userId: senderId,
        localUri: localPhotoUri,
        mediaType: "image",
      });
      // Store relative storage path (e.g. userId/filename), not expiring signed URL
      mediaUrl = upload.storagePath;
    } catch (uploadErr) {
      console.warn("Private photo upload failed, queuing for offline retry:", uploadErr);
      await enqueueOfflineMessage({
        clientId: resolvedClientId,
        senderId,
        receiverId,
        content: content.trim(),
        imageUrl: localPhotoUri,
        mediaType,
        timestamp: nowIso,
      });

      const failedMsg: ChatMessage = {
        id: resolvedClientId,
        client_id: resolvedClientId,
        sender_id: senderId,
        receiver_id: receiverId,
        content: content.trim(),
        image_url: localPhotoUri,
        media_type: mediaType,
        read_at: null,
        delivered_at: null,
        created_at: formatMessageTime(nowIso),
        raw_created_at: nowIso,
        status: "failed",
        is_offline_queued: true,
      };

      if (!demoMessageThreads[receiverId]) {
        demoMessageThreads[receiverId] = [];
      }
      demoMessageThreads[receiverId].push(failedMsg);
      return failedMsg;
    }
  }

  const fallbackMsg: ChatMessage = {
    id: resolvedClientId,
    client_id: resolvedClientId,
    sender_id: senderId,
    receiver_id: receiverId,
    content: content.trim(),
    image_url: mediaUrl,
    media_type: mediaType,
    read_at: null,
    delivered_at: null,
    created_at: formatMessageTime(nowIso),
    raw_created_at: nowIso,
    status: "sending",
  };

  try {
    const insertPayload: Record<string, any> = {
      sender_id: senderId,
      receiver_id: receiverId,
      content: content.trim(),
      image_url: mediaUrl,
      client_id: resolvedClientId,
      media_type: mediaType,
    };

    const { data, error } = await (supabase as any)
      .from("direct_messages")
      .insert(insertPayload)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      // Remove from offline queue if it was queued
      void removeOfflineMessage(resolvedClientId);

      // Trigger notification for the receiver
      void createNotification({
        userId: receiverId,
        actorId: senderId,
        actorName: "Huddle Member",
        type: "message",
        content: content.trim() || "Sent an attachment",
        referenceId: senderId,
      });

      return {
        id: data.id,
        client_id: data.client_id || resolvedClientId,
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        content: data.content,
        image_url: data.image_url,
        media_type: data.media_type || mediaType,
        media_duration: data.media_duration,
        read_at: data.read_at,
        delivered_at: data.delivered_at,
        created_at: formatMessageTime(data.created_at),
        raw_created_at: data.created_at,
        status: deriveMessageStatus(data),
      };
    }
  } catch (err) {
    console.warn("sendChatMessage network failure, queuing offline:", err);
  }

  // Queue in offline storage for auto-retry
  await enqueueOfflineMessage({
    clientId: resolvedClientId,
    senderId,
    receiverId,
    content: content.trim(),
    imageUrl: mediaUrl,
    mediaType,
    timestamp: nowIso,
  });

  fallbackMsg.status = "failed";
  fallbackMsg.is_offline_queued = true;

  if (!demoMessageThreads[receiverId]) {
    demoMessageThreads[receiverId] = [];
  }
  demoMessageThreads[receiverId].push(fallbackMsg);

  return fallbackMsg;
}

/**
 * Sends an audio voice note message with duration metadata.
 */
export async function sendVoiceNoteMessage(
  senderId: string,
  receiverId: string,
  audioUrl: string,
  durationSeconds: number,
  clientId?: string,
): Promise<ChatMessage> {
  const resolvedClientId = clientId || `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const content = `[Voice Note|${durationSeconds}s]`;
  const nowIso = new Date().toISOString();

  const fallbackMsg: ChatMessage = {
    id: resolvedClientId,
    client_id: resolvedClientId,
    sender_id: senderId,
    receiver_id: receiverId,
    content,
    image_url: audioUrl,
    media_type: "audio",
    media_duration: durationSeconds,
    read_at: null,
    delivered_at: null,
    created_at: formatMessageTime(nowIso),
    raw_created_at: nowIso,
    status: "sending",
  };

  try {
    const insertPayload: Record<string, any> = {
      sender_id: senderId,
      receiver_id: receiverId,
      content,
      image_url: audioUrl,
      client_id: resolvedClientId,
      media_type: "audio",
      media_duration: durationSeconds,
    };

    const { data, error } = await (supabase as any)
      .from("direct_messages")
      .insert(insertPayload)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      void removeOfflineMessage(resolvedClientId);

      void createNotification({
        userId: receiverId,
        actorId: senderId,
        actorName: "Huddle Member",
        type: "message",
        content: `Sent a voice note (${durationSeconds}s) 🎙️`,
        referenceId: senderId,
      });

      return {
        id: data.id,
        client_id: data.client_id || resolvedClientId,
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        content: data.content,
        image_url: data.image_url,
        media_type: "audio",
        media_duration: durationSeconds,
        read_at: data.read_at,
        delivered_at: data.delivered_at,
        created_at: formatMessageTime(data.created_at),
        raw_created_at: data.created_at,
        status: deriveMessageStatus(data),
      };
    }
  } catch (err) {
    console.warn("sendVoiceNoteMessage failure:", err);
  }

  await enqueueOfflineMessage({
    clientId: resolvedClientId,
    senderId,
    receiverId,
    content,
    imageUrl: audioUrl,
    mediaType: "audio",
    mediaDuration: durationSeconds,
    timestamp: nowIso,
  });

  fallbackMsg.status = "failed";
  fallbackMsg.is_offline_queued = true;

  if (!demoMessageThreads[receiverId]) {
    demoMessageThreads[receiverId] = [];
  }
  demoMessageThreads[receiverId].push(fallbackMsg);

  return fallbackMsg;
}

/**
 * Retries a previously failed offline message.
 */
export async function retryFailedMessage(
  userId: string,
  failedMsg: ChatMessage,
): Promise<ChatMessage> {
  if (failedMsg.media_type === "audio") {
    let finalAudioUrl = failedMsg.image_url || "";
    if (finalAudioUrl.startsWith("file://") || finalAudioUrl.startsWith("content://")) {
      try {
        const upload = await uploadPrivateChatMedia({
          userId,
          localUri: finalAudioUrl,
          mediaType: "audio",
          mimeType: "audio/m4a",
        });
        finalAudioUrl = upload.storagePath;
      } catch (err) {
        console.warn("Retry voice note upload failed:", err);
      }
    }

    return sendVoiceNoteMessage(
      userId,
      failedMsg.receiver_id,
      finalAudioUrl,
      failedMsg.media_duration || 10,
      failedMsg.client_id,
    );
  }

  return sendChatMessage(
    userId,
    failedMsg.receiver_id,
    failedMsg.content,
    failedMsg.image_url,
    failedMsg.client_id,
  );
}

/**
 * Flushes all queued offline messages when network connectivity resumes.
 */
export async function flushOfflineMessages(userId: string): Promise<void> {
  const queue = await getOfflineQueue();
  const userQueued = queue.filter((m) => m.senderId === userId);

  for (const item of userQueued) {
    try {
      if (item.mediaType === "audio") {
        await sendVoiceNoteMessage(
          item.senderId,
          item.receiverId,
          item.imageUrl || "",
          item.mediaDuration || 10,
          item.clientId,
        );
      } else {
        await sendChatMessage(
          item.senderId,
          item.receiverId,
          item.content,
          item.imageUrl,
          item.clientId,
        );
      }
    } catch {
      // Continue next turn
    }
  }
}

// =============================================================================
// Realtime Subscriptions, Typing & Presence
// =============================================================================

/**
 * Subscribes to live incoming messages, delivered statuses, and read receipts via Supabase Realtime.
 */
export function subscribeToMessages(
  userId: string,
  otherUserId: string,
  onNewMessage: (msg: ChatMessage) => void,
  onMessageUpdated?: (msg: ChatMessage) => void,
): () => void {
  const channelName = `dm_${[userId, otherUserId].sort().join("_")}`;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
      },
      (payload) => {
        const row = payload.new as any;
        if (
          (row.sender_id === otherUserId && row.receiver_id === userId) ||
          (row.sender_id === userId && row.receiver_id === otherUserId)
        ) {
          onNewMessage({
            id: row.id,
            client_id: row.client_id,
            sender_id: row.sender_id,
            receiver_id: row.receiver_id,
            content: row.content,
            image_url: row.image_url,
            media_type: row.media_type || (row.image_url ? "image" : "text"),
            media_duration: row.media_duration,
            read_at: row.read_at,
            delivered_at: row.delivered_at,
            created_at: formatMessageTime(row.created_at),
            raw_created_at: row.created_at,
            status: deriveMessageStatus(row),
          });
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "direct_messages",
      },
      (payload) => {
        const row = payload.new as any;
        if (
          (row.sender_id === otherUserId && row.receiver_id === userId) ||
          (row.sender_id === userId && row.receiver_id === otherUserId)
        ) {
          if (onMessageUpdated) {
            onMessageUpdated({
              id: row.id,
              client_id: row.client_id,
              sender_id: row.sender_id,
              receiver_id: row.receiver_id,
              content: row.content,
              image_url: row.image_url,
              media_type: row.media_type || (row.image_url ? "image" : "text"),
              media_duration: row.media_duration,
              read_at: row.read_at,
              delivered_at: row.delivered_at,
              created_at: formatMessageTime(row.created_at),
              raw_created_at: row.created_at,
              status: deriveMessageStatus(row),
            });
          }
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Broadcasts and listens for live typing indicators with automatic 3.5s expiry.
 */
export function subscribeToTypingIndicator(
  userId: string,
  otherUserId: string,
  onTypingChange: (isTyping: boolean) => void,
): { sendTyping: (isTyping: boolean) => void; unsubscribe: () => void } {
  const channelName = `typing_${[userId, otherUserId].sort().join("_")}`;
  const channel = supabase.channel(channelName);
  let autoExpireTimer: ReturnType<typeof setTimeout> | null = null;

  channel
    .on("broadcast", { event: "typing" }, (payload) => {
      if (payload.payload?.sender_id === otherUserId) {
        const isTyping = Boolean(payload.payload?.isTyping);
        onTypingChange(isTyping);

        if (autoExpireTimer) clearTimeout(autoExpireTimer);
        if (isTyping) {
          // Auto-expire typing indicator after 3.5 seconds if sender stopped or disconnected
          autoExpireTimer = setTimeout(() => {
            onTypingChange(false);
          }, 3500);
        }
      }
    })
    .subscribe();

  const sendTyping = (isTyping: boolean) => {
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { sender_id: userId, isTyping },
    });
  };

  const unsubscribe = () => {
    if (autoExpireTimer) clearTimeout(autoExpireTimer);
    void supabase.removeChannel(channel);
  };

  return { sendTyping, unsubscribe };
}

/**
 * Tracks online presence between participants in the conversation channel.
 */
export function subscribeToChatPresence(
  userId: string,
  otherUserId: string,
  onPresenceChange: (isPartnerOnline: boolean) => void,
): () => void {
  const channelName = `presence_${[userId, otherUserId].sort().join("_")}`;
  const channel = supabase.channel(channelName);

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const onlineUserIds = Object.values(state).flatMap((presences: any) =>
        presences.map((p: any) => p.user_id),
      );
      const isPartnerOnline = onlineUserIds.includes(otherUserId);
      onPresenceChange(isPartnerOnline);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        });
      }
    });

  return () => {
    void channel.untrack();
    void supabase.removeChannel(channel);
  };
}
