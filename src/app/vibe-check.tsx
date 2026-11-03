import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Icon";
import { AppButton, Card } from "../components/ui";
import type { GormatiProfile } from "../lib/gormati-profiles";
import { supabase } from "../lib/supabase";
import { useAppColors } from "../theme/colors";

const ICEBREAKERS = [
  "What’s an unconventional green flag in dating that most people sleep on?",
  "If you were gifted an all-expenses-paid trip anywhere tomorrow, where are we flying?",
  "What’s your ultimate comfort food when you’ve had a tough, exhausting week?",
  "Tell me one thing on your bucket list that excites you and scares you a little bit.",
  "Are you an early sunrise chai lover or a midnight philosopher under the city lights?",
];

type VibeMessage = {
  id: string;
  sender: "me" | "them";
  text: string;
  created_at: string;
};

export default function VibeCheckScreen() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();

  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [icebreaker] = useState(
    () => ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)],
  );
  const [messages, setMessages] = useState<VibeMessage[]>([
    {
      id: "icebreaker-msg",
      sender: "them",
      text: `Hey! Let’s vibe check. Question of the round: “${icebreaker}” ⚡`,
      created_at: new Date().toISOString(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [myRevealed, setMyRevealed] = useState(false);
  const [themRevealed, setThemRevealed] = useState(false);
  const [partnerProfile, setPartnerProfile] = useState<GormatiProfile | null>(null);
  const [matchCelebration, setMatchCelebration] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const handleBack = useCallback(() => {
    Alert.alert(
      "Leave Vibe Check?",
      "Are you sure you want to exit? Your 3-minute blind speed chat will end.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => router.back() },
      ],
    );
  }, []);

  // Load a potential partner profile for discovery
  useEffect(() => {
    let isCurrent = true;
    async function loadPartner() {
      try {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("id, display_name, username, avatar_url, bio, location")
          .neq("id", user?.id || "")
          .limit(1)
          .maybeSingle();

        if (data && isCurrent) {
          setPartnerProfile(data as GormatiProfile);
        }
      } catch {
        // Fallback demo partner
        if (isCurrent) {
          setPartnerProfile({
            id: "partner-vibe",
            display_name: "Aarav Sharma",
            username: "aarav_s",
            bio: "Architect & traveler exploring hidden coffee spots.",
            location: "Dubai",
            avatar_url: null,
            created_at: new Date().toISOString(),
          } as GormatiProfile);
        }
      }
    }
    void loadPartner();
    return () => {
      isCurrent = false;
    };
  }, [user?.id]);

  // 3-Minute countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;

    const newMsg: VibeMessage = {
      id: `msg-${Date.now()}`,
      sender: "me",
      text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText("");

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Simulated snappy response from partner
    if (messages.length === 1) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `reply-${Date.now()}`,
            sender: "them",
            text: "Ooh love that answer! For me, definitely taking the road less traveled. Time goes fast here!",
            created_at: new Date().toISOString(),
          },
        ]);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }, 1800);
    }
  };

  const handleReveal = () => {
    setMyRevealed(true);
    // Partner reciprocates reveal after a brief moment
    setTimeout(() => {
      setThemRevealed(true);
      setMatchCelebration(true);
    }, 1500);
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const isBothRevealed = myRevealed && themRevealed;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      {/* Top Header */}
      <View
        style={[
          styles.headerBar,
          {
            paddingTop: Math.max(insets.top + 8, 20),
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          onPress={handleBack}
          style={styles.backBtn}
          hitSlop={10}
        >
          <Icon name="arrowBack" color={colors.text} size={22} />
        </Pressable>

        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {isBothRevealed && partnerProfile ? partnerProfile.display_name : "Mystery Partner ⚡"}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.accent }]}>
            {timeLeft > 0 ? `⏳ ${formatTimer(timeLeft)} left` : "⏰ Round complete"}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reveal Profile"
          disabled={myRevealed}
          onPress={handleReveal}
          style={[
            styles.revealHeaderBtn,
            { backgroundColor: myRevealed ? colors.subtle : colors.accentSoft },
          ]}
        >
          <Text
            style={[
              styles.revealHeaderBtnText,
              { color: myRevealed ? colors.secondary : colors.accent },
            ]}
          >
            {myRevealed ? "Revealed 🔓" : "Reveal 🔓"}
          </Text>
        </Pressable>
      </View>

      {/* Icebreaker Header Strip */}
      <View style={[styles.icebreakerStrip, { backgroundColor: colors.subtle, borderBottomColor: colors.border }]}>
        <Text style={[styles.icebreakerLabel, { color: colors.accent }]}>ICEBREAKER ⚡</Text>
        <Text style={[styles.icebreakerText, { color: colors.text }]}>{icebreaker}</Text>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        renderItem={({ item }) => {
          const isMe = item.sender === "me";
          return (
            <View
              style={[
                styles.messageRow,
                isMe ? styles.messageRowMe : styles.messageRowThem,
              ]}
            >
              {!isMe ? (
                <View style={[styles.anonAvatar, { backgroundColor: colors.accentSoft }]}>
                  <Text style={styles.anonAvatarEmoji}>
                    {isBothRevealed && partnerProfile ? "👤" : "⚡"}
                  </Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.messageBubble,
                  isMe
                    ? [styles.bubbleMe, { backgroundColor: colors.accent }]
                    : [styles.bubbleThem, { backgroundColor: colors.surface, borderColor: colors.border }],
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    { color: isMe ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {item.text}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {/* Mutual Match Celebration Popup */}
      {matchCelebration && partnerProfile ? (
        <Card style={[styles.matchCelebrationCard, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
          <Text style={styles.celebrationTrophy}>🎉 🔓 🎉</Text>
          <Text style={[styles.celebrationTitle, { color: colors.text }]}>Both Profiles Revealed!</Text>
          <Text style={[styles.celebrationSub, { color: colors.secondary }]}>
            You both passed the Vibe Check! Meet {partnerProfile.display_name} (@{partnerProfile.username}) from {partnerProfile.location || "the community"}.
          </Text>
          <View style={styles.celebrationActions}>
            <AppButton
              label="View Full Profile"
              onPress={() => {
                setMatchCelebration(false);
                router.push({
                  pathname: "/(tabs)/profile",
                  params: { userId: partnerProfile.id },
                } as never);
              }}
            />
          </View>
        </Card>
      ) : null}

      {/* Bottom Message Input Bar */}
      <View
        style={[
          styles.inputBar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a snappy message…"
          placeholderTextColor={colors.secondary}
          style={[
            styles.chatInput,
            { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border },
          ]}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={handleSend}
          disabled={!inputText.trim()}
          style={[
            styles.sendBtn,
            { backgroundColor: inputText.trim() ? colors.accent : colors.subtle },
          ]}
        >
          <Icon name="send" color={inputText.trim() ? "#FFFFFF" : colors.secondary} size={18} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  revealHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  revealHeaderBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
  icebreakerStrip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  icebreakerLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  icebreakerText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  messagesList: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  messageRowMe: {
    justifyContent: "flex-end",
  },
  messageRowThem: {
    justifyContent: "flex-start",
  },
  anonAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  anonAvatarEmoji: {
    fontSize: 16,
  },
  messageBubble: {
    maxWidth: "76%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  matchCelebrationCard: {
    margin: 16,
    padding: 20,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    gap: 10,
  },
  celebrationTrophy: {
    fontSize: 36,
  },
  celebrationTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  celebrationSub: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  celebrationActions: {
    width: "100%",
    marginTop: 6,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
