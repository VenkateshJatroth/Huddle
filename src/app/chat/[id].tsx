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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { compressImage } from "../../utils/imageCompression";
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
  markMessagesAsRead,
  sendChatMessage,
  subscribeToMessages,
  subscribeToTypingIndicator,
} from "../../lib/gormati-chat";
import type { ChatMessage } from "../../lib/gormati-chat";
import { fetchMemberProfile } from "../../lib/gormati-profiles";
import type { GormatiProfile } from "../../lib/gormati-profiles";
import { startCall } from "../../lib/calling";
import { useAppColors } from "../../theme/colors";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();

  const [member, setMember] = useState<GormatiProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTypingRef = useRef<((isTyping: boolean) => void) | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, []);

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

        // Mark incoming messages as read
        void markMessagesAsRead(user.id, id);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void init();
    return () => { isCurrent = false; };
  }, [id, user]);

  // Realtime message subscription + live updates
  useEffect(() => {
    if (!id || !user) return;

    const unsubscribe = subscribeToMessages(
      user.id,
      id,
      (incoming) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
        // Mark as read if sent by partner
        if (incoming.sender_id === id) {
          void markMessagesAsRead(user.id, id);
        }
      },
      (updated) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? { ...m, read_at: updated.read_at } : m)),
        );
      },
    );

    return () => {
      unsubscribe();
    };
  }, [id, user]);

  // Realtime typing indicator
  useEffect(() => {
    if (!id || !user) return;

    const { sendTyping, unsubscribe } = subscribeToTypingIndicator(
      user.id,
      id,
      (typing) => {
        setIsPartnerTyping(typing);
      },
    );

    sendTypingRef.current = sendTyping;

    return () => {
      unsubscribe();
    };
  }, [id, user]);

  const handleInputChange = (text: string) => {
    setInputText(text);

    if (sendTypingRef.current) {
      sendTypingRef.current(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingRef.current?.(false);
      }, 2500);
    }
  };

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const { uri: compressed } = await compressImage(result.assets[0].uri, { type: "gallery" });
      setSelectedPhotoUri(compressed);
    }
  };

  const handleSend = useCallback(async (contentToSend?: string) => {
    const text = (contentToSend ?? inputText).trim();
    const photoToSend = selectedPhotoUri;
    if ((!text && !photoToSend) || !id || !user || isSending) return;

    setInputText("");
    setSelectedPhotoUri(null);
    setIsSending(true);

    if (sendTypingRef.current) {
      sendTypingRef.current(false);
    }

    try {
      const sent = await sendChatMessage(user.id, id, text || "Sent a photo", photoToSend);
      setMessages((prev) => [...prev, sent]);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } finally {
      setIsSending(false);
    }
  }, [id, inputText, isSending, selectedPhotoUri, user]);

  const handleDatePromptTap = (prompt: string) => {
    setInputText(prompt);
  };

  const handleStartCall = async (callType: "voice" | "video") => {
    if (!user || !member?.id) return;
    try {
      const call = await startCall(
        user.id,
        member.id,
        callType,
        user.user_metadata?.full_name || user.email?.split("@")[0] || "Member",
        user.user_metadata?.avatar_url,
      );
      router.push({
        pathname: "/call/[id]",
        params: {
          id: member.id,
          callId: call.id,
          type: callType,
          channelId: call.agora_channel || undefined,
          token: call.agora_token || undefined,
        },
      } as never);
    } catch {
      router.push({
        pathname: "/call/[id]",
        params: { id: member.id, type: callType },
      } as never);
    }
  };

  const memberName = member?.display_name ?? "Member";
  const myUserId = user?.id ?? "me";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      {/* Top Header with Safe Area Insets to prevent status bar collision */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top + 8, 20),
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          style={styles.backButton}
        >
          <Icon name="chevronLeft" color={colors.text} size={20} />
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
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isPartnerTyping ? colors.accent : colors.success },
                ]}
              />
              <Text style={[styles.statusText, { color: isPartnerTyping ? colors.accent : colors.secondary }]}>
                {isPartnerTyping ? "Typing…" : "Active now"}
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voice Call"
            onPress={() => { void handleStartCall("voice"); }}
            style={styles.optionsButton}
            hitSlop={8}
          >
            <Icon name="phone" color={colors.text} size={19} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Video Call"
            onPress={() => { void handleStartCall("video"); }}
            style={styles.optionsButton}
            hitSlop={8}
          >
            <Icon name="video" color={colors.text} size={20} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chat options"
            onPress={() => setSafetyModalVisible(true)}
            style={styles.optionsButton}
            hitSlop={8}
          >
            <Icon name="more" color={colors.text} size={20} />
          </Pressable>
        </View>
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
                imageUrl={item.image_url}
                read={Boolean(item.read_at)}
              />
            );
          }}
        />
      )}

      {/* Live Typing Status Pill above composer */}
      {isPartnerTyping ? (
        <View style={[styles.typingBar, { backgroundColor: colors.subtle }]}>
          <Text style={[styles.typingText, { color: colors.secondary }]}>
            {memberName} is typing…
          </Text>
        </View>
      ) : null}

      {/* Selected Photo Attachment Preview */}
      {selectedPhotoUri ? (
        <View style={[styles.attachmentPreview, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Image source={{ uri: selectedPhotoUri }} style={styles.attachmentThumb} contentFit="cover" />
          <Text numberOfLines={1} style={[styles.attachmentLabel, { color: colors.text }]}>Photo attached</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            onPress={() => setSelectedPhotoUri(null)}
            hitSlop={8}
            style={styles.attachmentRemoveBtn}
          >
            <Icon name="close" color={colors.accent} size={16} />
          </Pressable>
        </View>
      ) : null}

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
      <View
        style={[
          styles.composerBar,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach photo"
          onPress={() => { void handlePickPhoto(); }}
          style={[styles.attachButton, { backgroundColor: colors.subtle }]}
        >
          <Icon name="photo" color={colors.text} size={18} />
        </Pressable>

        <TextInput
          value={inputText}
          onChangeText={handleInputChange}
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
          disabled={(!inputText.trim() && !selectedPhotoUri) || isSending}
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor: colors.accent,
              opacity: (!inputText.trim() && !selectedPhotoUri) || isSending ? 0.4 : pressed ? 0.8 : 1,
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
    paddingBottom: 10,
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
  typingBar: { paddingHorizontal: 16, paddingVertical: 6 },
  typingText: { fontSize: 12, fontStyle: "italic" },
  attachmentPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachmentThumb: { width: 44, height: 44, borderRadius: 8 },
  attachmentLabel: { flex: 1, fontSize: 13, fontWeight: "600" },
  attachmentRemoveBtn: { padding: 6 },
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
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
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
