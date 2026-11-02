import { supabase } from "./supabase";

export type SecretSpark = {
  id: string;
  sender_id: string;
  receiver_id: string;
  compliment_text: string;
  is_mutual: boolean;
  created_at: string;
};

export const PRESET_COMPLIMENTS = [
  "Your energy in the community is contagious ✨",
  "You have an amazing smile & great taste in music 🎵",
  "Always love reading your thoughts & perspectives 💭",
  "Lowkey have a major crush on your vibe 💫",
  "Would love to grab a chai or coffee together sometime ☕",
  "You're easily one of the most interesting people on Huddle 🌟",
];

/**
 * Sends an anonymous secret spark compliment to a member.
 * If the member had already sent a spark to the current user,
 * it immediately triggers a mutual match!
 */
export async function sendSecretSpark(
  senderId: string,
  receiverId: string,
  complimentText: string,
): Promise<{ success: boolean; isMutual: boolean; error?: string }> {
  try {
    const { data, error } = await (supabase as any)
      .from("secret_sparks")
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        compliment_text: complimentText,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique violation - already sent
        return { success: false, isMutual: false, error: "You've already sent a spark to this member!" };
      }
      throw error;
    }

    const isMutual = Boolean(data?.is_mutual);

    if (isMutual) {
      // Mutual celebration notification to receiver
      await (supabase as any).from("notifications").insert({
        user_id: receiverId,
        actor_id: senderId,
        actor_name: "Huddle Sparks",
        type: "message",
        content: "⚡ It's a Mutual Spark! You both sent secret compliments to each other! Direct chat unlocked.",
        reference_id: senderId,
        is_read: false,
      });
    } else {
      // Anonymous curiosity notification to receiver
      await (supabase as any).from("notifications").insert({
        user_id: receiverId,
        actor_name: "Secret Admirer ✨",
        type: "message",
        content: `Someone sent you a Secret Spark: "${complimentText}" ⚡ Send sparks to members you like to discover if it's mutual!`,
        reference_id: "sparks",
        is_read: false,
      });
    }

    return { success: true, isMutual };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send spark.";
    return { success: false, isMutual: false, error: msg };
  }
}

/**
 * Checks if a spark exists between two members.
 */
export async function checkSparkStatus(
  userId: string,
  targetId: string,
): Promise<{ hasSent: boolean; isMutual: boolean }> {
  try {
    const { data } = await (supabase as any)
      .from("secret_sparks")
      .select("is_mutual")
      .eq("sender_id", userId)
      .eq("receiver_id", targetId)
      .maybeSingle();

    if (data) {
      return { hasSent: true, isMutual: Boolean(data.is_mutual) };
    }
  } catch {
    // Non-blocking
  }

  return { hasSent: false, isMutual: false };
}

