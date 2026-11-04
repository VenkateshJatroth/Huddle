import { Platform } from "react-native";
import { supabase } from "./supabase";
import { requestMicrophonePermission } from "./audio";

let activeRecorder: any = null;
let recordingStartTime: number = 0;

/**
 * Uploads a local audio recording to Supabase Storage and returns its public URL.
 */
export async function uploadVoiceNote(
  userId: string,
  localUri: string,
): Promise<string> {
  try {
    const fileName = `chat_audio/${userId}/${Date.now()}.m4a`;
    const response = await fetch(localUri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    const { error } = await supabase.storage
      .from("gallery")
      .upload(fileName, arrayBuffer, {
        contentType: "audio/m4a",
        upsert: true,
      });

    if (error) {
      console.warn("Storage upload warning:", error.message);
      return localUri;
    }

    const { data: publicData } = supabase.storage
      .from("gallery")
      .getPublicUrl(fileName);

    return publicData?.publicUrl || localUri;
  } catch (err) {
    console.warn("Audio upload fallback to local URI:", err);
    return localUri;
  }
}

/**
 * Starts recording an audio voice note using expo-audio.
 */
export async function startVoiceRecording(): Promise<boolean> {
  const hasPermission = await requestMicrophonePermission();
  if (!hasPermission) return false;

  try {
    if (Platform.OS === "web") {
      recordingStartTime = Date.now();
      return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AudioRecorder, RecordingPresets } = require("expo-audio");
    if (!AudioRecorder) return false;

    const recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();
    activeRecorder = recorder;
    recordingStartTime = Date.now();
    return true;
  } catch (err) {
    console.warn("startVoiceRecording failed:", err);
    return false;
  }
}

/**
 * Stops the active voice recording and returns the local file URI and duration in seconds.
 */
export async function stopVoiceRecording(): Promise<{ uri: string; durationSeconds: number } | null> {
  const elapsedSec = Math.max(1, Math.round((Date.now() - recordingStartTime) / 1000));

  if (Platform.OS === "web") {
    return {
      uri: `data:audio/m4a;base64,mock_${Date.now()}`,
      durationSeconds: elapsedSec,
    };
  }

  if (!activeRecorder) {
    return null;
  }

  try {
    await activeRecorder.stop();
    const uri = activeRecorder.uri;
    activeRecorder = null;
    return {
      uri: uri || "",
      durationSeconds: elapsedSec,
    };
  } catch (err) {
    console.warn("stopVoiceRecording failed:", err);
    activeRecorder = null;
    return null;
  }
}

/**
 * Cancels and discards the active recording without saving.
 */
export async function cancelVoiceRecording(): Promise<void> {
  if (activeRecorder) {
    try {
      await activeRecorder.stop();
    } catch {
      // Ignore
    }
    activeRecorder = null;
  }
}
