import React from "react";
import { PermissionsAndroid, Platform, View, type ViewProps } from "react-native";
import { setAudioModeAsync } from "expo-audio";
import type {
  MediaStream as WebRTCMediaStream,
  MediaStreamTrack as WebRTCMediaStreamTrack,
  RTCIceCandidate as WebRTCIceCandidate,
  RTCPeerConnection as WebRTCPeerConnection,
  RTCSessionDescription as WebRTCSessionDescription,
  RTCVideoViewProps,
} from "react-native-webrtc";

import {
  getWebRTCConfiguration,
  type RTCIceServerConfig,
} from "./turnService";

export type { RTCIceServerConfig };

// Baseline fallback STUN servers
const DEFAULT_STUN_SERVERS: RTCIceServerConfig[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "stun:stun.cloudflare.com:3478",
    ],
  },
];

export const rtcConfig = {
  iceServers: DEFAULT_STUN_SERVERS,
  iceCandidatePoolSize: 10,
};

export const PEER_CONNECTION_CONFIG = rtcConfig;

/**
 * Dynamically resolves ICE & TURN configuration, fetching short-lived credentials.
 */
export async function getPeerConnectionConfig(options?: {
  relayOnly?: boolean;
}) {
  return await getWebRTCConfiguration(options);
}

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
    await setAudioModeAsync({
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
    await setAudioModeAsync({
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

/**
 * Requests device microphone and camera permissions required for calls.
 */
export async function requestCallingPermissions(video: boolean = false): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      const perms: any[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      if (video) {
        perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }
      const results = await PermissionsAndroid.requestMultiple(perms);
      const audioGranted = results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
      const cameraGranted = !video || results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
      return audioGranted && cameraGranted;
    } catch (err) {
      console.warn("Failed to request Android calling permissions:", err);
      return false;
    }
  }
  return true;
}

// Fallback dummy component for RTCView when native binary is missing
function FallbackRTCView(props: ViewProps & { streamURL?: string; mirror?: boolean; objectFit?: string; zOrder?: number }) {
  return React.createElement(View, props);
}

// Safe native module loading with fallback for Web / older APKs
let nativeWebRTC: any = null;

if (Platform.OS === "web") {
  if (typeof window !== "undefined") {
    const w = window as any;
    if (w.RTCPeerConnection || w.webkitRTCPeerConnection) {
      nativeWebRTC = {
        RTCPeerConnection: w.RTCPeerConnection || w.webkitRTCPeerConnection,
        RTCIceCandidate: w.RTCIceCandidate,
        RTCSessionDescription: w.RTCSessionDescription,
        MediaStream: w.MediaStream,
        mediaDevices: typeof navigator !== "undefined" ? navigator.mediaDevices : null,
        RTCView: FallbackRTCView,
      };
    }
  }
} else {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeWebRTC = require("react-native-webrtc");
  } catch (err) {
    console.warn("react-native-webrtc is not available in this environment:", err);
  }
}

export const isWebRTCSupported = Boolean(
  nativeWebRTC && typeof nativeWebRTC.RTCPeerConnection === "function",
);

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
  // First ensure runtime permissions on Android
  await requestCallingPermissions(video);

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

