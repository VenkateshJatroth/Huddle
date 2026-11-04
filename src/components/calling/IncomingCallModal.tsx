import { useEffect, useState } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../Icon";
import { Avatar } from "../ui";
import type { CallSession } from "../../lib/calling";

const { width } = Dimensions.get("window");

export function IncomingCallModal({
  call,
  onAccept,
  onDecline,
}: {
  call: CallSession;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [pulseOpacity] = useState(() => new Animated.Value(0.6));

  // Pulsing animation for the incoming caller avatar
  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.35,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0.1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.6,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulseAnim, pulseOpacity]);

  const isVideo = call.call_type === "video";

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      {/* Top Header info */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 24, 44) }]}>
        <View style={styles.badge}>
          <Icon name="lock" color="#A1A1AA" size={13} />
          <Text style={styles.badgeText}>End-to-End Encrypted</Text>
        </View>
        <Text style={styles.incomingLabel}>
          Incoming {isVideo ? "Video" : "HD Voice"} Call
        </Text>
      </View>

      {/* Center Caller Profile & Pulsing Ring */}
      <View style={styles.centerSection}>
        <View style={styles.avatarWrapper}>
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseAnim }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <Avatar
            name={call.caller_name || "Huddle Member"}
            imageSource={call.caller_avatar || undefined}
            size={110}
          />
        </View>

        <Text numberOfLines={1} style={styles.callerName}>
          {call.caller_name || "Huddle Member"}
        </Text>

        <Text style={styles.callSubtext}>
          Huddle Call • Ringing…
        </Text>
      </View>

      {/* Bottom Action Controls */}
      <View style={[styles.actionsSection, { paddingBottom: Math.max(insets.bottom + 36, 48) }]}>
        {/* Decline Button */}
        <View style={styles.actionItem}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decline incoming call"
            onPress={onDecline}
            style={[styles.actionBtn, styles.declineBtn]}
            hitSlop={12}
          >
            <Icon name="close" color="#FFFFFF" size={28} />
          </Pressable>
          <Text style={styles.actionLabel}>Decline</Text>
        </View>

        {/* Answer Button */}
        <View style={styles.actionItem}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Answer incoming call"
            onPress={onAccept}
            style={[styles.actionBtn, styles.answerBtn]}
            hitSlop={12}
          >
            <Icon name={isVideo ? "video" : "phone"} color="#FFFFFF" size={28} />
          </Pressable>
          <Text style={styles.actionLabel}>Answer</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "#0A0A0C",
    zIndex: 99999,
    justifyContent: "space-between",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    gap: 10,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
  },
  badgeText: {
    color: "#A1A1AA",
    fontSize: 12,
    fontWeight: "600",
  },
  incomingLabel: {
    color: "#E4E4E7",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  centerSection: {
    alignItems: "center",
    gap: 14,
    marginTop: -30,
  },
  avatarWrapper: {
    width: 130,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#EC4899",
  },
  callerName: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  callSubtext: {
    color: "#71717A",
    fontSize: 14,
    fontWeight: "500",
  },
  actionsSection: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: width * 0.8,
  },
  actionItem: {
    alignItems: "center",
    gap: 10,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  declineBtn: {
    backgroundColor: "#EF4444",
  },
  answerBtn: {
    backgroundColor: "#10B981",
  },
  actionLabel: {
    color: "#E4E4E7",
    fontSize: 14,
    fontWeight: "600",
  },
});
