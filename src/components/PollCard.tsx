import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppColors } from "../theme/colors";
import { Icon } from "./Icon";
import { castPollVote, fetchPollVotes, subscribeToPoll } from "../lib/polls";

export function PollCard({
  postId,
  question,
  options,
  currentUserId,
}: {
  postId: string;
  question: string;
  options: string[];
  currentUserId?: string;
}) {
  const colors = useAppColors();
  const [votesCount, setVotesCount] = useState<Record<number, number>>({});
  const [totalVotes, setTotalVotes] = useState<number>(0);
  const [userVotedIndex, setUserVotedIndex] = useState<number | null>(null);
  const [isVoting, setIsVoting] = useState<boolean>(false);

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      try {
        const res = await fetchPollVotes(postId, currentUserId);
        if (!isCurrent) return;
        setVotesCount(res.votesCount);
        setTotalVotes(res.totalVotes);
        setUserVotedIndex(res.userVotedIndex);
      } catch {
        // Non-blocking
      }
    }
    void load();
    const unsub = subscribeToPoll(postId, () => {
      void load();
    });
    return () => {
      isCurrent = false;
      unsub();
    };
  }, [postId, currentUserId]);

  const handleSelectOption = async (index: number) => {
    if (!currentUserId) {
      Alert.alert("Sign In Required", "Please sign in to vote in community polls.");
      return;
    }
    if (isVoting) return;

    // Optimistic update
    const previousVote = userVotedIndex;
    setUserVotedIndex(index);
    setVotesCount((prev) => {
      const next = { ...prev };
      if (previousVote !== null && next[previousVote]) {
        next[previousVote] = Math.max(0, next[previousVote] - 1);
      }
      next[index] = (next[index] || 0) + 1;
      return next;
    });
    if (previousVote === null) {
      setTotalVotes((t) => t + 1);
    }

    setIsVoting(true);
    try {
      const success = await castPollVote(postId, currentUserId, index);
      if (!success) {
        // Rollback
        const res = await fetchPollVotes(postId, currentUserId);
        setVotesCount(res.votesCount);
        setTotalVotes(res.totalVotes);
        setUserVotedIndex(res.userVotedIndex);
        Alert.alert("Vote Failed", "Could not submit your vote. Please check your internet connection.");
      }
    } finally {
      setIsVoting(false);
    }
  };

  const hasVoted = userVotedIndex !== null;

  return (
    <View style={[styles.card, { backgroundColor: colors.subtle, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.pollTag}>
          <Text style={styles.pollTagText}>📊 COMMUNITY POLL</Text>
        </View>
        <Text style={[styles.totalVotesText, { color: colors.secondary }]}>
          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        </Text>
      </View>

      <Text style={[styles.questionText, { color: colors.text }]}>{question}</Text>

      <View style={styles.optionsList}>
        {options.map((option, idx) => {
          const count = votesCount[idx] || 0;
          const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isSelected = userVotedIndex === idx;

          return (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityLabel={`${option}, ${percentage} percent`}
              onPress={() => { void handleSelectOption(idx); }}
              style={[
                styles.optionRow,
                {
                  borderColor: isSelected ? colors.accent : colors.border,
                  backgroundColor: isSelected ? colors.surface : colors.surface,
                },
              ]}
            >
              {/* Progress bar background fill */}
              {hasVoted ? (
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${percentage}%`,
                      backgroundColor: isSelected ? colors.accentSoft : colors.subtle,
                    },
                  ]}
                />
              ) : null}

              <View style={styles.optionContent}>
                <View style={styles.optionLeft}>
                  {isSelected ? (
                    <Icon name="check" color={colors.accent} size={16} />
                  ) : (
                    <View style={[styles.radioCircle, { borderColor: colors.secondary }]} />
                  )}
                  <Text
                    style={[
                      styles.optionLabel,
                      {
                        color: colors.text,
                        fontWeight: isSelected ? "700" : "500",
                      },
                    ]}
                  >
                    {option}
                  </Text>
                </View>

                {hasVoted ? (
                  <Text
                    style={[
                      styles.percentageText,
                      { color: isSelected ? colors.accent : colors.secondary },
                    ]}
                  >
                    {percentage}%
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pollTag: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pollTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.5,
  },
  totalVotesText: {
    fontSize: 12,
    fontWeight: "600",
  },
  questionText: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  optionsList: {
    gap: 8,
    marginTop: 2,
  },
  optionRow: {
    position: "relative",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 44,
    justifyContent: "center",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 0.85,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 1,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  optionLabel: {
    fontSize: 13,
    flex: 1,
  },
  percentageText: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 8,
  },
});
