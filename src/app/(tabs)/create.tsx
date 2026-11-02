import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { Icon } from "../../components/Icon";
import {
  AppButton,
  AppScreen,
  Card,
  ChoiceChip,
  PageHeading,
} from "../../components/ui";
import {
  COMMUNITY_CHANNELS,
  createPost,
  type CommunityChannel,
  type PostAudience,
} from "../../lib/posts";
import { AudioRecorderSection } from "../../components/AudioRecorderSection";
import { useAppColors } from "../../theme/colors";

const audiences = ["Everyone", "Connections", "Only me"] as const;

export default function CreateScreen() {
  const colors = useAppColors();
  const { user } = useAuth();

  const [draft, setDraft] = useState("");
  const [audience, setAudience] = useState<PostAudience>("Everyone");
  const [channel, setChannel] = useState<CommunityChannel>("General");
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const handlePickPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow photo library access to attach photos to your post.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Could not open photo gallery.");
    }
  };

  const handlePublish = async () => {
    const text = draft.trim();
    if (!text) {
      Alert.alert("Empty Post", "Please type what's on your mind before publishing.");
      return;
    }
    if (!user) {
      Alert.alert("Authentication Required", "Please sign in to publish community posts.");
      return;
    }

    setIsPublishing(true);
    try {
      const authorName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Gormati Member";
      const username = user.user_metadata?.username || user.email?.split("@")[0] || "member";

      const validPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean);

      await createPost({
        authorId: user.id,
        authorName,
        username,
        text,
        audience,
        channel,
        localImageUri: selectedImageUri,
        localAudioUri: audioUri,
        audioDuration: audioUri ? audioDuration : null,
        pollQuestion: showPollCreator && pollQuestion.trim() ? pollQuestion.trim() : null,
        pollOptions:
          showPollCreator && pollQuestion.trim() && validPollOptions.length >= 2
            ? validPollOptions
            : null,
      });

      setDraft("");
      setSelectedImageUri(null);
      setAudioUri(null);
      setAudioDuration(0);
      setShowPollCreator(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPreviewVisible(false);

      Alert.alert(
        "Post Published! 🎉",
        "Your thoughts are now shared with the GorMati community.",
        [
          {
            text: "View in Feed",
            onPress: () => router.push("/(tabs)"),
          },
        ],
      );
    } catch (err: unknown) {
      Alert.alert("Publish Failed", err instanceof Error ? err.message : "Unable to publish your post. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <AppScreen>
      <PageHeading
        title="Create a post"
        subtitle="Start a conversation with your community."
        eyebrow="Share a moment"
      />

      <Card style={styles.composerCard}>
        <View style={styles.inputHeader}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>What’s on your mind?</Text>
          <Text style={[styles.characterCount, { color: colors.secondary }]}>{draft.length}/500</Text>
        </View>

        <TextInput
          accessibilityLabel="Write your post"
          value={draft}
          onChangeText={(value) => setDraft(value.slice(0, 500))}
          placeholder="Share a thought, ask a question, or invite people to join you…"
          placeholderTextColor={colors.secondary}
          multiline
          textAlignVertical="top"
          maxLength={500}
          style={[styles.textArea, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
        />

        {/* Audio Voice Note Recording Section */}
        <AudioRecorderSection
          audioUri={audioUri}
          audioDuration={audioDuration}
          onAudioRecorded={(uri, dur) => {
            setAudioUri(uri);
            setAudioDuration(dur);
          }}
          onRemoveAudio={() => {
            setAudioUri(null);
            setAudioDuration(0);
          }}
        />

        {/* Photo Attachment Bar */}
        <View style={[styles.attachmentRow, { borderColor: colors.border }]}>
          <AppButton
            label={selectedImageUri ? "Change photo" : "Attach photo"}
            variant="outline"
            icon={selectedImageUri ? "check" : "photo"}
            onPress={() => { void handlePickPhoto(); }}
            accessibilityLabel="Pick photo from gallery"
          />
          {selectedImageUri ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              onPress={() => setSelectedImageUri(null)}
              style={styles.removePhotoBtn}
            >
              <Icon name="close" color={colors.accent} size={16} />
              <Text style={[styles.removePhotoText, { color: colors.accent }]}>Remove</Text>
            </Pressable>
          ) : (
            <Text style={[styles.attachmentHint, { color: colors.secondary }]}>PNG, JPG up to 10MB</Text>
          )}
        </View>

        {/* Selected Photo Preview */}
        {selectedImageUri ? (
          <View style={[styles.photoPreviewShell, { borderColor: colors.border }]}>
            <Image
              source={{ uri: selectedImageUri }}
              style={styles.attachedImage}
              contentFit="cover"
            />
          </View>
        ) : null}
      </Card>

      {/* Interactive Poll Creator Card */}
      <Card style={[styles.pollCreatorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.pollCreatorHeader}>
          <View style={styles.pollCreatorTitleWrap}>
            <Text style={styles.pollTagEmoji}>📊</Text>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Community Poll</Text>
          </View>
          <AppButton
            label={showPollCreator ? "Remove Poll" : "+ Add Poll"}
            variant="outline"
            onPress={() => {
              if (showPollCreator) {
                setPollQuestion("");
                setPollOptions(["", ""]);
              }
              setShowPollCreator(!showPollCreator);
            }}
          />
        </View>

        {showPollCreator ? (
          <View style={styles.pollInputsWrap}>
            <TextInput
              placeholder="Ask a question (e.g. Best weekend spot in Dubai?)"
              placeholderTextColor={colors.secondary}
              value={pollQuestion}
              onChangeText={setPollQuestion}
              style={[
                styles.pollInput,
                { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border },
              ]}
            />
            {pollOptions.map((opt, idx) => (
              <View key={idx} style={styles.pollOptionRow}>
                <TextInput
                  placeholder={`Choice ${idx + 1}`}
                  placeholderTextColor={colors.secondary}
                  value={opt}
                  onChangeText={(val) => {
                    const copy = [...pollOptions];
                    copy[idx] = val;
                    setPollOptions(copy);
                  }}
                  style={[
                    styles.pollInput,
                    { flex: 1, color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border },
                  ]}
                />
                {pollOptions.length > 2 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove choice ${idx + 1}`}
                    onPress={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                    hitSlop={6}
                    style={styles.removeOptionBtn}
                  >
                    <Icon name="close" color={colors.secondary} size={18} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {pollOptions.length < 4 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add another choice"
                onPress={() => setPollOptions([...pollOptions, ""])}
                style={styles.addOptionBtn}
              >
                <Text style={[styles.addOptionText, { color: colors.accent }]}>+ Add another choice</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.helperText, { color: colors.secondary }]}>
            Engage your community circle with an interactive question and voting choices.
          </Text>
        )}
      </Card>

      {/* Community Circle / Topic Channel Selection */}
      <View style={styles.audienceBlock}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Community Circle</Text>
        <Text style={[styles.helperText, { color: colors.secondary }]}>
          Tag your conversation with a circle so relevant members can discover it.
        </Text>
        <View style={styles.audienceChoices}>
          {COMMUNITY_CHANNELS.map((ch) => (
            <ChoiceChip
              key={ch}
              label={`# ${ch}`}
              selected={channel === ch}
              onPress={() => setChannel(ch)}
            />
          ))}
        </View>
      </View>

      {/* Audience Scope Selection */}
      <View style={styles.audienceBlock}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Audience</Text>
        <Text style={[styles.helperText, { color: colors.secondary }]}>
          Control who can see and discover your post in the community.
        </Text>
        <View style={styles.audienceChoices}>
          {audiences.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={audience === option}
              onPress={() => setAudience(option)}
              icon={option === "Everyone" ? "globe" : option === "Connections" ? "people" : "person"}
            />
          ))}
        </View>
      </View>

      {/* Action Buttons: Preview & Publish */}
      <View style={styles.actionButtonsRow}>
        <AppButton
          label={previewVisible ? "Hide preview" : "Preview"}
          variant="outline"
          icon="sparkles"
          onPress={() => setPreviewVisible((current) => !current)}
        />
        <AppButton
          label={isPublishing ? "Publishing…" : "Publish post"}
          disabled={isPublishing || !draft.trim()}
          icon={isPublishing ? undefined : "send"}
          onPress={() => { void handlePublish(); }}
        />
      </View>

      {previewVisible ? (
        <Card style={styles.previewCard}>
          <Text style={[styles.previewEyebrow, { color: colors.accent }]}>
            PREVIEW · {audience.toUpperCase()}
          </Text>
          <Text style={[styles.previewText, { color: colors.text }]}>
            {draft.trim() || "Your message will appear here."}
          </Text>
          {selectedImageUri ? (
            <Image
              source={{ uri: selectedImageUri }}
              style={[styles.previewImage, { borderColor: colors.border }]}
              contentFit="cover"
            />
          ) : null}
        </Card>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  composerCard: { gap: 12 },
  inputHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  fieldLabel: { fontSize: 14, fontWeight: "700" },
  characterCount: { fontSize: 12, fontVariant: ["tabular-nums"] },
  textArea: { minHeight: 140, borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 14, lineHeight: 22 },
  attachmentRow: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 12 },
  attachmentHint: { fontSize: 12 },
  removePhotoBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 8 },
  removePhotoText: { fontSize: 13, fontWeight: "600" },
  photoPreviewShell: { borderRadius: 12, overflow: "hidden", borderWidth: 1, height: 180 },
  attachedImage: { width: "100%", height: "100%" },
  audienceBlock: { gap: 9 },
  helperText: { fontSize: 13, lineHeight: 19, marginTop: -4 },
  audienceChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButtonsRow: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
  previewCard: { gap: 10 },
  previewEyebrow: { fontSize: 11, letterSpacing: 0.5, fontWeight: "800" },
  previewText: { fontSize: 14, lineHeight: 22 },
  previewImage: { width: "100%", height: 160, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  pollCreatorCard: { gap: 10, padding: 14, borderRadius: 14 },
  pollCreatorHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pollCreatorTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  pollTagEmoji: { fontSize: 16 },
  pollInputsWrap: { gap: 8, marginTop: 4 },
  pollInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13 },
  pollOptionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  removeOptionBtn: { padding: 4 },
  addOptionBtn: { paddingVertical: 6 },
  addOptionText: { fontSize: 13, fontWeight: "700" },
});
