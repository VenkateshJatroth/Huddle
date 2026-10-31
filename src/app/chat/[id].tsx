import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { Icon } from "../../components/Icon";
import { SafetyActionModal } from "../../components/SafetyActionModal";
import {
  Avatar,
  ChatBubble,
  ChoiceChip,
  VerifiedBadge,
} from "../../components/ui";
import {
  DATE_PROMPTS,
  fetchConversationMessages,
  sendChatMessage,
  subscribeToMessages,
} from "../../lib/gormati-chat";
import type { ChatMessage } from "../../lib/gormati-chat";
import { fetchMemberProfile } from "../../lib/gormati-profiles";
import type { GormatiProfile } from "../../lib/gormati-profiles";
import { useAppColors } from "../../theme/colors";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useAppColors();
  const { user } = useAuth();

  const [member, setMember] = useState<GormatiProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Load member details & initial messages
  useEffect(() => {
    let isCurrent = true;

    async function init() {
      if (!id || !user) return;
      setIsLoading(true);
      try {
        const [profileData, messageHistory] = await Promise.all([
          fetchMemberProfile(id),
          fetchConversationMessages(user.id, id),
        ]);
        if (!isCurrent) return;
        setMember(profileData);
        setMessages(messageHistory);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void init();
    return () => { isCurrent = false; };
  }, [id, user]);

  // Realtime message subscription
  useEffect(() => {
    if (!id || !user) return;

    const unsubscribe = subscribeToMessages(user.id, id, (incoming) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, incoming];
      });
    });

    return () => {
      unsubscribe();
    };
  }, [id, user]);

  const handleSend = useCallback(async (contentToSend?: string) => {
    const text = (contentToSend ?? inputText).trim();
    if (!text || !id || !user || isSending) return;

    setInputText("");
    setIsSending(true);

    try {
      const sent = await sendChatMessage(user.id, id, text);
      setMessages((prev) => [...prev, sent]);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } finally {
      setIsSending(false);
    }
  }, [id, inputText, isSending, user]);

  const handleDatePromptTap = (prompt: string) => {
    setInputText(prompt);
  };

  const memberName = member?.display_name ?? "Member";
  const myUserId = user?.id ?? "me";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Icon name="chevronRight" color={colors.text} size={20} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${memberName}'s profile`}
          onPress={() => {
            if (member?.id) {
              router.push(("/member/" + member.id) as never);
            }
          }}
          style={styles.headerProfile}
        >
          <Avatar
            name={memberName}
            tone={1}
            size={38}
            imageSource={member?.avatar_url ? { uri: member.avatar_url } : undefined}
          />
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={[styles.headerName, { color: colors.text }]}>
                {memberName}
              </Text>
              {member?.is_verified ? <VerifiedBadge /> : null}
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.statusText, { color: colors.secondary }]}>Active now</Text>
            </View>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chat options"
          onPress={() => setSafetyModalVisible(true)}
          style={styles.optionsButton}
        >
          <Icon name="more" color={colors.text} size={20} />
        </Pressable>
      </View>

      {/* Messages Thread */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.secondary }]}>Loading conversation…</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
                Break the ice! Choose a date prompt below to get the conversation flowing.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.sender_id === myUserId;
            return (
              <ChatBubble
                message={item.content}
                sent={isMe}
                timestamp={item.created_at}
              />
            );
          }}
        />
      )}

      {/* Date Prompts / Icebreaker Suggestions */}
      <View style={[styles.promptsContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.promptsScroll}
        >
          {DATE_PROMPTS.map((prompt) => (
            <ChoiceChip
              key={prompt}
              label={prompt}
              onPress={() => handleDatePromptTap(prompt)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Input Composer */}
      <View style={[styles.composerBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder={`Message ${memberName.split(" ")[0]}…`}
          placeholderTextColor={colors.secondary}
          multiline
          maxLength={500}
          style={[styles.composerInput, { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={() => { void handleSend(); }}
          disabled={!inputText.trim() || isSending}
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor: colors.accent,
              opacity: !inputText.trim() || isSending ? 0.4 : pressed ? 0.8 : 1,
            },
          ]}
        >
          {isSending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Icon name="send" color="#FFFFFF" size={17} />
          )}
        </Pressable>
      </View>

      {member && user ? (
        <SafetyActionModal
          visible={safetyModalVisible}
          onClose={() => setSafetyModalVisible(false)}
          memberName={memberName}
          memberId={member.id}
          currentUserId={user.id}
          onBlockedOrReported={() => {
            router.back();
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "180deg" }],
  },
  optionsButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerProfile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerInfo: { flex: 1, gap: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerName: { fontSize: 15, fontWeight: "800" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 13 },
  messageList: { padding: 16, gap: 10 },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptySubtitle: { fontSize: 13, lineHeight: 18, textAlign: "center" },
  promptsContainer: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  promptsScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  composerBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});

