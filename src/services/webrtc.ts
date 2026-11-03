import React from "react";
import { Platform, View, type ViewProps } from "react-native";
import { Audio } from "expo-av";
import { setAudioModeAsync as setExpoAudioModeAsync } from "expo-audio";
import type {
  MediaStream as WebRTCMediaStream,
  MediaStreamTrack as WebRTCMediaStreamTrack,
  RTCIceCandidate as WebRTCIceCandidate,
  RTCPeerConnection as WebRTCPeerConnection,
  RTCSessionDescription as WebRTCSessionDescription,
  RTCVideoViewProps,
} from "react-native-webrtc";

export type RTCIceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

// Multi-tier ICE Server Configuration (STUN + TURN Relays)
export function getIceServers(): RTCIceServerConfig[] {
  const customTurnUrl = process.env.EXPO_PUBLIC_TURN_URL;
  const customTurnUsername = process.env.EXPO_PUBLIC_TURN_USERNAME;
  const customTurnCredential = process.env.EXPO_PUBLIC_TURN_CREDENTIAL;

  const servers: RTCIceServerConfig[] = [
    // Tier 1: High-reliability Google & Cloudflare STUN servers
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
      ],
    },
  ];

  // Tier 2: Custom TURN relay server if configured via environment variables
  if (customTurnUrl && customTurnUsername && customTurnCredential) {
    servers.push({
      urls: customTurnUrl.split(",").map((u) => u.trim()),
      username: customTurnUsername,
      credential: customTurnCredential,
    });
  }

  // Tier 3: High-availability OpenRelay / Metered TURN fallback configuration
  // Supports UDP, TCP (Port 80 to bypass HTTP firewalls), and TURNS/TLS (Port 443 to bypass DPI firewalls)
  servers.push(
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:80?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  );

  return servers;
}

export const rtcConfig = {
  iceServers: getIceServers(),
  iceCandidatePoolSize: 10,
};

export const PEER_CONNECTION_CONFIG = rtcConfig;

/**
 * Triggers an ICE restart on an active RTCPeerConnection if supported.
 */
export function restartPeerIce(pc: any): boolean {
  if (!pc) return false;
  try {
    if (typeof pc.restartIce === "function") {
      pc.restartIce();
      return true;
    }
  } catch (err) {
    console.warn("Error calling pc.restartIce():", err);
  }
  return false;
}

/**
 * Pre-configures audio routing for WebRTC voice and video calls.
 * Routes audio through loudspeaker by default and prevents mute in silent mode.
 */
export async function configureAudioSessionForCall(speakerOn: boolean = true): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      playThroughEarpieceAndroid: !speakerOn,
      shouldDuckAndroid: true,
    });
  } catch (err) {
    console.warn("expo-av setAudioModeAsync warning:", err);
  }

  try {
    await setExpoAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: !speakerOn,
      interruptionMode: "duckOthers",
    });
  } catch (err) {
    console.warn("expo-audio setAudioModeAsync warning:", err);
  }
}

/**
 * Resets audio session back to normal media playback mode upon call completion.
 */
export async function resetAudioSession(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // Guard
  }

  try {
    await setExpoAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: "mixWithOthers",
    });
  } catch {
    // Guard
  }
}

// Safe native module loading with fallback for Web / older APKs
let nativeWebRTC: typeof import("react-native-webrtc") | null = null;

try {
  if (Platform.OS !== "web") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeWebRTC = require("react-native-webrtc");
  }
} catch (err) {
  console.warn("react-native-webrtc is not available in this environment:", err);
}

export const isWebRTCSupported = Boolean(
  nativeWebRTC && typeof nativeWebRTC.RTCPeerConnection === "function",
);

// Fallback dummy component for RTCView when native binary is missing
function FallbackRTCView(props: ViewProps & { streamURL?: string; mirror?: boolean; objectFit?: string; zOrder?: number }) {
  return React.createElement(View, props);
}

export const RTCPeerConnection = nativeWebRTC?.RTCPeerConnection ?? (class {} as unknown as typeof WebRTCPeerConnection);
export const RTCIceCandidate = nativeWebRTC?.RTCIceCandidate ?? (class {} as unknown as typeof WebRTCIceCandidate);
export const RTCSessionDescription = nativeWebRTC?.RTCSessionDescription ?? (class {} as unknown as typeof WebRTCSessionDescription);
export const MediaStream = nativeWebRTC?.MediaStream ?? (class {} as unknown as typeof WebRTCMediaStream);
export const RTCView = (nativeWebRTC?.RTCView ?? FallbackRTCView) as React.ComponentType<RTCVideoViewProps>;
export const mediaDevices = nativeWebRTC?.mediaDevices ?? null;

export type { WebRTCMediaStream, WebRTCMediaStreamTrack };

/**
 * Acquires local audio and optional video media stream.
 */
export async function getLocalStream(video: boolean = false): Promise<WebRTCMediaStream | null> {
  if (!mediaDevices || !isWebRTCSupported) {
    console.warn("WebRTC mediaDevices unavailable on this platform.");
    return null;
  }

  try {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: video
        ? {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          }
        : false,
    });
    return stream;
  } catch (err) {
    console.warn("Failed to acquire local media stream:", err);
    // If video fails (e.g. camera busy), fallback to audio-only
    if (video) {
      try {
        return await mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (audioErr) {
        console.warn("Audio fallback also failed:", audioErr);
      }
    }
    return null;
  }
}

/**
 * Toggles audio track enabled state (mute/unmute microphone).
 */
export function toggleAudioTrack(stream: WebRTCMediaStream | null, enabled: boolean): void {
  if (!stream) return;
  stream.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

/**
 * Toggles video track enabled state (camera on/off).
 */
export function toggleVideoTrack(stream: WebRTCMediaStream | null, enabled: boolean): void {
  if (!stream) return;
  stream.getVideoTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

/**
 * Flips the active camera between front and back.
 */
export function switchCamera(stream: WebRTCMediaStream | null): void {
  if (!stream) return;
  stream.getVideoTracks().forEach((track) => {
    const anyTrack = track as unknown as { _switchCamera?: () => void };
    if (typeof anyTrack._switchCamera === "function") {
      anyTrack._switchCamera();
    }
  });
}

/**
 * Stops all tracks in a media stream and cleans up hardware locks.
 */
export function stopMediaStream(stream: WebRTCMediaStream | null): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    stream.release();
  } catch (err) {
    console.warn("Error while stopping media stream:", err);
  }
}

