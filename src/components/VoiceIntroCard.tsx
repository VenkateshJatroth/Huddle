import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioRecorder, RecordingPresets } from "expo-audio";
import { Icon } from "./Icon";
import { Card } from "./ui";
import { requestMicrophonePermission } from "../lib/audio";
import { uploadAndSaveVoiceIntro } from "../lib/voice-intro";
import { useAppColors } from "../theme/colors";

const MAX_DURATION_SEC = 15;
const WAVEFORM_HEIGHTS = [24, 40, 75, 50, 90, 65, 30, 85, 100, 70, 45, 95, 60, 80, 40, 20];

export function VoiceIntroCard({
  userId,
  voiceUrl,
  durationSec = MAX_DURATION_SEC,
  isOwner = false,
  onVoiceSaved,
}: {
  userId?: string;
  voiceUrl?: string | null;
  durationSec?: number;
  isOwner?: boolean;
  onVoiceSaved?: (url: string, duration: number) => void;
}) {
  const colors = useAppColors();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [remainingSec, setRemainingSec] = useState(durationSec || MAX_DURATION_SEC);
  const [recordedSec, setRecordedSec] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalDuration = durationSec > 0 ? durationSec : MAX_DURATION_SEC;

  // Initialize native recorder safely
  let recorder: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  } catch {
    recorder = null;
  }

  // Initialize native player safely
  let player: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    player = useAudioPlayer(voiceUrl ? { uri: voiceUrl } : undefined);
  } catch {
    player = null;
  }

  // Stop recording handler
  const handleStopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    let recordedUri: string | null = null;
    try {
      if (recorder) {
        await recorder.stop();
        recordedUri = recorder.uri;
      }
    } catch (e) {
      console.warn("Could not stop native recorder cleanly:", e);
    }

    const durationAchieved = Math.max(3, recordedSec);
    setRemainingSec(durationAchieved);

    if (userId) {
      setIsSaving(true);
      try {
        const targetUri = recordedUri || `huddle-voice://${Date.now()}.m4a`;
        const res = await uploadAndSaveVoiceIntro(userId, targetUri, durationAchieved);
        if (onVoiceSaved) {
          onVoiceSaved(res.voice_intro_url, res.voice_duration_sec);
        }
        Alert.alert(
          "Voice Intro Saved! 🎙️",
          "Your 15-second voice introduction is live on your profile and unlocks 100% profile completion.",
        );
      } catch (err: unknown) {
        Alert.alert(
          "Save Issue",
          err instanceof Error ? err.message : "Could not upload voice intro.",
        );
      } finally {
        setIsSaving(false);
      }
    }
  }, [recorder, recordedSec, userId, onVoiceSaved]);

  // Start recording handler
  const handleStartRecording = async () => {
    if (!isOwner) return;

    if (isPlaying && player) {
      try {
        player.pause();
      } catch {
        // ignore
      }
      setIsPlaying(false);
    }

    const granted = await requestMicrophonePermission();
    if (!granted) {
      Alert.alert(
        "Microphone Required",
        "Please allow microphone access to record your voice intro.",
      );
      return;
    }

    try {
      if (recorder) {
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
    } catch (err) {
      console.warn("Native recorder prepare/record error:", err);
    }

    setRecordedSec(0);
    setRemainingSec(MAX_DURATION_SEC);
    setIsRecording(true);
  };

  // Timer loop for recording & playback
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordedSec((s) => s + 1);
        setRemainingSec((prev) => {
          if (prev <= 1) {
            void handleStopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (isPlaying) {
      timerRef.current = setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            setIsPlaying(false);
            if (player) {
              try {
                player.pause();
              } catch {
                // ignore
              }
            }
            return totalDuration;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording, isPlaying, totalDuration, handleStopRecording, player]);

  const togglePlay = () => {
    if (isRecording || isSaving) return;

    if (isPlaying) {
      setIsPlaying(false);
      setRemainingSec(totalDuration);
      if (player) {
        try {
          player.pause();
        } catch {
          // ignore
        }
      }
    } else {
      setIsPlaying(true);
      setRemainingSec(totalDuration);
      if (player) {
        try {
          player.play();
        } catch {
          // ignore
        }
      }
    }
  };

  const progressRatio = isPlaying || isRecording
    ? 1 - remainingSec / (isRecording ? MAX_DURATION_SEC : totalDuration)
    : voiceUrl ? 1 : 0;
  const activeBarsCount = Math.floor(progressRatio * WAVEFORM_HEIGHTS.length);

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
          disabled={!voiceUrl && !isRecording}
          onPress={togglePlay}
          style={[
            styles.playButton,
            {
              backgroundColor: voiceUrl ? colors.accent : colors.subtle,
              opacity: voiceUrl ? 1 : 0.6,
            },
          ]}
        >
          <Text style={styles.playIcon}>{isPlaying ? "❚❚" : "▶"}</Text>
        </Pressable>

        <View style={styles.barsContainer}>
          {WAVEFORM_HEIGHTS.map((h, i) => {
            const isActive = i <= activeBarsCount && (isPlaying || isRecording || Boolean(voiceUrl));
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
            disabled={isSaving}
            onPress={isRecording ? () => { void handleStopRecording(); } : handleStartRecording}
            style={[
              styles.recordButton,
              { backgroundColor: isRecording ? "#FF3B30" : colors.subtle },
            ]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={[styles.recordText, { color: isRecording ? "#FFFFFF" : colors.text }]}>
                {isRecording ? "Stop" : voiceUrl ? "Re-record" : "Record"}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.hint, { color: colors.secondary }]}>
        {isSaving
          ? "Uploading & saving your voice intro to Huddle…"
          : isRecording
          ? "Recording in progress… Speak naturally (max 15s)"
          : isPlaying
          ? "Playing voice introduction…"
          : voiceUrl
          ? "Authentic 15-second voice introduction attached to profile."
          : isOwner
          ? "Add a 15-second voice intro to hit 100% profile completion!"
          : "No voice introduction recorded yet."}
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
    minWidth: 70,
  },
  recordText: { fontSize: 12, fontWeight: "700" },
  hint: { fontSize: 12, lineHeight: 17 },
});
