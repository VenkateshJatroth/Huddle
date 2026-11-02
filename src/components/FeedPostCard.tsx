import { useState, useEffect } from "react";
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image, type ImageSource } from "expo-image";
import { useAppColors } from "../theme/colors";
import type { CommunityPost } from "../data/mockData";
import { Icon } from "./Icon";
import { DemoAvatar } from "./DemoAvatar";
import { Avatar, Card, rowStyles } from "./ui";
import {
  createPostReply,
  fetchPostReplies,
  type PostReply,
  type PublishedPost,
} from "../lib/posts";
import { useAuth } from "../auth/AuthProvider";
import { AudioPlayerCard } from "./AudioPlayerCard";
import { PollCard } from "./PollCard";
import { getUserBadges } from "../lib/badges";
import { UserBadge } from "./UserBadge";
import { fetchSavedPostIds, toggleSavedPost } from "../lib/bookmarks";

export function FeedPostCard({
  post,
  liked = false,
  onToggleLike,
  demoAvatarId,
  mediaSource,
  mediaAccessibilityLabel,
  currentUserId,
  onEditPost,
  onDeletePost,
}: {
  post: CommunityPost | PublishedPost;
  liked?: boolean;
  onToggleLike: () => void;
  demoAvatarId?: string;
  mediaSource?: ImageSource | string | number;
  mediaAccessibilityLabel?: string;
  currentUserId?: string;
  onEditPost?: (post: PublishedPost) => void;
  onDeletePost?: (post: PublishedPost) => void;
}) {
  const colors = useAppColors();
  const { user } = useAuth();
  const publishedPost = post as PublishedPost;
  const isAuthor = Boolean(currentUserId && publishedPost.author_id === currentUserId);

  // Replies drawer state
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<PostReply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [repliesCount, setRepliesCount] = useState(post.replies || 0);

  // Bookmarks state
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (currentUserId) {
      void fetchSavedPostIds(currentUserId).then((ids) => {
        setIsSaved(ids.has(post.id));
      });
    }
  }, [currentUserId, post.id]);

  const handleToggleBookmark = async () => {
    if (!currentUserId) {
      Alert.alert("Sign In Required", "Please sign in to save bookmarks.");
      return;
    }
    const nextSaved = await toggleSavedPost(currentUserId, post.id, isSaved);
    setIsSaved(nextSaved);
  };

  const authorBadges = getUserBadges({
    currentStreak: post.author === "Venky" ? 4 : 2,
    totalPosts: post.author === "Venky" ? 6 : 1,
    isVerified: true,
  });
  const topBadge = authorBadges[0];

  useEffect(() => {
    if (showReplies) {
      void fetchPostReplies(post.id).then((loaded) => {
        setReplies(loaded);
        if (loaded.length > repliesCount) {
          setRepliesCount(loaded.length);
        }
      });
    }
  }, [showReplies, post.id, repliesCount]);

  const handleShare = async () => {
    try {
      await Share.share({
        title: `Post by ${post.author} on GorMati`,
        message: `"${post.text}"\n\n— ${post.author} (@${post.username}) on GorMati\nhttps://gormati.app/post/${post.id}`,
      });
    } catch {
      // User dismissed
    }
  };

  const handleMoreOptions = () => {
    if (isAuthor) {
      Alert.alert(
        "Manage Post",
        "Choose an action for your post:",
        [
          {
            text: "Edit Post",
            onPress: () => {
              if (onEditPost) onEditPost(publishedPost);
            },
          },
          {
            text: "Delete Post",
            style: "destructive",
            onPress: () => {
              Alert.alert(
                "Delete Post?",
                "Are you sure you want to permanently delete this post?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      if (onDeletePost) onDeletePost(publishedPost);
                    },
                  },
                ],
              );
            },
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
    } else {
      Alert.alert(
        "Post Options",
        `Options for ${post.author}'s post:`,
        [
          { text: "Share Post", onPress: () => { void handleShare(); } },
          {
            text: "Report Post",
            style: "destructive",
            onPress: () => Alert.alert("Reported", "Thank you for helping keep the GorMati community safe."),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
    }
  };

  const handleSendReply = async () => {
    const text = replyText.trim();
    if (!text || isSubmittingReply) return;

    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to reply to posts.");
      return;
    }

    setIsSubmittingReply(true);
    try {
      const authorName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Gormati Member";
      const username = user.user_metadata?.username || user.email?.split("@")[0] || "member";

      const created = await createPostReply(post.id, text, {
        id: user.id,
        name: authorName,
        username,
      });

      setReplies((prev) => [...prev, created]);
      setRepliesCount((c) => c + 1);
      setReplyText("");
    } catch {
      Alert.alert("Error", "Could not send reply. Please try again.");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <Card style={styles.postCard}>
      <View style={[rowStyles.row, styles.authorRow]}>
        {demoAvatarId ? (
          <DemoAvatar id={demoAvatarId} name={post.author} tone={post.tone} />
        ) : (
          <Avatar name={post.author} tone={post.tone} />
        )}
        <View style={styles.authorDetails}>
          <View style={[rowStyles.row, styles.nameLine]}>
            <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>{post.author}</Text>
            {topBadge ? <UserBadge badge={topBadge} compact /> : null}
            <Text style={[styles.metaText, { color: colors.secondary }]}>· {post.time}</Text>
          </View>
          <Text style={[styles.metaText, { color: colors.secondary }]}>@{post.username}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More options for ${post.author}'s post`}
          onPress={handleMoreOptions}
          hitSlop={8}
          style={styles.moreButton}
        >
          <Icon name="more" color={colors.secondary} size={20} />
        </Pressable>
      </View>

      <Text style={[styles.postText, { color: colors.text }]}>{post.text}</Text>

      {publishedPost.audio_url ? (
        <AudioPlayerCard
          audioUrl={publishedPost.audio_url}
          durationSeconds={publishedPost.audio_duration || 24}
        />
      ) : null}

      {publishedPost.poll_question && publishedPost.poll_options && publishedPost.poll_options.length > 0 ? (
        <PollCard
          postId={publishedPost.id}
          question={publishedPost.poll_question}
          options={publishedPost.poll_options}
          currentUserId={currentUserId}
        />
      ) : null}

      {mediaSource ? (
        <Image
          source={mediaSource}
          contentFit="cover"
          accessibilityLabel={mediaAccessibilityLabel ?? `Photo for ${post.author}'s post`}
          style={[styles.mediaImage, { backgroundColor: colors.subtle }]}
        />
      ) : null}

      <View style={[rowStyles.row, styles.locationLine]}>
        <Icon name="location" color={colors.secondary} size={15} />
        <Text style={[styles.contextText, { color: colors.secondary }]}>{post.location}</Text>
        <View style={[styles.dot, { backgroundColor: colors.secondary }]} />
        <Text style={[styles.contextText, { color: colors.secondary }]}>{post.language}</Text>
        {publishedPost.channel ? (
          <>
            <View style={[styles.dot, { backgroundColor: colors.secondary }]} />
            <Text style={[styles.contextText, { color: colors.text, fontWeight: "700" }]}>
              #{publishedPost.channel}
            </Text>
          </>
        ) : null}
        {publishedPost.audience && publishedPost.audience !== "Everyone" ? (
          <>
            <View style={[styles.dot, { backgroundColor: colors.secondary }]} />
            <Text style={[styles.contextText, { color: colors.accent, fontWeight: "600" }]}>
              {publishedPost.audience}
            </Text>
          </>
        ) : null}
      </View>

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${liked ? "Unlike" : "Like"} post by ${post.author}`}
          accessibilityState={{ selected: liked }}
          onPress={onToggleLike}
          hitSlop={5}
          style={styles.actionButton}
        >
          <Icon name="heart" color={liked ? colors.accent : colors.secondary} size={18} />
          <Text style={[styles.actionText, { color: liked ? colors.accent : colors.secondary }]}>
            {post.likes + (liked ? 1 : 0)}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${repliesCount} replies to ${post.author}'s post`}
          onPress={() => setShowReplies((open) => !open)}
          hitSlop={5}
          style={styles.actionButton}
        >
          <Icon name="chat" color={showReplies ? colors.accent : colors.secondary} size={18} />
          <Text style={[styles.actionText, { color: showReplies ? colors.accent : colors.secondary }]}>
            {repliesCount}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Share ${post.author}'s post`}
          onPress={() => { void handleShare(); }}
          hitSlop={5}
          style={[styles.actionButton, styles.shareButton]}
        >
          <Icon name="share" color={colors.secondary} size={18} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSaved ? "Remove bookmark" : "Save bookmark"}
          onPress={() => { void handleToggleBookmark(); }}
          hitSlop={5}
          style={styles.actionButton}
        >
          <Icon name="bookmark" color={isSaved ? colors.accent : colors.secondary} size={18} />
        </Pressable>
      </View>

      {/* Interactive Reply Drawer */}
      {showReplies ? (
        <View style={[styles.repliesDrawer, { borderTopColor: colors.border, backgroundColor: colors.subtle }]}>
          <Text style={[styles.repliesTitle, { color: colors.text }]}>Replies</Text>

          {replies.length === 0 ? (
            <Text style={[styles.noRepliesText, { color: colors.secondary }]}>
              No replies yet. Be the first to share your thoughts!
            </Text>
          ) : (
            <View style={styles.repliesList}>
              {replies.map((reply) => (
                <View key={reply.id} style={styles.replyItem}>
                  <Avatar name={reply.author_name} tone={2} size={30} />
                  <View style={styles.replyBubble}>
                    <View style={styles.replyHeader}>
                      <Text style={[styles.replyAuthor, { color: colors.text }]}>{reply.author_name}</Text>
                      <Text style={[styles.replyTime, { color: colors.secondary }]}>· {reply.time}</Text>
                    </View>
                    <Text style={[styles.replyContent, { color: colors.text }]}>{reply.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Quick Reply Composer */}
          <View style={[styles.replyComposer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput
              accessibilityLabel="Type your reply"
              placeholder="Write a reply…"
              placeholderTextColor={colors.secondary}
              value={replyText}
              onChangeText={setReplyText}
              style={[styles.replyInput, { color: colors.text }]}
              maxLength={300}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send reply"
              disabled={isSubmittingReply || !replyText.trim()}
              onPress={() => { void handleSendReply(); }}
              style={[
                styles.sendReplyButton,
                { backgroundColor: replyText.trim() ? colors.accent : colors.subtle },
              ]}
            >
              <Icon name="send" color={replyText.trim() ? "#FFFFFF" : colors.secondary} size={15} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  postCard: { padding: 16, gap: 13 },
  authorRow: { alignItems: "center", gap: 11 },
  authorDetails: { flex: 1, minWidth: 0, gap: 3 },
  nameLine: { flexWrap: "wrap", gap: 5 },
  authorName: { fontSize: 14, fontWeight: "700", flexShrink: 1 },
  metaText: { fontSize: 12, lineHeight: 17 },
  moreButton: { width: 32, height: 36, alignItems: "center", justifyContent: "center" },
  postText: { fontSize: 15, lineHeight: 23 },
  mediaImage: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12 },
  locationLine: { gap: 6, flexWrap: "wrap" },
  contextText: { fontSize: 12, lineHeight: 18 },
  dot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 1 },
  actions: { borderTopWidth: 1, paddingTop: 11, flexDirection: "row", alignItems: "center", gap: 24 },
  actionButton: { minWidth: 42, minHeight: 32, flexDirection: "row", alignItems: "center", gap: 7 },
  actionText: { fontSize: 13, fontWeight: "600" },
  shareButton: { marginLeft: "auto", justifyContent: "flex-end" },
  repliesDrawer: {
    marginTop: 4,
    borderTopWidth: 1,
    paddingTop: 12,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  repliesTitle: { fontSize: 13, fontWeight: "700" },
  noRepliesText: { fontSize: 12, fontStyle: "italic", paddingVertical: 4 },
  repliesList: { gap: 10 },
  replyItem: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  replyBubble: { flex: 1, gap: 3 },
  replyHeader: { flexDirection: "row", alignItems: "center", gap: 5 },
  replyAuthor: { fontSize: 12, fontWeight: "700" },
  replyTime: { fontSize: 11 },
  replyContent: { fontSize: 13, lineHeight: 18 },
  replyComposer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 6,
    height: 40,
    marginTop: 4,
  },
  replyInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  sendReplyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
