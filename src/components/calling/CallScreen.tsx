import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useAuth } from "../../auth/AuthProvider";
import { Icon } from "../Icon";
import { Avatar } from "../ui";
import { fetchMemberProfile, type GormatiProfile } from "../../lib/gormati-profiles";
import {
  subscribeToCall,
  updateCallStatus,
  type CallStatus,
  type CallType,
} from "../../lib/calling";
import {
  AGORA_APP_ID,
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  generateCallChannelId,
  isAgoraSupported,
  RtcSurfaceView,
  type IRtcEngine,
} from "../../lib/agora";

export type CallScreenProps = {
  memberId: string;
  callId?: string;
  callType?: CallType;
  isIncoming?: boolean;
  channelId?: string;
  agoraToken?: string;
  onCallEnd?: () => void;
};

export function CallScreen({
  memberId,
  callId,
  callType = "voice",
  isIncoming = false,
  channelId: initialChannelId,
  agoraToken = "",
  onCallEnd,
}: CallScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [member, setMember] = useState<GormatiProfile | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>(isIncoming ? "ringing" : "ringing");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === "video");
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  // Agora State
  const [isJoined, setIsJoined] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const engineRef = useRef<IRtcEngine | null>(null);

  // Animation for voice visualizer
  const [pulseAnim] = useState(() => new Animated.Value(1));

  const resolvedChannelId =
    initialChannelId || generateCallChannelId(callId || `call_${memberId}`);

  // Safe navigation back / cleanup
  const handleEndCall = useCallback(() => {
    try {
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
    } catch {
      // Guard against double release
    }

    if (callId) {
      void updateCallStatus(callId, "ended");
    }
    setCallStatus("ended");

    if (onCallEnd) {
      onCallEnd();
    } else {
      setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)");
        }
      }, 500);
    }
  }, [callId, onCallEnd]);

  // Load target member profile
  useEffect(() => {
    let isCurrent = true;
    async function load() {
      if (!memberId) return;
      const data = await fetchMemberProfile(memberId);
      if (isCurrent && data) {
        setMember(data);
      }
    }
    void load();
    return () => {
      isCurrent = false;
    };
  }, [memberId]);

  // Handle hardware back press cleanly
  useEffect(() => {
    const onBackPress = () => {
      if (callStatus === "connected") {
        Alert.alert("End Call?", "Do you want to end the current call?", [
          { text: "Stay", style: "cancel" },
          { text: "End Call", style: "destructive", onPress: handleEndCall },
        ]);
      } else {
        handleEndCall();
      }
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [callStatus, handleEndCall]);

  // Pulsing animation for audio visualizer
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Duration timer while connected
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (callStatus === "connected") {
      interval = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus]);

  // Initialize Agora RTC Engine when call starts
  useEffect(() => {
    if (!isAgoraSupported || !AGORA_APP_ID) return;

    let isMounted = true;

    try {
      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId: AGORA_APP_ID,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      engine.registerEventHandler({
        onJoinChannelSuccess: (_connection, _elapsed) => {
          if (!isMounted) return;
          setIsJoined(true);
        },
        onUserJoined: (_connection, uid, _elapsed) => {
          if (!isMounted) return;
          setRemoteUid(uid);
          setCallStatus("connected");
        },
        onUserOffline: (_connection, _uid, _reason) => {
          if (!isMounted) return;
          setRemoteUid(null);
          handleEndCall();
        },
        onError: (err, msg) => {
          console.warn("Agora RTC Engine Error:", err, msg);
        },
      });

      if (callType === "video") {
        engine.enableVideo();
        engine.startPreview();
      } else {
        engine.enableAudio();
      }

      engine.setEnableSpeakerphone(isSpeakerOn);

      engine.joinChannel(agoraToken || "", resolvedChannelId, 0, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        publishMicrophoneTrack: true,
        publishCameraTrack: callType === "video",
        autoSubscribeAudio: true,
        autoSubscribeVideo: callType === "video",
      });
    } catch (err) {
      console.warn("Failed to initialize Agora RTC engine:", err);
    }

    return () => {
      isMounted = false;
      try {
        if (engineRef.current) {
          engineRef.current.leaveChannel();
          engineRef.current.release();
          engineRef.current = null;
        }
      } catch {
        // Safe guard
      }
    };
  }, [agoraToken, callType, resolvedChannelId, handleEndCall, isSpeakerOn]);

  // Subscribe to live call updates if callId exists
  useEffect(() => {
    if (!callId) return;
    const unsub = subscribeToCall(callId, (session) => {
      if (session.status === "ended" || session.status === "declined") {
        setCallStatus(session.status);
        setTimeout(() => {
          handleEndCall();
        }, 800);
      } else if (session.status === "connected") {
        setCallStatus("connected");
      }
    });
    return unsub;
  }, [callId, handleEndCall]);

  // Caller controls
  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      engineRef.current?.muteLocalAudioStream(next);
    } catch (e) {
      console.warn("Agora muteLocalAudioStream error:", e);
    }
  };

  const handleToggleVideo = () => {
    const next = !isVideoEnabled;
    setIsVideoEnabled(next);
    try {
      engineRef.current?.muteLocalVideoStream(!next);
      if (next) {
        engineRef.current?.enableVideo();
        engineRef.current?.startPreview();
      }
    } catch (e) {
      console.warn("Agora muteLocalVideoStream error:", e);
    }
  };

  const handleSwitchCamera = () => {
    try {
      engineRef.current?.switchCamera();
      setIsFrontCamera((prev) => !prev);
    } catch (e) {
      console.warn("Agora switchCamera error:", e);
    }
  };

  const handleToggleSpeaker = () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    try {
      engineRef.current?.setEnableSpeakerphone(next);
    } catch (e) {
      console.warn("Agora setEnableSpeakerphone error:", e);
    }
  };

  const handleAcceptCall = () => {
    if (callId) {
      void updateCallStatus(callId, "connected");
    }
    setCallStatus("connected");
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isVideo = callType === "video";
  const memberName = member?.display_name || "Huddle Member";
  const memberHandle = member?.username ? `@${member.username}` : "";

  return (
    <View style={[styles.container, { backgroundColor: "#0A0A0C" }]}>
      {/* Video Viewport (Remote Video or Fallback) */}
      {isVideo && isVideoEnabled ? (
        <View style={styles.fullScreenVideo}>
          {isAgoraSupported && remoteUid !== null ? (
            <RtcSurfaceView
              style={styles.fullScreenVideo}
              canvas={{ uid: remoteUid }}
            />
          ) : member?.gallery_urls?.[0] || member?.avatar_url ? (
            <Image
              source={{ uri: member.gallery_urls?.[0] || member.avatar_url || "" }}
              style={styles.fullScreenVideoImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.videoPlaceholder}>
              <Avatar name={memberName} size={120} tone={1} />
            </View>
          )}

          {/* Floating Self View (Picture in Picture) */}
          <View style={[styles.pipCard, { top: insets.top + 50 }]}>
            {isAgoraSupported ? (
              <RtcSurfaceView
                style={styles.pipVideo}
                canvas={{ uid: 0 }}
                zOrderMediaOverlay={true}
              />
            ) : user?.user_metadata?.avatar_url ? (
              <Image
                source={{ uri: user.user_metadata.avatar_url }}
                style={styles.pipImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.pipPlaceholder}>
                <Icon name="person" color="#FFFFFF" size={24} />
              </View>
            )}
          </View>
        </View>
      ) : (
        /* Voice Call Viewport */
        <View style={styles.voiceViewport}>
          {/* Animated Glow Rings */}
          <Animated.View
            style={[
              styles.avatarRingOuter,
              {
                transform: [{ scale: pulseAnim }],
                opacity: callStatus === "connected" ? 0.35 : 0.15,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.avatarRingInner,
              {
                transform: [{ scale: pulseAnim }],
                opacity: callStatus === "connected" ? 0.55 : 0.25,
              },
            ]}
          />

          <View style={styles.avatarWrapper}>
            {member?.avatar_url ? (
              <Image source={{ uri: member.avatar_url }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Avatar name={memberName} size={128} tone={1} />
            )}
          </View>
        </View>
      )}

      {/* Top Header Overlay: Member info & Duration */}
      <View style={[styles.topHeader, { top: insets.top + 16 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back / Minimize"
          onPress={handleEndCall}
          style={styles.iconCircle}
        >
          <Icon name="chevronLeft" color="#FFFFFF" size={20} />
        </Pressable>

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {memberName}
          </Text>
          {memberHandle ? <Text style={styles.headerHandle}>{memberHandle}</Text> : null}
        </View>

        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  callStatus === "connected" ? "#10B981" : callStatus === "ended" ? "#EF4444" : "#F59E0B",
              },
            ]}
          />
          <Text style={styles.statusText}>
            {callStatus === "connected"
              ? `${formatTimer(callDuration)}${isJoined ? " · Agora P2P" : ""}`
              : callStatus === "ringing"
                ? isIncoming
                  ? "Incoming..."
                  : "Ringing..."
                : callStatus === "declined"
                  ? "Declined"
                  : "Call Ended"}
          </Text>
        </View>
      </View>

      {/* Connection Indicator Overlay if ringing */}
      {callStatus === "ringing" && !isIncoming ? (
        <View style={styles.ringingOverlay}>
          <ActivityIndicator color="#FFFFFF" size="small" />
          <Text style={styles.ringingText}>Connecting securely via Agora P2P…</Text>
        </View>
      ) : null}

      {/* Bottom Floating Control Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        {/* Incoming Call Answer/Decline Actions */}
        {isIncoming && callStatus === "ringing" ? (
          <View style={styles.incomingActionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decline Call"
              onPress={() => {
                if (callId) void updateCallStatus(callId, "declined");
                handleEndCall();
              }}
              style={[styles.callBtn, styles.declineBtn]}
            >
              <Icon name="close" color="#FFFFFF" size={28} />
              <Text style={styles.btnLabel}>Decline</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Answer Call"
              onPress={handleAcceptCall}
              style={[styles.callBtn, styles.answerBtn]}
            >
              <Icon name="sparkles" color="#FFFFFF" size={28} />
              <Text style={styles.btnLabel}>Answer</Text>
            </Pressable>
          </View>
        ) : (
          /* Active Call Controls */
          <View style={styles.activeControlsRow}>
            {/* Audio Mute Toggle */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isMuted ? "Unmute" : "Mute"}
              onPress={handleToggleMute}
              style={[styles.controlCircle, isMuted && styles.controlCircleActive]}
            >
              <Icon name="phone" color="#FFFFFF" size={22} />
              <Text style={styles.controlLabel}>{isMuted ? "Unmute" : "Mute"}</Text>
            </Pressable>

            {/* Video Toggle */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isVideoEnabled ? "Turn Video Off" : "Turn Video On"}
              onPress={handleToggleVideo}
              style={[styles.controlCircle, !isVideoEnabled && styles.controlCircleActive]}
            >
              <Icon name="video" color="#FFFFFF" size={22} />
              <Text style={styles.controlLabel}>{isVideoEnabled ? "Video On" : "Video Off"}</Text>
            </Pressable>

            {/* Flip Camera (if video active) */}
            {isVideo && isVideoEnabled ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch Camera"
                onPress={handleSwitchCamera}
                style={styles.controlCircle}
              >
                <Icon name="chevronRight" color="#FFFFFF" size={22} />
                <Text style={styles.controlLabel}>{isFrontCamera ? "Front" : "Back"}</Text>
              </Pressable>
            ) : null}

            {/* Speakerphone Toggle */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSpeakerOn ? "Speaker Off" : "Speaker On"}
              onPress={handleToggleSpeaker}
              style={[styles.controlCircle, isSpeakerOn && styles.controlCircleActive]}
            >
              <Icon name="bell" color="#FFFFFF" size={22} />
              <Text style={styles.controlLabel}>{isSpeakerOn ? "Speaker" : "Earpiece"}</Text>
            </Pressable>

            {/* End Call / Hang Up */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End Call"
              onPress={handleEndCall}
              style={[styles.controlCircle, styles.hangupCircle]}
            >
              <Icon name="close" color="#FFFFFF" size={26} />
              <Text style={styles.controlLabel}>End</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: "relative" },
  fullScreenVideo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000000",
  },
  fullScreenVideoImage: {
    width: "100%",
    height: "100%",
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pipCard: {
    position: "absolute",
    right: 18,
    width: 104,
    height: 148,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "#16161A",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  pipVideo: {
    width: "100%",
    height: "100%",
  },
  pipImage: {
    width: "100%",
    height: "100%",
  },
  pipPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceViewport: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRingOuter: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#F43F5E",
  },
  avatarRingInner: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#F43F5E",
  },
  avatarWrapper: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1C1C22",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  topHeader: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  headerHandle: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 12,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  ringingOverlay: {
    position: "absolute",
    top: "38%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    zIndex: 9,
  },
  ringingText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  incomingActionsRow: {
    flexDirection: "row",
    gap: 36,
  },
  callBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  declineBtn: {
    backgroundColor: "#EF4444",
  },
  answerBtn: {
    backgroundColor: "#10B981",
  },
  btnLabel: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  activeControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(18, 18, 22, 0.85)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  controlCircle: {
    alignItems: "center",
    justifyContent: "center",
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  controlCircleActive: {
    backgroundColor: "#F43F5E",
  },
  hangupCircle: {
    backgroundColor: "#EF4444",
  },
  controlLabel: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "600",
    marginTop: 2,
  },
});

