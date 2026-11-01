import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { Card } from "./ui";
import { useAppColors } from "../theme/colors";

export function VoiceIntroCard({
  voiceUrl,
  durationSec = 15,
  isOwner = false,
  onRecordNew,
}: {
  voiceUrl?: string | null;
  durationSec?: number;
  isOwner?: boolean;
  onRecordNew?: () => void;
}) {
  const colors = useAppColors();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [remainingSec, setRemainingSec] = useState(durationSec);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsPlaying(false);
            return durationSec;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (isRecording) {
      intervalRef.current = setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsRecording(false);
            if (onRecordNew) onRecordNew();
            return durationSec;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, isRecording, durationSec, onRecordNew]);

  const togglePlay = () => {
    if (isRecording) return;
    if (isPlaying) {
      setIsPlaying(false);
      setRemainingSec(durationSec);
    } else {
      setIsPlaying(true);
      setRemainingSec(durationSec);
    }
  };

  const toggleRecord = () => {
    if (isPlaying) setIsPlaying(false);
    if (isRecording) {
      setIsRecording(false);
      setRemainingSec(durationSec);
      if (onRecordNew) onRecordNew();
    } else {
      setIsRecording(true);
      setRemainingSec(durationSec);
    }
  };

  // Mock waveform bars heights (percentages)
  const waveformHeights = [24, 40, 75, 50, 90, 65, 30, 85, 100, 70, 45, 95, 60, 80, 40, 20];
  const progressRatio = isPlaying || isRecording ? 1 - remainingSec / durationSec : 0;
  const activeBarsCount = Math.floor(progressRatio * waveformHeights.length);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Icon name="sparkles" color={colors.accent} size={16} />
          <Text style={[styles.title, { color: colors.text }]}>Voice Introduction</Text>
        </View>
        <Text style={[styles.timer, { color: colors.secondary }]}>
          00:{remainingSec < 10 ? `0${remainingSec}` : remainingSec}
        </Text>
      </View>

      <View style={styles.waveformRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause voice intro" : "Play voice intro"}
          onPress={togglePlay}
          style={[styles.playButton, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.playIcon}>{isPlaying ? "❚❚" : "▶"}</Text>
        </Pressable>

        <View style={styles.barsContainer}>
          {waveformHeights.map((h, i) => {
            const isActive = i <= activeBarsCount && (isPlaying || isRecording);
            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: `${h}%`,
                    backgroundColor: isActive ? colors.accent : colors.border,
                  },
                ]}
              />
            );
          })}
        </View>

        {isOwner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isRecording ? "Stop recording" : "Record voice intro"}
            onPress={toggleRecord}
            style={[
              styles.recordButton,
              { backgroundColor: isRecording ? "#FF3B30" : colors.subtle },
            ]}
          >
            <Text style={[styles.recordText, { color: isRecording ? "#FFFFFF" : colors.text }]}>
              {isRecording ? "Stop" : voiceUrl ? "Re-record" : "Record"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.hint, { color: colors.secondary }]}>
        {isRecording
          ? "Recording in progress… Speak naturally (15 seconds)"
          : isPlaying
          ? "Playing voice introduction…"
          : voiceUrl || !isOwner
          ? "Tap play to hear member’s authentic 15-second voice introduction."
          : "Add an authentic 15-second voice note to let your community hear you."}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  timer: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  waveformRow: { flexDirection: "row", alignItems: "center", gap: 12, height: 44 },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", marginLeft: 2 },
  barsContainer: {
    flex: 1,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 3,
  },
  bar: { flex: 1, borderRadius: 2, minWidth: 3 },
  recordButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  recordText: { fontSize: 12, fontWeight: "700" },
  hint: { fontSize: 12, lineHeight: 17 },
});

