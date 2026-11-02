import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppColors } from "../theme/colors";
import { formatAudioDuration } from "../lib/audio";
import { Icon } from "./Icon";

// Sample normalized heights for 24 waveform bars
const WAVEFORM_HEIGHTS = [
  8, 14, 22, 16, 28, 34, 20, 12, 26, 32, 18, 24, 30, 22, 14, 28, 36, 20, 16, 24,
  18, 12, 16, 10,
];

export function AudioPlayerCard({
  audioUrl,
  durationSeconds = 24,
}: {
  audioUrl: string;
  durationSeconds?: number;
}) {
  const colors = useAppColors();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const totalDuration = durationSeconds > 0 ? durationSeconds : 24;
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDuration) {
            clearInterval(timerRef.current);
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, totalDuration]);

  const togglePlay = () => {
    if (currentTime >= totalDuration) {
      setCurrentTime(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleScrub = (barIndex: number) => {
    const fraction = (barIndex + 1) / WAVEFORM_HEIGHTS.length;
    const targetTime = Math.round(fraction * totalDuration);
    setCurrentTime(targetTime);
  };

  const progressFraction = totalDuration > 0 ? currentTime / totalDuration : 0;
  const activeBarCount = Math.floor(progressFraction * WAVEFORM_HEIGHTS.length);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.subtle, borderColor: colors.border },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>🎙️ VOICE NOTE</Text>
        </View>
        <Text style={[styles.durationText, { color: colors.secondary }]}>
          {formatAudioDuration(currentTime)} / {formatAudioDuration(totalDuration)}
        </Text>
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause audio" : "Play audio"}
          onPress={togglePlay}
          style={[styles.playButton, { backgroundColor: colors.accent }]}
        >
          <Icon
            name={isPlaying ? "close" : "sparkles"}
            color="#FFFFFF"
            size={18}
          />
        </Pressable>

        {/* Waveform Visualization */}
        <View style={styles.waveformContainer}>
          {WAVEFORM_HEIGHTS.map((height, idx) => {
            const isBarActive = idx <= activeBarCount;
            return (
              <Pressable
                key={idx}
                onPress={() => handleScrub(idx)}
                hitSlop={4}
                style={styles.barTouchable}
              >
                <View
                  style={[
                    styles.bar,
                    {
                      height,
                      backgroundColor: isBarActive ? colors.accent : colors.border,
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 8,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tag: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1D4ED8",
    letterSpacing: 0.5,
  },
  durationText: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  waveformContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 38,
    paddingHorizontal: 4,
  },
  barTouchable: {
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 1,
  },
  bar: {
    width: 3.5,
    borderRadius: 2,
  },
});

