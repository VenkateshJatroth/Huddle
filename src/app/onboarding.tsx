import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Icon";
import { AppButton, Card, ChoiceChip } from "../components/ui";
import {
  uploadProfileImage,
  upsertGormatiProfile,
} from "../lib/gormati-profiles";
import type { GormatiProfileDraft } from "../lib/gormati-profiles";
import { useAppColors } from "../theme/colors";

const DATING_INTENTIONS = ["Long-term", "Friends", "Casual", "Unsure"];
const INTEREST_OPTIONS = [
  "Books", "Food", "Music", "Travel", "Photography",
  "Cycling", "Technology", "Arts", "Wellness", "Fitness",
  "Cooking", "Gaming",
];
const AVAILABLE_PROMPTS = [
  "A typical Sunday for me looks like…",
  "My favorite conversation starter is…",
  "The quickest way to my heart is…",
  "I'm looking for someone who…",
];

export default function OnboardingScreen() {
  const colors = useAppColors();
  const { user } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarRemoteUrl, setAvatarRemoteUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [draft, setDraft] = useState<GormatiProfileDraft>({
    full_name: "",
    display_name: "",
    username: "",
    bio: "",
    age: "",
    location: "",
    dating_intention: "Long-term",
    interests: [],
    prompts: [{ question: AVAILABLE_PROMPTS[0], answer: "" }],
    is_private: false,
  });

  const pickImage = async () => {
    if (!user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Allow Gormati access to your photos to set your profile picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const localUri = result.assets[0].uri;
    setAvatarUri(localUri);
    setIsUploadingPhoto(true);
    setErrorMsg(null);

    try {
      const publicUrl = await uploadProfileImage(user.id, localUri, "avatars");
      setAvatarRemoteUrl(publicUrl);
    } catch {
      // Local preview is kept; remote upload can retry or proceed
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setDraft((d) => ({
      ...d,
      interests: d.interests.includes(interest)
        ? d.interests.filter((i) => i !== interest)
        : [...d.interests, interest],
    }));
  };

  const handleNext = () => {
    setErrorMsg(null);
    if (step === 1) {
      if (!draft.full_name.trim()) {
        setErrorMsg("Please enter your name.");
        return;
      }
      if (!draft.age.trim()) {
        setErrorMsg("Please enter your age.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!draft.bio.trim()) {
        setErrorMsg("Please write a short introduction about yourself.");
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (draft.interests.length === 0) {
        setErrorMsg("Select at least one interest to help others find you.");
        return;
      }
      setStep(4);
    } else if (step === 4) {
      void handleFinish();
    }
  };

  const handleFinish = async () => {
    if (!user) return;
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const finalDraft = {
        ...draft,
        display_name: draft.full_name.trim(),
        username: draft.username.trim() || `member_${user.id.slice(0, 6)}`,
        avatar_url: avatarRemoteUrl ?? null,
      };

      await upsertGormatiProfile(user.id, finalDraft);
      router.replace("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save profile.";
      setErrorMsg(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header Branding */}
        <View style={styles.brandRow}>
          <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
            <Icon name="sparkles" color="#FFFFFF" size={18} />
          </View>
          <Text style={[styles.brandTitle, { color: colors.text }]}>Gormati</Text>
        </View>

        {/* Step Progress Indicator */}
        <View style={styles.progressRow}>
          {[1, 2, 3, 4].map((s) => (
            <View
              key={s}
              style={[
                styles.progressBar,
                { backgroundColor: s <= step ? colors.accent : colors.border },
              ]}
            />
          ))}
        </View>

        {/* Step 1: Photo & Core Details */}
        {step === 1 ? (
          <Card style={styles.card}>
            <Text style={[styles.stepEyebrow, { color: colors.secondary }]}>Step 1 of 4</Text>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Welcome to Gormati</Text>
            <Text style={[styles.stepSubtitle, { color: colors.secondary }]}>
              Let&apos;s set up your profile so people in your community can recognize you.
            </Text>

            <View style={styles.avatarSection}>
              <Pressable
                onPress={() => { void pickImage(); }}
                style={[styles.avatarBox, { borderColor: colors.border, backgroundColor: colors.subtle }]}
              >
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Icon name="photo" color={colors.secondary} size={30} />
                    <Text style={[styles.avatarUploadText, { color: colors.secondary }]}>
                      {isUploadingPhoto ? "Uploading…" : "Add photo"}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Full name</Text>
              <TextInput
                value={draft.full_name}
                onChangeText={(full_name) => setDraft((d) => ({ ...d, full_name }))}
                placeholder="Your full name"
                placeholderTextColor={colors.secondary}
                style={[styles.textInput, { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Age</Text>
                <TextInput
                  value={draft.age}
                  onChangeText={(age) => setDraft((d) => ({ ...d, age }))}
                  placeholder="24"
                  keyboardType="numeric"
                  maxLength={3}
                  placeholderTextColor={colors.secondary}
                  style={[styles.textInput, { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text }]}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 2 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Location</Text>
                <TextInput
                  value={draft.location}
                  onChangeText={(location) => setDraft((d) => ({ ...d, location }))}
                  placeholder="e.g. Pune, MH"
                  placeholderTextColor={colors.secondary}
                  style={[styles.textInput, { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text }]}
                />
              </View>
            </View>
          </Card>
        ) : null}

        {/* Step 2: Dating Intention & Bio */}
        {step === 2 ? (
          <Card style={styles.card}>
            <Text style={[styles.stepEyebrow, { color: colors.secondary }]}>Step 2 of 4</Text>
            <Text style={[styles.stepTitle, { color: colors.text }]}>What are you looking for?</Text>
            <Text style={[styles.stepSubtitle, { color: colors.secondary }]}>
              Be intentional about the kind of connections you want to make.
            </Text>

            <View style={styles.chipsRow}>
              {DATING_INTENTIONS.map((intention) => (
                <ChoiceChip
                  key={intention}
                  label={intention}
                  selected={draft.dating_intention === intention}
                  onPress={() => setDraft((d) => ({ ...d, dating_intention: intention }))}
                />
              ))}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Your bio</Text>
              <TextInput
                value={draft.bio}
                onChangeText={(bio) => setDraft((d) => ({ ...d, bio }))}
                placeholder="Share a short summary of who you are and what brings you here…"
                placeholderTextColor={colors.secondary}
                multiline
                numberOfLines={4}
                style={[styles.textInput, styles.multilineInput, { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text }]}
              />
            </View>
          </Card>
        ) : null}

        {/* Step 3: Interests */}
        {step === 3 ? (
          <Card style={styles.card}>
            <Text style={[styles.stepEyebrow, { color: colors.secondary }]}>Step 3 of 4</Text>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Your interests</Text>
            <Text style={[styles.stepSubtitle, { color: colors.secondary }]}>
              Pick passions and hobbies that spark meaningful conversation.
            </Text>

            <View style={styles.chipsGrid}>
              {INTEREST_OPTIONS.map((interest) => (
                <ChoiceChip
                  key={interest}
                  label={interest}
                  selected={draft.interests.includes(interest)}
                  onPress={() => toggleInterest(interest)}
                />
              ))}
            </View>
          </Card>
        ) : null}

        {/* Step 4: Prompts */}
        {step === 4 ? (
          <Card style={styles.card}>
            <Text style={[styles.stepEyebrow, { color: colors.secondary }]}>Step 4 of 4</Text>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Conversation prompt</Text>
            <Text style={[styles.stepSubtitle, { color: colors.secondary }]}>
              Select a conversation prompt and craft your personal answer.
            </Text>

            <View style={styles.chipsRow}>
              {AVAILABLE_PROMPTS.map((prompt) => (
                <ChoiceChip
                  key={prompt}
                  label={prompt}
                  selected={draft.prompts[0]?.question === prompt}
                  onPress={() => {
                    const currentAnswer = draft.prompts[0]?.answer ?? "";
                    setDraft((d) => ({
                      ...d,
                      prompts: [{ question: prompt, answer: currentAnswer }],
                    }));
                  }}
                />
              ))}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {draft.prompts[0]?.question ?? "Your answer"}
              </Text>
              <TextInput
                value={draft.prompts[0]?.answer ?? ""}
                onChangeText={(answer) => {
                  const q = draft.prompts[0]?.question ?? AVAILABLE_PROMPTS[0];
                  setDraft((d) => ({
                    ...d,
                    prompts: [{ question: q, answer }],
                  }));
                }}
                placeholder="Write your answer…"
                placeholderTextColor={colors.secondary}
                multiline
                numberOfLines={3}
                style={[styles.textInput, styles.multilineInput, { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text }]}
              />
            </View>
          </Card>
        ) : null}

        {errorMsg ? (
          <Text style={[styles.errorText, { color: colors.accentStrong }]}>{errorMsg}</Text>
        ) : null}

        {/* Navigation Buttons */}
        <View style={styles.buttonRow}>
          {step > 1 ? (
            <AppButton
              label="Back"
              variant="outline"
              disabled={isSaving}
              onPress={() => setStep((s) => s - 1)}
            />
          ) : null}
          <View style={{ flex: 1 }}>
            <AppButton
              label={
                isSaving
                  ? "Saving…"
                  : step === 4
                  ? "Finish profile"
                  : "Continue"
              }
              disabled={isSaving || isUploadingPhoto}
              onPress={handleNext}
            />
          </View>
        </View>

        {isSaving ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { padding: 20, gap: 16, paddingTop: 40 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "center", marginBottom: 8 },
  brandMark: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  brandTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  progressRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  card: { padding: 18, gap: 14 },
  stepEyebrow: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  stepTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  stepSubtitle: { fontSize: 13, lineHeight: 18 },
  avatarSection: { alignItems: "center", marginVertical: 8 },
  avatarBox: {
    width: 90,
    height: 90,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: "dashed",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarPlaceholder: { alignItems: "center", gap: 4 },
  avatarUploadText: { fontSize: 11, fontWeight: "600" },
  inputGroup: { gap: 6 },
  inputRow: { flexDirection: "row", gap: 12 },
  inputLabel: { fontSize: 13, fontWeight: "700" },
  textInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 88,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  errorText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
});

