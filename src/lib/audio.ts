import { Platform } from "react-native";

export type AudioRecordingResult = {
  uri: string;
  durationSeconds: number;
};

// Check if expo-audio native module is available
let expoAudioModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expoAudioModule = require("expo-audio");
} catch {
  expoAudioModule = null;
}

export function isAudioModuleAvailable(): boolean {
  return Boolean(expoAudioModule);
}

/**
 * Requests microphone permission if native module is installed.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  if (expoAudioModule?.requestRecordingPermissionsAsync) {
    try {
      const res = await expoAudioModule.requestRecordingPermissionsAsync();
      return Boolean(res?.granted);
    } catch {
      return true;
    }
  }

  return true;
}

/**
 * Formats seconds into M:SS display.
 */
export function formatAudioDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}
