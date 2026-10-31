import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { useAppColors } from "../theme/colors";
import type { CommunityPost } from "../data/mockData";
import { Icon } from "./Icon";
import { DemoAvatar } from "./DemoAvatar";
import { Avatar, Card, rowStyles } from "./ui";

export function FeedPostCard({
  post,
  liked = false,
  onToggleLike,
  demoAvatarId,
  mediaSource,
  mediaAccessibilityLabel,
}: {
  post: CommunityPost;
  liked?: boolean;
  onToggleLike: () => void;
  demoAvatarId?: string;
  mediaSource?: ImageSource | string | number;
  mediaAccessibilityLabel?: string;
}) {
  const colors = useAppColors();

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
            <Text style={[styles.metaText, { color: colors.secondary }]}>· {post.time}</Text>
          </View>
          <Text style={[styles.metaText, { color: colors.secondary }]}>@{post.username}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More options for ${post.author}'s post`}
          onPress={() => Alert.alert("Post options", "Post actions are a local preview.")}
          hitSlop={8}
          style={styles.moreButton}
        >
          <Icon name="more" color={colors.secondary} size={20} />
        </Pressable>
      </View>

      <Text style={[styles.postText, { color: colors.text }]}>{post.text}</Text>

      {mediaSource ? (
        <Image
          source={mediaSource}
          contentFit="cover"
          accessibilityLabel={mediaAccessibilityLabel ?? `Sample photo for ${post.author}'s post`}
          style={[styles.mediaImage, { backgroundColor: colors.subtle }]}
        />
      ) : null}

      <View style={[rowStyles.row, styles.locationLine]}>
        <Icon name="location" color={colors.secondary} size={15} />
        <Text style={[styles.contextText, { color: colors.secondary }]}>{post.location}</Text>
        <View style={[styles.dot, { backgroundColor: colors.secondary }]} />
        <Text style={[styles.contextText, { color: colors.secondary }]}>{post.language}</Text>
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
          accessibilityLabel={`${post.replies} replies to ${post.author}'s post`}
          onPress={() => Alert.alert("Replies", "Replies are a local preview in this milestone.")}
          hitSlop={5}
          style={styles.actionButton}
        >
          <Icon name="chat" color={colors.secondary} size={18} />
          <Text style={[styles.actionText, { color: colors.secondary }]}>{post.replies}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Share ${post.author}'s post`}
          onPress={() => Alert.alert("Share", "Sharing is not connected yet.")}
          hitSlop={5}
          style={[styles.actionButton, styles.shareButton]}
        >
          <Icon name="share" color={colors.secondary} size={18} />
        </Pressable>
      </View>
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
});
