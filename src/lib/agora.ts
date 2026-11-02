import { Platform } from "react-native";
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  IRtcEngine,
  IRtcEngineEventHandler,
  RtcSurfaceView,
} from "react-native-agora";

// Default test Agora App ID (can be overridden via EXPO_PUBLIC_AGORA_APP_ID)
export const AGORA_APP_ID =
  process.env.EXPO_PUBLIC_AGORA_APP_ID || "aab8b8f392b44d9f9576c9a35e076632";

export const isAgoraSupported = Platform.OS === "android" || Platform.OS === "ios";

export {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  RtcSurfaceView,
};

export type { IRtcEngine, IRtcEngineEventHandler };

/**
 * Generates a clean channel ID for a 1-on-1 Huddle call.
 */
export function generateCallChannelId(callId: string): string {
  // Agora channel IDs support alphanumeric, underscores, hyphens up to 64 chars
  const sanitized = callId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  return `huddle_${sanitized}`;
}

