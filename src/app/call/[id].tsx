import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useAuth } from "../../auth/AuthProvider";
import { Icon } from "../../components/Icon";
import { Avatar } from "../../components/ui";
import { fetchMemberProfile, type GormatiProfile } from "../../lib/gormati-profiles";
import {
  subscribeToCall,
  updateCallStatus,
  type CallStatus,
  type CallType,
} from "../../lib/calling";

export default function CallScreen() {
  const { id, callId, type = "voice", incoming = "false" } = useLocalSearchParams<{
    id: string;
    callId?: string;
    type?: CallType;
    incoming?: string;
  }>();

  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [member, setMember] = useState<GormatiProfile | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("ringing");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(type === "video");
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  // Pulse animation for voice audio visualizer
  const [pulseAnim] = useState(() => new Animated.Value(1));

  const handleEndCall = useCallback(() => {
    if (callId) {
      void updateCallStatus(callId, "ended");
    }
    setCallStatus("ended");
    setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    }, 600);
  }, [callId]);

  // Load member profile
  useEffect(() => {
    let isCurrent = true;
    async function load() {
      if (!id) return;
      const data = await fetchMemberProfile(id);
      if (isCurrent && data) {
        setMember(data);
      }
    }
    void load();
    return () => {
      isCurrent = false;
    };
  }, [id]);

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

  // Pulsing animation loop for voice call avatar
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

  // Simulate remote connection after brief ringing if caller
  useEffect(() => {
    if (callStatus === "ringing" && incoming !== "true") {
      const connectTimer = setTimeout(() => {
        setCallStatus("connected");
        if (callId) {
          void updateCallStatus(callId, "connected");
        }
      }, 3500);
      return () => clearTimeout(connectTimer);
    }
  }, [callStatus, incoming, callId]);

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

  // Subscribe to live call updates if callId exists
  useEffect(() => {
    if (!callId) return;
    const unsub = subscribeToCall(callId, (session) => {
      if (session.status === "ended" || session.status === "declined") {
        setCallStatus(session.status);
        setTimeout(() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)");
        }, 1200);
      } else if (session.status === "connected") {
        setCallStatus("connected");
      }
    });
    return unsub;
  }, [callId]);

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

  const isVideo = type === "video";
  const memberName = member?.display_name || "GorMati Member";
  const memberHandle = member?.username ? `@${member.username}` : "";

  return (
    <View style={[styles.container, { backgroundColor: "#0A0A0C" }]}>
      {/* Video Call Background Viewport */}
      {isVideo && isVideoEnabled ? (
        <View style={styles.fullScreenVideo}>
          {member?.gallery_urls?.[0] || member?.avatar_url ? (
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
            {user?.user_metadata?.avatar_url ? (
              <Image
                source={{ uri: user.user_metadata.avatar_url }}
                style={styles.pipImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.pipPlaceholder}>
                <Text style={styles.pipText}>You</Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isFrontCamera ? "Switch to back camera" : "Switch to front camera"}
              onPress={() => setIsFrontCamera((prev) => !prev)}
              style={styles.pipFlipBtn}
              hitSlop={6}
            >
              <Icon name="photo" color="#FFFFFF" size={14} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Top Header Information Overlay */}
      <View style={[styles.headerOverlay, { paddingTop: Math.max(insets.top + 16, 28) }]}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>
            {isVideo ? "📹 HD Video Call" : "📞 Encrypted Voice Call"}
          </Text>
        </View>

        <Text style={styles.memberNameText} numberOfLines={1}>
          {memberName}
        </Text>
        {memberHandle ? <Text style={styles.memberHandleText}>{memberHandle}</Text> : null}

        <Text style={styles.statusText}>
          {callStatus === "ringing"
            ? incoming === "true"
              ? "Incoming call…"
              : "Ringing…"
            : callStatus === "connected"
            ? `Connected • ${formatTimer(callDuration)}`
            : "Call ended"}
        </Text>
      </View>

      {/* Center Voice Visualizer (When Voice Call or Video Disabled) */}
      {(!isVideo || !isVideoEnabled) && (
        <View style={styles.voiceCenter}>
          <View style={styles.avatarRingsWrap}>
            {callStatus === "connected" ? (
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    transform: [{ scale: pulseAnim }],
                    opacity: 0.25,
                  },
                ]}
              />
            ) : null}
            <View style={styles.avatarMainCircle}>
              <Avatar
                name={memberName}
                size={110}
                tone={1}
                imageSource={
                  member?.avatar_url ? { uri: member.avatar_url } : undefined
                }
              />
            </View>
          </View>

          {member?.location ? (
            <View style={styles.locationTag}>
              <Icon name="location" color="#A1A1AA" size={13} />
              <Text style={styles.locationTagText}>{member.location}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Bottom Controls Bar */}
      <View
        style={[
          styles.controlsBar,
          { paddingBottom: Math.max(insets.bottom + 20, 34) },
        ]}
      >
        {callStatus === "ringing" && incoming === "true" ? (
          // Incoming Answer / Decline Buttons
          <View style={styles.incomingRow}>
            <Pressable
              onPress={handleEndCall}
              style={[styles.callBtn, styles.declineBtn]}
              accessibilityLabel="Decline Call"
            >
              <Icon name="close" color="#FFFFFF" size={26} />
              <Text style={styles.btnLabel}>Decline</Text>
            </Pressable>

            <Pressable
              onPress={handleAcceptCall}
              style={[styles.callBtn, styles.answerBtn]}
              accessibilityLabel="Answer Call"
            >
              <Icon name="chat" color="#FFFFFF" size={26} />
              <Text style={styles.btnLabel}>Answer</Text>
            </Pressable>
          </View>
        ) : (
          // Active in-call controls
          <View style={styles.activeRow}>
            {/* Mute Button */}
            <Pressable
              onPress={() => setIsMuted((m) => !m)}
              style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
              accessibilityLabel={isMuted ? "Unmute Mic" : "Mute Mic"}
            >
              <Icon name="chat" color={isMuted ? "#EF4444" : "#FFFFFF"} size={22} />
              <Text style={styles.controlLabel}>{isMuted ? "Unmute" : "Mute"}</Text>
            </Pressable>

            {/* Video Toggle (If video call) */}
            {isVideo ? (
              <Pressable
                onPress={() => setIsVideoEnabled((v) => !v)}
                style={[styles.controlBtn, !isVideoEnabled && styles.controlBtnActive]}
                accessibilityLabel={isVideoEnabled ? "Turn Video Off" : "Turn Video On"}
              >
                <Icon name="photo" color={!isVideoEnabled ? "#EF4444" : "#FFFFFF"} size={22} />
                <Text style={styles.controlLabel}>{isVideoEnabled ? "Camera" : "Cam Off"}</Text>
              </Pressable>
            ) : null}

            {/* Speaker Toggle */}
            <Pressable
              onPress={() => setIsSpeakerOn((s) => !s)}
              style={[styles.controlBtn, isSpeakerOn && styles.controlBtnSpeaker]}
              accessibilityLabel={isSpeakerOn ? "Speaker Off" : "Speaker On"}
            >
              <Icon name="bell" color="#FFFFFF" size={22} />
              <Text style={styles.controlLabel}>{isSpeakerOn ? "Speaker" : "Ear"}</Text>
            </Pressable>

            {/* End Call Button */}
            <Pressable
              onPress={handleEndCall}
              style={[styles.controlBtn, styles.endCallBtn]}
              accessibilityLabel="End Call"
            >
              <Icon name="close" color="#FFFFFF" size={24} />
              <Text style={styles.controlLabel}>End</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  fullScreenVideo: {
    ...StyleSheet.absoluteFill,
  },
  fullScreenVideoImage: {
    width: "100%",
    height: "100%",
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#18181B",
  },
  pipCard: {
    position: "absolute",
    right: 18,
    width: 104,
    height: 144,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    overflow: "hidden",
    backgroundColor: "#27272A",
    elevation: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 10,
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
  pipText: {
    color: "#A1A1AA",
    fontSize: 12,
    fontWeight: "700",
  },
  pipFlipBtn: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerOverlay: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 4,
  },
  typeBadgeText: {
    color: "#E4E4E7",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  memberNameText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  memberHandleText: {
    color: "#A1A1AA",
    fontSize: 13,
    fontWeight: "600",
  },
  statusText: {
    color: "#22C55E",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  voiceCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  avatarRingsWrap: {
    width: 170,
    height: 170,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pulseRing: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "#3B82F6",
  },
  avatarMainCircle: {
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  locationTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  locationTagText: {
    color: "#D4D4D8",
    fontSize: 12,
    fontWeight: "600",
  },
  controlsBar: {
    paddingHorizontal: 24,
    zIndex: 10,
  },
  incomingRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
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
    backgroundColor: "#DC2626",
  },
  answerBtn: {
    backgroundColor: "#16A34A",
  },
  btnLabel: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  activeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(24, 24, 27, 0.85)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  controlBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.12)",
    gap: 2,
  },
  controlBtnActive: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  controlBtnSpeaker: {
    backgroundColor: "rgba(59, 130, 246, 0.35)",
  },
  endCallBtn: {
    backgroundColor: "#DC2626",
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  controlLabel: {
    color: "#E4E4E7",
    fontSize: 9,
    fontWeight: "700",
  },
});
