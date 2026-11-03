import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "./Icon";
import { AppButton, Card } from "./ui";
import { supabase } from "../lib/supabase";
import { useAppColors } from "../theme/colors";

export type DailyHotTake = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  active_date: string;
  category: string;
  votes_a: number;
  votes_b: number;
  created_at: string;
};

export type HotTakeComment = {
  id: string;
  choice: "A" | "B";
  comment: string;
  created_at: string;
};

export function DailyHotTakeCard() {
  const colors = useAppColors();
  const { user } = useAuth();

  const [hotTake, setHotTake] = useState<DailyHotTake | null>(null);
  const [userVote, setUserVote] = useState<"A" | "B" | null>(null);
  const [votesA, setVotesA] = useState(0);
  const [votesB, setVotesB] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [comments, setComments] = useState<HotTakeComment[]>([]);
  const [hasCommented, setHasCommented] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadHotTake() {
      try {
        const todayStr = new Date().toISOString().split("T")[0];

        // 1. Fetch today's hot take (or fallback to latest)
        let { data, error } = await (supabase as any)
          .from("daily_hot_takes")
          .select("*")
          .eq("active_date", todayStr)
          .maybeSingle();

        if (error || !data) {
          const fallbackRes = await (supabase as any)
            .from("daily_hot_takes")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          data = fallbackRes.data;
        }

        if (!data || !isCurrent) return;

        setHotTake(data);
        setVotesA(data.votes_a || 0);
        setVotesB(data.votes_b || 0);

        // 2. Check if logged-in user has already voted
        if (user?.id) {
          const { data: voteData } = await (supabase as any)
            .from("hot_take_responses")
            .select("choice, comment")
            .eq("hot_take_id", data.id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (voteData && isCurrent) {
            setUserVote(voteData.choice as "A" | "B");
            if (voteData.comment) {
              setHasCommented(true);
            }
          }
        }

        // 3. Fetch top responses with comments
        const { data: commentsData } = await (supabase as any)
          .from("hot_take_responses")
          .select("id, choice, comment, created_at")
          .eq("hot_take_id", data.id)
          .not("comment", "is", null)
          .neq("comment", "")
          .order("created_at", { ascending: false })
          .limit(3);

        if (commentsData && isCurrent) {
          setComments(commentsData as HotTakeComment[]);
        }
      } catch {
        if (isCurrent) {
          setHotTake(null);
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadHotTake();
    return () => {
      isCurrent = false;
    };
  }, [user?.id]);

  const handleVote = async (choice: "A" | "B") => {
    if (!hotTake || isVoting) return;
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to vote in today's Hot Take battle!");
      return;
    }

    const previousVote = userVote;
    const previousA = votesA;
    const previousB = votesB;

    setIsVoting(true);
    // Optimistic UI state
    setUserVote(choice);
    if (choice === "A") {
      setVotesA((v) => v + 1);
    } else {
      setVotesB((v) => v + 1);
    }

    try {
      await (supabase as any).from("hot_take_responses").upsert({
        hot_take_id: hotTake.id,
        user_id: user.id,
        choice,
      });

      const updateCol = choice === "A" ? { votes_a: previousA + 1 } : { votes_b: previousB + 1 };
      await (supabase as any).from("daily_hot_takes").update(updateCol).eq("id", hotTake.id);
    } catch {
      // Rollback on failure
      setUserVote(previousVote);
      setVotesA(previousA);
      setVotesB(previousB);
      Alert.alert("Vote Failed", "Could not record your vote. Please check your network connection.");
    } finally {
      setIsVoting(false);
    }
  };

  const handleSubmitComment = async () => {
    const text = commentText.trim();
    if (!text || !hotTake || !user || !userVote || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      await (supabase as any)
        .from("hot_take_responses")
        .update({ comment: text })
        .eq("hot_take_id", hotTake.id)
        .eq("user_id", user.id);

      setComments((prev) => [
        {
          id: `cmt-${Date.now()}`,
          choice: userVote,
          comment: text,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setHasCommented(true);
      setCommentText("");
    } catch {
      Alert.alert("Notice", "Unable to post comment. Please try again.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  if (isLoading || !hotTake) {
    return null;
  }

  const totalVotes = votesA + votesB;
  const pctA = totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 50;
  const pctB = 100 - pctA;
  const hasVoted = Boolean(userVote);

  return (
    <Card style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header Badge */}
      <View style={styles.headerRow}>
        <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.badgeText, { color: colors.accent }]}>🔥 Daily Hot Take</Text>
        </View>
        <Text style={[styles.votesMeta, { color: colors.secondary }]}>
          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        </Text>
      </View>

      {/* Provocative Question */}
      <Text style={[styles.questionText, { color: colors.text }]}>{hotTake.question}</Text>

      {/* Voting Options */}
      <View style={styles.optionsContainer}>
        {/* Option A */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hotTake.option_a}
          disabled={hasVoted || isVoting}
          onPress={() => { void handleVote("A"); }}
          style={[
            styles.optionButton,
            {
              backgroundColor: userVote === "A" ? colors.accentSoft : colors.subtle,
              borderColor: userVote === "A" ? colors.accent : colors.border,
            },
          ]}
        >
          {hasVoted ? (
            <View
              style={[
                styles.percentageFill,
                { width: `${pctA}%`, backgroundColor: colors.accent, opacity: userVote === "A" ? 0.35 : 0.18 },
              ]}
            />
          ) : null}

          <View style={styles.optionContent}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.optionLabel, { color: colors.text }]}>{hotTake.option_a}</Text>
              {userVote === "A" ? (
                <Text style={[styles.yourVoteBadge, { color: colors.accent }]}>Your Vote ✓</Text>
              ) : null}
            </View>

            {hasVoted ? (
              <Text style={[styles.pctText, { color: colors.text }]}>{pctA}%</Text>
            ) : (
              <View style={[styles.votePill, { backgroundColor: colors.surface }]}>
                <Text style={[styles.votePillText, { color: colors.accent }]}>Vote</Text>
              </View>
            )}
          </View>
        </Pressable>

        {/* Option B */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hotTake.option_b}
          disabled={hasVoted || isVoting}
          onPress={() => { void handleVote("B"); }}
          style={[
            styles.optionButton,
            {
              backgroundColor: userVote === "B" ? colors.accentSoft : colors.subtle,
              borderColor: userVote === "B" ? colors.accent : colors.border,
            },
          ]}
        >
          {hasVoted ? (
            <View
              style={[
                styles.percentageFill,
                { width: `${pctB}%`, backgroundColor: colors.accent, opacity: userVote === "B" ? 0.35 : 0.18 },
              ]}
            />
          ) : null}

          <View style={styles.optionContent}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.optionLabel, { color: colors.text }]}>{hotTake.option_b}</Text>
              {userVote === "B" ? (
                <Text style={[styles.yourVoteBadge, { color: colors.accent }]}>Your Vote ✓</Text>
              ) : null}
            </View>

            {hasVoted ? (
              <Text style={[styles.pctText, { color: colors.text }]}>{pctB}%</Text>
            ) : (
              <View style={[styles.votePill, { backgroundColor: colors.surface }]}>
                <Text style={[styles.votePillText, { color: colors.accent }]}>Vote</Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {!hasVoted ? (
        <View style={styles.lockedHintRow}>
          <Icon name="lock" color={colors.secondary} size={14} />
          <Text style={[styles.lockedHintText, { color: colors.secondary }]}>
            Vote to unlock community percentages & spicy reactions
          </Text>
        </View>
      ) : (
        <>
          {/* Reaction comment composer if user hasn't commented yet */}
          {!hasCommented ? (
            <View style={styles.commentComposerRow}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Defend your pick with a quick hot take…"
                placeholderTextColor={colors.secondary}
                style={[
                  styles.commentInput,
                  { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border },
                ]}
              />
              <AppButton
                label="Drop take"
                disabled={!commentText.trim() || isSubmittingComment}
                onPress={() => { void handleSubmitComment(); }}
              />
            </View>
          ) : null}

          {/* Top community comment highlights */}
          {comments.length > 0 ? (
            <View style={styles.commentsWrap}>
              <Text style={[styles.commentsSectionTitle, { color: colors.secondary }]}>
                Community Takes
              </Text>
              {comments.map((c) => (
                <View
                  key={c.id}
                  style={[styles.commentBubble, { backgroundColor: colors.subtle }]}
                >
                  <Text style={[styles.commentTag, { color: colors.accent }]}>
                    {c.choice === "A" ? "Team A" : "Team B"}:
                  </Text>
                  <Text style={[styles.commentBody, { color: colors.text }]}>“{c.comment}”</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    padding: 16,
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  votesMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  questionText: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    position: "relative",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 52,
    justifyContent: "center",
  },
  percentageFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 12,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  yourVoteBadge: {
    fontSize: 11,
    fontWeight: "800",
  },
  pctText: {
    fontSize: 16,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    marginLeft: 10,
  },
  votePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
  },
  votePillText: {
    fontSize: 12,
    fontWeight: "800",
  },
  lockedHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 4,
  },
  lockedHintText: {
    fontSize: 12,
    fontStyle: "italic",
  },
  commentComposerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  commentsWrap: {
    gap: 6,
    marginTop: 4,
  },
  commentsSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  commentBubble: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  commentTag: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  commentBody: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
