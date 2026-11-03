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
import { dismissIncomingCallNotification } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import {
  configureAudioSessionForCall,
  getLocalStream,
  isWebRTCSupported,
  MediaStream,
  PEER_CONNECTION_CONFIG,
  resetAudioSession,
  restartPeerIce,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
  stopMediaStream,
  switchCamera,
  toggleAudioTrack,
  toggleVideoTrack,
  type WebRTCMediaStream as MediaStreamType,
} from "../../services/webrtc";

export type CallScreenProps = {
  memberId: string;
  callId?: string;
  callType?: CallType;
  isIncoming?: boolean;
  channelId?: string;
  onCallEnd?: () => void;
};

export function CallScreen({
  memberId,
  callId,
  callType = "voice",
  isIncoming = false,
  channelId: _channelId,
  onCallEnd,
}: CallScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [member, setMember] = useState<GormatiProfile | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("ringing");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === "video");
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const isSpeakerOnRef = useRef(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  useEffect(() => {
    isSpeakerOnRef.current = isSpeakerOn;
  }, [isSpeakerOn]);

  // WebRTC Media Streams & Peer Connection
  const [localStream, setLocalStream] = useState<MediaStreamType | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStreamType | null>(null);
  const [isPeerConnected, setIsPeerConnected] = useState(false);

  const callStatusRef = useRef(callStatus);
  const isPeerConnectedRef = useRef(isPeerConnected);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    isPeerConnectedRef.current = isPeerConnected;
  }, [isPeerConnected]);

  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStreamType | null>(null);
  const remoteStreamRef = useRef<MediaStreamType | null>(null);
  const candidateQueueRef = useRef<any[]>([]);
  const signalingChannelRef = useRef<any>(null);
  const isEndingRef = useRef(false);
  const offerSentRef = useRef(false);

  // Pulse animation for voice audio visualizer
  const [pulseAnim] = useState(() => new Animated.Value(1));

  const resolvedCallId = callId || `call_${memberId}`;

  // Safe hangup / cleanup
  const handleEndCall = useCallback(() => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    // Dismiss any active call notification
    void dismissIncomingCallNotification();

    // Reset audio session mode to standard playback
    void resetAudioSession();

    // 1. Broadcast call-ended on WebRTC signaling channel
    try {
      if (signalingChannelRef.current) {
        void signalingChannelRef.current.send({
          type: "broadcast",
          event: "call-ended",
          payload: { callId: resolvedCallId, senderId: currentUserId },
        });
      }
    } catch {
      // Non-blocking
    }

    // 2. Stop local media stream hardware
    if (localStreamRef.current) {
      stopMediaStream(localStreamRef.current);
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;

    // 3. Close RTCPeerConnection
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // Guard
      }
      pcRef.current = null;
    }

    // 4. Update status in database
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
  }, [callId, currentUserId, onCallEnd, resolvedCallId]);

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

  // Initialize WebRTC Peer Connection & Supabase Realtime Broadcast Signaling
  useEffect(() => {
    let isMounted = true;
    isEndingRef.current = false;

    if (!isWebRTCSupported) {
      console.warn("WebRTC is not supported in this runtime environment.");
      return;
    }

    // 1. Join Supabase Realtime broadcast channel: call:<callId>
    const signalingChannel = supabase.channel(`call:${resolvedCallId}`, {
      config: { broadcast: { self: false } },
    });
    signalingChannelRef.current = signalingChannel;

    // 2. Instantiate RTCPeerConnection with Google STUN servers
    let pc: any = null;
    try {
      pc = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
      pcRef.current = pc;
    } catch (err) {
      console.warn("Failed to construct RTCPeerConnection:", err);
      return;
    }

    // 3. Listen for remote media tracks and bind to remote stream
    const handleRemoteTrack = (event: any) => {
      if (!isMounted) return;
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        setRemoteStream(event.streams[0]);
      } else if (event.track) {
        if (!remoteStreamRef.current) {
          try {
            remoteStreamRef.current = new MediaStream() as MediaStreamType;
          } catch {
            // Guard
          }
        }
        if (remoteStreamRef.current) {
          try {
            remoteStreamRef.current.addTrack(event.track);
            setRemoteStream(remoteStreamRef.current);
          } catch {
            // Guard
          }
        }
      }
      setCallStatus("connected");
      setIsPeerConnected(true);
    };

    pc.ontrack = handleRemoteTrack;
    pc.addEventListener("track", handleRemoteTrack);

    // 4. Listen for ICE candidates and broadcast to peer
    pc.addEventListener("icecandidate", (event: any) => {
      if (event.candidate) {
        signalingChannel.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: {
            candidate: event.candidate.toJSON(),
            senderId: currentUserId,
          },
        });
      }
    });

    // 5. Monitor peer connection state changes
    pc.addEventListener("connectionstatechange", () => {
      if (!isMounted) return;
      if (pc.connectionState === "connected") {
        setCallStatus("connected");
        setIsPeerConnected(true);
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        setIsPeerConnected(false);
      }
    });

    // 5b. Monitor ICE connection state & handle timeouts / automatic ICE restart
    let iceRestartAttempted = false;
    let iceDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleIceConnectionStateChange = () => {
      if (!isMounted) return;
      const iceState = pc.iceConnectionState;

      if (iceState === "connected" || iceState === "completed") {
        if (iceDisconnectTimer) {
          clearTimeout(iceDisconnectTimer);
          iceDisconnectTimer = null;
        }
        setCallStatus("connected");
        setIsPeerConnected(true);
      } else if (iceState === "disconnected") {
        setIsPeerConnected(false);
        // Wait 6 seconds for transient mobile network recovery before triggering ICE restart
        if (!iceDisconnectTimer) {
          iceDisconnectTimer = setTimeout(() => {
            if (!isMounted) return;
            const currentIce = pc.iceConnectionState;
            if (currentIce === "disconnected" || currentIce === "failed") {
              if (!iceRestartAttempted) {
                iceRestartAttempted = true;
                restartPeerIce(pc);
                if (!isIncoming) {
                  void initiateOffer({ iceRestart: true });
                }
              } else {
                Alert.alert(
                  "Call Disconnected",
                  "The connection was lost. Please check your network and try again.",
                  [{ text: "OK", onPress: () => handleEndCall() }],
                );
              }
            }
          }, 6000);
        }
      } else if (iceState === "failed") {
        setIsPeerConnected(false);
        if (!iceRestartAttempted) {
          iceRestartAttempted = true;
          restartPeerIce(pc);
          if (!isIncoming) {
            void initiateOffer({ iceRestart: true });
          }
        } else {
          Alert.alert(
            "Connection Failed",
            "Could not establish a direct or relayed peer connection. Please verify your internet connection.",
            [{ text: "OK", onPress: () => handleEndCall() }],
          );
        }
      }
    };

    pc.oniceconnectionstatechange = handleIceConnectionStateChange;
    pc.addEventListener("iceconnectionstatechange", handleIceConnectionStateChange);

    // 6. Register Realtime Signaling Event Listeners
    let callerReadyInterval: ReturnType<typeof setInterval> | null = null;
    let ringingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

    // Caller connection timeout (45s): notify caller if callee never answers
    if (!isIncoming) {
      ringingTimeoutTimer = setTimeout(() => {
        if (!isMounted) return;
        if (callStatusRef.current === "ringing" && !isPeerConnectedRef.current) {
          Alert.alert(
            "No Answer",
            "The recipient did not answer or the connection timed out. Please try again later.",
            [{ text: "OK", onPress: () => handleEndCall() }],
          );
        }
      }, 45000);
    }

    // Helper: guarantees local media stream is acquired, audio session is configured,
    // and all local audio/video tracks are bound to RTCPeerConnection before SDP creation
    const ensureLocalTracks = async () => {
      if (localStreamRef.current) return localStreamRef.current;
      await configureAudioSessionForCall(isSpeakerOnRef.current);
      const stream = await getLocalStream(callType === "video");
      if (stream && isMounted) {
        localStreamRef.current = stream;
        setLocalStream(stream);
        stream.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, stream);
          } catch (trackErr) {
            console.warn("Failed to add track to peer connection:", trackErr);
          }
        });
      }
      return stream;
    };

    const initiateOffer = async (options?: { iceRestart?: boolean }) => {
      if (!isMounted || !pc || isIncoming) return;
      if (offerSentRef.current && !options?.iceRestart) return;
      offerSentRef.current = true;
      try {
        await ensureLocalTracks();
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === "video",
          iceRestart: Boolean(options?.iceRestart),
        });
        await pc.setLocalDescription(offer);
        await signalingChannel.send({
          type: "broadcast",
          event: "sdp-offer",
          payload: {
            sdp: offer.sdp,
            type: offer.type,
            senderId: currentUserId,
          },
        });
      } catch (err) {
        console.warn("Failed to create & broadcast sdp-offer:", err);
        offerSentRef.current = false;
      }
    };

    const isAuthorizedSender = (senderId?: string) => {
      return Boolean(senderId && senderId === memberId);
    };

    signalingChannel
      // Receiver notifies Caller that peer is ready to receive offer
      .on("broadcast", { event: "peer-ready" }, async ({ payload }) => {
        if (!isMounted || !isAuthorizedSender(payload?.senderId)) return;
        if (!isIncoming) {
          if (callerReadyInterval) {
            clearInterval(callerReadyInterval);
            callerReadyInterval = null;
          }
          await initiateOffer();
        }
      })
      // Caller notifies room that caller is online waiting for receiver
      .on("broadcast", { event: "caller-ready" }, async ({ payload }) => {
        if (!isMounted || !isAuthorizedSender(payload?.senderId)) return;
        if (isIncoming) {
          // Immediately notify caller that receiver is ready
          void signalingChannel.send({
            type: "broadcast",
            event: "peer-ready",
            payload: { senderId: currentUserId },
          });
        }
      })
      .on("broadcast", { event: "sdp-offer" }, async ({ payload }) => {
        if (!isMounted || !pc || !isAuthorizedSender(payload?.senderId)) return;
        try {
          // Ensure local audio/video tracks are bound to pc before generating SDP answer
          await ensureLocalTracks();

          await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.type, sdp: payload.sdp }));

          // Flush any early arriving ICE candidates
          while (candidateQueueRef.current.length > 0) {
            const cand = candidateQueueRef.current.shift();
            if (cand) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
          }

          // Create answer & broadcast back to caller
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await signalingChannel.send({
            type: "broadcast",
            event: "sdp-answer",
            payload: {
              sdp: answer.sdp,
              type: answer.type,
              senderId: currentUserId,
            },
          });
          setCallStatus("connected");
        } catch (err) {
          console.warn("Error handling sdp-offer:", err);
        }
      })
      .on("broadcast", { event: "sdp-answer" }, async ({ payload }) => {
        if (!isMounted || !pc || !isAuthorizedSender(payload?.senderId)) return;
        try {
          if (pc.signalingState !== "closed") {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.type, sdp: payload.sdp }));

            // Flush any early arriving ICE candidates
            while (candidateQueueRef.current.length > 0) {
              const cand = candidateQueueRef.current.shift();
              if (cand) {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
            }
            setCallStatus("connected");
          }
        } catch (err) {
          console.warn("Error handling sdp-answer:", err);
        }
      })
      .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
        if (!isMounted || !pc || !isAuthorizedSender(payload?.senderId)) return;
        try {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            // Queue until remote description is set
            candidateQueueRef.current.push(payload.candidate);
          }
        } catch (err) {
          console.warn("Error handling ice-candidate:", err);
        }
      })
      .on("broadcast", { event: "call-ended" }, ({ payload }) => {
        if (!isMounted || !isAuthorizedSender(payload?.senderId)) return;
        handleEndCall();
      });

    // 7. Subscribe to signaling channel and start local media
    signalingChannel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED" || !isMounted) return;

      try {
        // Pre-configure audio session and bind local tracks immediately
        await ensureLocalTracks();

        if (!isIncoming) {
          // Caller announces ready and polls until receiver responds with peer-ready
          void signalingChannel.send({
            type: "broadcast",
            event: "caller-ready",
            payload: { senderId: currentUserId },
          });

          callerReadyInterval = setInterval(() => {
            if (offerSentRef.current || !isMounted) {
              if (callerReadyInterval) clearInterval(callerReadyInterval);
              return;
            }
            void signalingChannel.send({
              type: "broadcast",
              event: "caller-ready",
              payload: { senderId: currentUserId },
            });
          }, 1200);
        } else {
          // Receiver announces peer-ready so caller can safely generate sdp-offer
          void signalingChannel.send({
            type: "broadcast",
            event: "peer-ready",
            payload: { senderId: currentUserId },
          });
        }
      } catch (err) {
        console.warn("Error in WebRTC initialization flow:", err);
      }
    });

    return () => {
      isMounted = false;
      void dismissIncomingCallNotification();
      if (callerReadyInterval) {
        clearInterval(callerReadyInterval);
      }
      if (ringingTimeoutTimer) {
        clearTimeout(ringingTimeoutTimer);
      }
      if (iceDisconnectTimer) {
        clearTimeout(iceDisconnectTimer);
      }
      try {
        void resetAudioSession();
        if (localStreamRef.current) {
          stopMediaStream(localStreamRef.current);
          localStreamRef.current = null;
        }
        remoteStreamRef.current = null;
        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }
        void supabase.removeChannel(signalingChannel);
      } catch {
        // Safe guard
      }
    };
  }, [callType, currentUserId, handleEndCall, isIncoming, memberId, resolvedCallId]);

  // Subscribe to call session updates in Supabase database
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

  // Media controls
  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    toggleAudioTrack(localStreamRef.current, !next);
  };

  const handleToggleVideo = () => {
    const next = !isVideoEnabled;
    setIsVideoEnabled(next);
    toggleVideoTrack(localStreamRef.current, next);
  };

  const handleSwitchCamera = () => {
    switchCamera(localStreamRef.current);
    setIsFrontCamera((prev) => !prev);
  };

  const handleToggleSpeaker = () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    void configureAudioSessionForCall(next);
  };

  const handleAcceptCall = () => {
    void configureAudioSessionForCall(isSpeakerOn);
    if (callId) {
      void updateCallStatus(callId, "connected");
    }
    setCallStatus("connected");
    try {
      void signalingChannelRef.current?.send({
        type: "broadcast",
        event: "peer-ready",
        payload: { senderId: currentUserId },
      });
    } catch {
      // Safe guard
    }
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
      {/* Video Viewport: Render Remote Stream or Profile Fallback */}
      {isVideo && isVideoEnabled ? (
        <View style={styles.fullScreenVideo}>
          {remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={styles.fullScreenVideo}
              objectFit="cover"
              zOrder={0}
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

          {/* Floating Local Camera View (Picture in Picture) */}
          {localStream ? (
            <View style={[styles.pipCard, { top: insets.top + 50 }]}>
              <RTCView
                streamURL={localStream.toURL()}
                style={styles.pipVideo}
                objectFit="cover"
                mirror={isFrontCamera}
                zOrder={1}
              />
            </View>
          ) : (
            <View style={[styles.pipCard, { top: insets.top + 50 }]}>
              {user?.user_metadata?.avatar_url ? (
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
          )}
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
              ? `${formatTimer(callDuration)}${isPeerConnected ? " · P2P" : ""}`
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
          <Text style={styles.ringingText}>
            {isWebRTCSupported ? "Connecting WebRTC P2P…" : "Connecting voice/video stream…"}
          </Text>
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
