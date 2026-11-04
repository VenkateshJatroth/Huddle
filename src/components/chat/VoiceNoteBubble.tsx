import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../Icon";
import { formatAudioDuration } from "../../lib/audio";
import { resolveMediaUrl } from "../../lib/chatMedia";
import { useAppColors } from "../../theme/colors";

const WAVEFORM_BARS = [
  6, 12, 20, 16, 26, 30, 18, 10, 24, 28, 16, 22, 28, 20, 12, 26, 32, 18, 14, 22,
  16, 10, 14, 8,
];

export function VoiceNoteBubble({
  audioUrl,
  durationSeconds = 12,
  sent = true,
  timestamp,
  read = false,
  status,
  onRetry,
}: {
  audioUrl: string;
  durationSeconds?: number;
  sent?: boolean;
  timestamp?: string;
  read?: boolean;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  onRetry?: () => void;
}) {
  const colors = useAppColors();
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState(audioUrl);

  const playerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const totalDuration = Math.max(1, durationSeconds);

  // Resolve private signed URL if needed
  useEffect(() => {
    let active = true;
    void resolveMediaUrl(audioUrl).then((url) => {
      if (active && url) {
        setResolvedAudioUrl(url);
      }
    });
    return () => {
      active = false;
    };
  }, [audioUrl]);

  // Clean up player on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          if (typeof playerRef.current.remove === "function") {
            playerRef.current.remove();
          }
        } catch {
          // Non-blocking
        }
      }
    };
  }, []);

  const initPlayer = () => {
    if (playerRef.current) return playerRef.current;
    const targetUrl = resolvedAudioUrl || audioUrl;

    if (Platform.OS === "web") {
      try {
        const audio = new Audio(targetUrl);
        audio.onended = () => {
          setIsPlaying(false);
          setPositionSec(0);
          if (timerRef.current) clearInterval(timerRef.current);
        };
        playerRef.current = audio;
        return audio;
      } catch {
        return null;
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createAudioPlayer } = require("expo-audio");
      if (createAudioPlayer) {
        const player = createAudioPlayer(targetUrl, { updateInterval: 500 });
        player.playbackRate = speed;
        playerRef.current = player;
        return player;
      }
    } catch (err) {
      console.warn("createAudioPlayer failed:", err);
    }
    return null;
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (playerRef.current) {
        try {
          playerRef.current.pause();
        } catch {
          // Ignore
        }
      }
      setIsPlaying(false);
    } else {
      const player = initPlayer();
      if (player) {
        try {
          player.play();
        } catch {
          // Ignore
        }
      }
      setIsPlaying(true);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setPositionSec((prev) => {
          if (prev >= totalDuration) {
            clearInterval(timerRef.current);
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000 / speed);
    }
  };

  const handleCycleSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (playerRef.current) {
      try {
        if (Platform.OS === "web") {
          playerRef.current.playbackRate = nextSpeed;
        } else if (typeof playerRef.current.setPlaybackRate === "function") {
          playerRef.current.setPlaybackRate(nextSpeed);
        } else {
          playerRef.current.playbackRate = nextSpeed;
        }
      } catch {
        // Non-blocking
      }
    }
  };

  const progressFraction = Math.min(1, positionSec / totalDuration);
  const activeBarCount = Math.floor(progressFraction * WAVEFORM_BARS.length);

  const bubbleBg = sent ? colors.accent : colors.surface;
  const iconBg = sent ? "rgba(255, 255, 255, 0.2)" : colors.accentSoft;
  const iconColor = sent ? "#FFFFFF" : colors.accent;
  const activeBarColor = sent ? "#FFFFFF" : colors.accent;
  const inactiveBarColor = sent ? "rgba(255, 255, 255, 0.35)" : colors.border;
  const textColor = sent ? "rgba(255, 255, 255, 0.85)" : colors.secondary;
  const metaColor = sent ? "rgba(255, 255, 255, 0.7)" : colors.secondary;

  return (
    <View
      style={[
        styles.bubble,
        sent ? styles.bubbleSent : styles.bubbleReceived,
        { backgroundColor: bubbleBg, borderColor: sent ? "transparent" : colors.border },
      ]}
    >
      <View style={styles.topRow}>
        {/* Play/Pause Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause voice note" : "Play voice note"}
          onPress={handleTogglePlay}
          style={[styles.playBtn, { backgroundColor: iconBg }]}
          hitSlop={6}
        >
          <Icon name={isPlaying ? "pause" : "play"} color={iconColor} size={18} />
        </Pressable>

        {/* Waveform Visualization */}
        <View style={styles.waveformContainer}>
          {WAVEFORM_BARS.map((height, idx) => (
            <View
              key={idx}
              style={[
                styles.bar,
                {
                  height,
                  backgroundColor: idx <= activeBarCount ? activeBarColor : inactiveBarColor,
                },
              ]}
            />
          ))}
        </View>

        {/* Speed Pill */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${speed}x`}
          onPress={handleCycleSpeed}
          style={[styles.speedPill, { backgroundColor: iconBg }]}
          hitSlop={6}
        >
          <Text style={[styles.speedText, { color: iconColor }]}>{speed}x</Text>
        </Pressable>
      </View>

      {/* Meta Footer */}
      <View style={styles.bottomRow}>
        <Text style={[styles.durationText, { color: textColor }]}>
          {formatAudioDuration(positionSec)} / {formatAudioDuration(totalDuration)}
        </Text>

        <View style={styles.metaRight}>
          {timestamp ? (
            <Text style={[styles.timeText, { color: metaColor }]}>{timestamp}</Text>
          ) : null}
          {sent ? (
            status === "failed" ? (
              <Pressable onPress={onRetry} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Text style={[styles.checkText, { color: "#FFFFFF", fontWeight: "700" }]}>!</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 10, textDecorationLine: "underline" }}>Retry</Text>
              </Pressable>
            ) : status === "sending" ? (
              <Text style={[styles.checkText, { color: metaColor, fontSize: 10 }]}>⏳</Text>
            ) : status === "read" || read ? (
              <Text style={[styles.checkText, { color: "#4CD964", fontWeight: "700" }]}>✓✓</Text>
            ) : status === "delivered" ? (
              <Text style={[styles.checkText, { color: metaColor, fontWeight: "700" }]}>✓✓</Text>
            ) : (
              <Text style={[styles.checkText, { color: metaColor }]}>✓</Text>
            )
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: "84%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    marginVertical: 3,
  },
  bubbleSent: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  waveformContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    height: 34,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 4,
  },
  speedPill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  speedText: {
    fontSize: 11,
    fontWeight: "700",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  durationText: {
    fontSize: 11,
    fontWeight: "600",
  },
  metaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontSize: 10,
    fontWeight: "500",
  },
  checkText: {
    fontSize: 11,
    fontWeight: "700",
  },
});

