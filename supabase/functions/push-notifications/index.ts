// Follow this setup guide to deploy: https://supabase.com/docs/guides/functions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload: WebhookPayload = await req.json();
    const { table, type, record } = payload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const notificationsToSend: Array<{
      to: string;
      title: string;
      body: string;
      data: Record<string, unknown>;
    }> = [];

    // 1. Handle New Message Event
    if (table === "messages" && type === "INSERT") {
      const senderId = record.sender_id as string;
      const receiverId = record.receiver_id as string;
      const messageContent = (record.content as string) || "Sent you a message";

      // Fetch sender profile (for sender name) and receiver profile (for push token)
      const [{ data: sender }, { data: receiver }] = await Promise.all([
        supabase.from("profiles").select("display_name, full_name").eq("id", senderId).single(),
        supabase.from("profiles").select("push_token").eq("id", receiverId).single(),
      ]);

      if (receiver?.push_token) {
        const senderName = sender?.full_name || sender?.display_name || "A Gormati member";
        notificationsToSend.push({
          to: receiver.push_token,
          title: senderName,
          body: messageContent.length > 100 ? `${messageContent.slice(0, 97)}...` : messageContent,
          data: {
            url: `/chat/${senderId}`,
            chatId: senderId,
          },
        });
      }
    }

    // 2. Handle Mutual Match / Accepted Follow Event
    if (table === "follow_relationships" && record.status === "accepted") {
      const requesterId = record.requester_id as string;
      const targetId = record.target_id as string;

      const [{ data: requester }, { data: target }] = await Promise.all([
        supabase.from("profiles").select("display_name, full_name, push_token").eq("id", requesterId).single(),
        supabase.from("profiles").select("display_name, full_name, push_token").eq("id", targetId).single(),
      ]);

      const requesterName = requester?.full_name || requester?.display_name || "A Gormati member";
      const targetName = target?.full_name || target?.display_name || "A Gormati member";

      // Notify the requester that the connection was accepted
      if (requester?.push_token) {
        notificationsToSend.push({
          to: requester.push_token,
          title: "New Mutual Match! 🎉",
          body: `You and ${targetName} are now connected on Gormati.`,
          data: {
            url: `/member/${targetId}`,
            memberId: targetId,
          },
        });
      }

      // If it's a new mutual connection, also notify the target if old record wasn't already accepted
      if (payload.old_record?.status !== "accepted" && target?.push_token) {
        notificationsToSend.push({
          to: target.push_token,
          title: "New Mutual Match! 🎉",
          body: `You and ${requesterName} are now connected on Gormati.`,
          data: {
            url: `/member/${requesterId}`,
            memberId: requesterId,
          },
        });
      }
    }

    // Dispatch all notifications to Expo Push Service
    if (notificationsToSend.length > 0) {
      const expoRes = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(notificationsToSend),
      });

      const expoData = await expoRes.json();
      return new Response(JSON.stringify({ success: true, count: notificationsToSend.length, expo: expoData }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message: "No notifications required" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const error = err as Error;
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

