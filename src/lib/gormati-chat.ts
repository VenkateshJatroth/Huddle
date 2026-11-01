/**
 * Real-time chat & date prompt services for Gormati v1.2.0.
 *
 * Persists messages in `public.direct_messages`, supports Supabase Realtime
 * for instant message delivery, live typing indicators, read receipts,
 * and photo messaging.
 */

import { supabase } from "./supabase";
import { uploadProfileImage } from "./gormati-profiles";

export type ChatMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  image_url?: string | null;
  read_at?: string | null;
  created_at: string;
};

export const DATE_PROMPTS = [
  "☕ How about coffee this weekend?",
  "✨ What's your ideal Sunday?",
  "📍 Favorite spot in your city?",
  "🎶 Best song you listened to recently?",
  "📚 What book changed your perspective?",
];

// Fallback demo message history for demo users (e.g. Sana, Dev, Priya)
const demoMessageThreads: Record<string, ChatMessage[]> = {
  "account-sana": [
    {
      id: "demo-1",
      sender_id: "account-sana",
      receiver_id: "me",
      content: "Hey there! Loved your take on exploring old neighborhoods. Any favorite spot in mind?",
      read_at: new Date().toISOString(),
      created_at: "10:14 AM",
    },
    {
      id: "demo-2",
      sender_id: "me",
      receiver_id: "account-sana",
      content: "Hi Sana! Absolutely, there are some beautiful quiet lanes near the heritage center.",
      read_at: new Date().toISOString(),
      created_at: "10:18 AM",
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

/**
 * Fetches 1-on-1 messages between the authenticated user and another member.
 */
export async function fetchConversationMessages(
  userId: string,
  otherUserId: string,
): Promise<ChatMessage[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("direct_messages")
      .select("*")
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`,
      )
      .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) {
      return demoMessageThreads[otherUserId] ?? [];
    }

    return (data as any[]).map((msg) => ({
      id: msg.id,
      sender_id: msg.sender_id,
      receiver_id: msg.receiver_id,
      content: msg.content,
      image_url: msg.image_url,
      read_at: msg.read_at,
      created_at: formatMessageTime(msg.created_at),
    }));
  } catch {
    return demoMessageThreads[otherUserId] ?? [];
  }
}

/**
 * Sends a message in the 1-on-1 conversation.
 */
export async function sendChatMessage(
  senderId: string,
  receiverId: string,
  content: string,
  localPhotoUri?: string | null,
): Promise<ChatMessage> {
  let imageUrl: string | null = null;

  if (localPhotoUri) {
    try {
      imageUrl = await uploadProfileImage(senderId, localPhotoUri, "gallery");
    } catch {
      imageUrl = localPhotoUri;
    }
  }

  const nowIso = new Date().toISOString();
  const fallbackMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    sender_id: senderId,
    receiver_id: receiverId,
    content: content.trim(),
    image_url: imageUrl,
    read_at: null,
    created_at: formatMessageTime(nowIso),
  };

  try {
    const { data, error } = await (supabase as any)
      .from("direct_messages")
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        content: content.trim(),
        image_url: imageUrl,
      })
      .select("*")
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        content: data.content,
        image_url: data.image_url,
        read_at: data.read_at,
        created_at: formatMessageTime(data.created_at),
      };
    }
  } catch {
    // Fallback to local
  }

  if (!demoMessageThreads[receiverId]) {
    demoMessageThreads[receiverId] = [];
  }
  demoMessageThreads[receiverId].push(fallbackMsg);

  return fallbackMsg;
}

/**
 * Marks messages received by current user from partner as read.
 */
export async function markMessagesAsRead(userId: string, partnerId: string): Promise<void> {
  try {
    await (supabase as any)
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", partnerId)
      .eq("receiver_id", userId)
      .is("read_at", null);
  } catch {
    // Non-blocking
  }
}

/**
 * Subscribes to live incoming messages and read receipts via Supabase Realtime.
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
            sender_id: row.sender_id,
            receiver_id: row.receiver_id,
            content: row.content,
            image_url: row.image_url,
            read_at: row.read_at,
            created_at: formatMessageTime(row.created_at),
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
              sender_id: row.sender_id,
              receiver_id: row.receiver_id,
              content: row.content,
              image_url: row.image_url,
              read_at: row.read_at,
              created_at: formatMessageTime(row.created_at),
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
 * Broadcasts and listens for live typing indicators between two members.
 */
export function subscribeToTypingIndicator(
  userId: string,
  otherUserId: string,
  onTypingChange: (isTyping: boolean) => void,
): { sendTyping: (isTyping: boolean) => void; unsubscribe: () => void } {
  const channelName = `typing_${[userId, otherUserId].sort().join("_")}`;
  const channel = supabase.channel(channelName);

  channel
    .on("broadcast", { event: "typing" }, (payload) => {
      if (payload.payload?.sender_id === otherUserId) {
        onTypingChange(Boolean(payload.payload?.isTyping));
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
    void supabase.removeChannel(channel);
  };

  return { sendTyping, unsubscribe };
}
