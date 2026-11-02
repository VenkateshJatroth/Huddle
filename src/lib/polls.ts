import { supabase } from "./supabase";

export type PollData = {
  question: string;
  options: string[];
  totalVotes: number;
  votesCount: Record<number, number>;
  userVotedIndex: number | null;
};

/**
 * Fetches current vote tally and the user's vote for a given post.
 */
export async function fetchPollVotes(
  postId: string,
  userId?: string
): Promise<{ totalVotes: number; votesCount: Record<number, number>; userVotedIndex: number | null }> {
  try {
    const { data, error } = await (supabase as any)
      .from("poll_votes")
      .select("option_index, user_id")
      .eq("post_id", postId);

    if (error || !data) {
      return { totalVotes: 0, votesCount: {}, userVotedIndex: null };
    }

    const votesCount: Record<number, number> = {};
    let userVotedIndex: number | null = null;

    data.forEach((vote: { option_index: number; user_id: string }) => {
      const idx = vote.option_index;
      votesCount[idx] = (votesCount[idx] || 0) + 1;
      if (userId && vote.user_id === userId) {
        userVotedIndex = idx;
      }
    });

    return {
      totalVotes: data.length,
      votesCount,
      userVotedIndex,
    };
  } catch {
    return { totalVotes: 0, votesCount: {}, userVotedIndex: null };
  }
}

/**
 * Casts or changes a user's vote on an interactive poll.
 */
export async function castPollVote(
  postId: string,
  userId: string,
  optionIndex: number
): Promise<boolean> {
  if (!postId || !userId) return false;
  try {
    const { error } = await (supabase as any)
      .from("poll_votes")
      .upsert(
        {
          post_id: postId,
          user_id: userId,
          option_index: optionIndex,
        },
        { onConflict: "post_id,user_id" }
      );

    return !error;
  } catch {
    return false;
  }
}

/**
 * Realtime subscription for live poll updates.
 */
export function subscribeToPoll(postId: string, onUpdate: () => void): () => void {
  try {
    const channel = supabase
      .channel(`poll_${postId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "poll_votes",
          filter: `post_id=eq.${postId}`,
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}

