import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppColors } from "../theme/colors";
import { formatAudioDuration } from "../lib/audio";
import {
  cancelVoiceRecording,
  startVoiceRecording,
  stopVoiceRecording,
} from "../lib/voiceNotes";
import { Icon } from "./Icon";
import { AudioPlayerCard } from "./AudioPlayerCard";

export function AudioRecorderSection({
  audioUri,
  audioDuration,
  onAudioRecorded,
  onRemoveAudio,
}: {
  audioUri: string | null;
  audioDuration: number;
  onAudioRecorded: (uri: string, duration: number) => void;
  onRemoveAudio: () => void;
}) {
  const colors = useAppColors();
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const timerRef = useRef<any>(null);
  const secondsRef = useRef(0);

  const handleStopRecording = useCallback(async () => {
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const result = await stopVoiceRecording();
      const finalDuration = result?.durationSeconds || Math.max(1, secondsRef.current);
      const finalUri = result?.uri || `huddle-audio://${Date.now()}.m4a`;
      onAudioRecorded(finalUri, finalDuration);
    } catch {
      const fallbackDuration = Math.max(1, secondsRef.current);
      onAudioRecorded(`huddle-audio://${Date.now()}.m4a`, fallbackDuration);
    }
  }, [onAudioRecorded]);

  const handleStartRecording = useCallback(async () => {
    const granted = await startVoiceRecording();
    if (!granted) {
      Alert.alert(
        "Microphone Required",
        "Please allow microphone access in device settings to record voice notes.",
      );
      return;
    }
    secondsRef.current = 0;
    setRecordSeconds(0);
    setIsRecording(true);
  }, []);

  const handleDiscard = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await cancelVoiceRecording();
    setIsRecording(false);
    setRecordSeconds(0);
    onRemoveAudio();
  }, [onRemoveAudio]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setRecordSeconds(secondsRef.current);
        if (secondsRef.current >= 120) {
          handleStopRecording();
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, handleStopRecording]);

  if (audioUri) {
    return (
      <View style={styles.container}>
        <View style={styles.recordedHeader}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Attached Voice Note</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Discard voice note"
            onPress={handleDiscard}
            style={styles.discardBtn}
          >
            <Icon name="close" color={colors.accent} size={15} />
            <Text style={[styles.discardText, { color: colors.accent }]}>Remove</Text>
          </Pressable>
        </View>

        <AudioPlayerCard audioUrl={audioUri} durationSeconds={audioDuration} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isRecording ? (
        <View style={[styles.recordingBox, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}>
          <View style={styles.recDot} />
          <Text style={styles.recordingTimer}>{formatAudioDuration(recordSeconds)}</Text>
          <Text style={styles.recordingText}>Recording voice note…</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
            onPress={handleStopRecording}
            style={styles.stopButton}
          >
            <View style={styles.stopIcon} />
            <Text style={styles.stopButtonText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record voice note"
          onPress={() => { void handleStartRecording(); }}
          style={[styles.recordButton, { borderColor: colors.border, backgroundColor: colors.subtle }]}
        >
          <Icon name="sparkles" color={colors.accent} size={18} />
          <Text style={[styles.recordButtonText, { color: colors.text }]}>
            Record a Voice Note
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  recordedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  discardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  discardText: {
    fontSize: 12,
    fontWeight: "700",
  },
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  recordButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  recordingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  recDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#DC2626",
  },
  recordingTimer: {
    fontSize: 15,
    fontWeight: "800",
    color: "#DC2626",
    fontVariant: ["tabular-nums"],
  },
  recordingText: {
    fontSize: 13,
    color: "#7F1D1D",
    flex: 1,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#DC2626",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stopIcon: {
    width: 10,
    height: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  stopButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
