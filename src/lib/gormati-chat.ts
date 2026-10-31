/**
 * Real-time chat & date prompt services for Gormati.
 *
 * Supports live Supabase messages with Realtime channel subscription,
 * with graceful fallback to local / demo state if the messages table
 * has not been provisioned in the backend.
 */

import { supabase } from "./supabase";

export type ChatMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
};

export const DATE_PROMPTS = [
  "☕ How about coffee this weekend?",
  "✨ What's your ideal Sunday?",
  "📍 Favorite spot in your city?",
  "🎶 Best song you listened to recently?",
  "📚 What book changed your perspective?",
];

// Fallback demo message history when database table is unavailable or empty
const demoMessageThreads: Record<string, ChatMessage[]> = {
  "account-sana": [
    {
      id: "demo-1",
      sender_id: "account-sana",
      receiver_id: "me",
      content: "Hey there! Loved your take on exploring old neighborhoods. Any favorite spot in mind?",
      created_at: "10:14 AM",
    },
    {
      id: "demo-2",
      sender_id: "me",
      receiver_id: "account-sana",
      content: "Hi Sana! Absolutely, there are some beautiful quiet lanes near the heritage center.",
      created_at: "10:18 AM",
    },
  ],
  "account-dev": [
    {
      id: "demo-3",
      sender_id: "account-dev",
      receiver_id: "me",
      content: "Hey! Saw you're into tech and weekend cycling. We have a ride planned this Sunday!",
      created_at: "Yesterday",
    },
  ],
  "account-priya": [
    {
      id: "demo-4",
      sender_id: "account-priya",
      receiver_id: "me",
      content: "Hi! Always great to connect with fellow book lovers. What are you reading right now?",
      created_at: "2 days ago",
    },
  ],
};

/**
 * Fetches 1-on-1 messages between the authenticated user and another member.
 */
export async function fetchConversationMessages(
  userId: string,
  otherUserId: string,
): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from("messages" as unknown as "profiles")
      .select("*")
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`,
      )
      .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) {
      return demoMessageThreads[otherUserId] ?? [];
    }

    return (data as unknown as ChatMessage[]).map((msg) => ({
      id: msg.id,
      sender_id: msg.sender_id,
      receiver_id: msg.receiver_id,
      content: msg.content,
      created_at: new Date(msg.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
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
): Promise<ChatMessage> {
  const newMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    sender_id: senderId,
    receiver_id: receiverId,
    content: content.trim(),
    created_at: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  try {
    const { data, error } = await supabase
      .from("messages" as unknown as "profiles")
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        content: content.trim(),
      } as unknown as { id: string; username: string })
      .select("*")
      .maybeSingle();

    if (!error && data) {
      const row = data as unknown as ChatMessage;
      return {
        id: row.id,
        sender_id: row.sender_id,
        receiver_id: row.receiver_id,
        content: row.content,
        created_at: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }
  } catch {
    // If backend table is not present, use the locally generated message
  }

  // Fallback to local message delivery
  if (!demoMessageThreads[receiverId]) {
    demoMessageThreads[receiverId] = [];
  }
  demoMessageThreads[receiverId].push(newMsg);

  return newMsg;
}

/**
 * Subscribes to new incoming messages via Supabase Realtime channel.
 */
export function subscribeToMessages(
  userId: string,
  otherUserId: string,
  onNewMessage: (msg: ChatMessage) => void,
): () => void {
  const channelName = `chat_${[userId, otherUserId].sort().join("_")}`;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      (payload) => {
        const newRecord = payload.new as ChatMessage;
        if (
          (newRecord.sender_id === otherUserId && newRecord.receiver_id === userId) ||
          (newRecord.sender_id === userId && newRecord.receiver_id === otherUserId)
        ) {
          onNewMessage({
            id: newRecord.id,
            sender_id: newRecord.sender_id,
            receiver_id: newRecord.receiver_id,
            content: newRecord.content,
            created_at: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

