import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Icon";
import { AppButton, Card, ChoiceChip } from "../components/ui";
import {
  fetchFullProfile,
  uploadProfileImage,
  upsertGormatiProfile,
  type GormatiProfileDraft,
} from "../lib/gormati-profiles";
import { getProfileCompletion } from "../lib/profileCompletion";
import { supabase } from "../lib/supabase";
import { useAppColors } from "../theme/colors";

const DATING_INTENTIONS = ["Community", "Friends", "Long-term", "Casual"];

const INTEREST_OPTIONS = [
  "Books",
  "Food",
  "Music",
  "Travel",
  "Photography",
  "Cycling",
  "Technology",
  "Arts",
  "Wellness",
  "Fitness",
  "Cooking",
  "Gaming",
  "Culture",
  "Hiking",
  "Cinema",
];

export default function OnboardingProfileScreen() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [datingIntention, setDatingIntention] = useState("Community");
  const [interests, setInterests] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Block Android hardware back button
  useEffect(() => {
    const onBackPress = () => {
      Alert.alert(
        "Profile Setup Required",
        "Please complete your profile details before exploring the GorMati community.",
        [{ text: "Continue Setup" }],
      );
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, []);

  // Prepopulate from existing profile if user already has partial data
  useEffect(() => {
    let isCurrent = true;
    async function loadExisting() {
      if (!user) return;
      try {
        const existing = await fetchFullProfile(user.id);
        if (!isCurrent || !existing) return;

        if (existing.display_name && existing.display_name !== "Member") {
          setDisplayName(existing.display_name);
        } else if (user.user_metadata?.full_name) {
          setDisplayName(user.user_metadata.full_name);
        }

        if (existing.username && !existing.username.startsWith("user_")) {
          setUsername(existing.username);
        } else if (user.user_metadata?.username) {
          setUsername(user.user_metadata.username);
        }

        if (existing.bio) setBio(existing.bio);
        if (existing.location) setLocation(existing.location);
        if (existing.dating_intention) setDatingIntention(existing.dating_intention);
        if (Array.isArray(existing.interests)) setInterests(existing.interests as string[]);
        if (existing.avatar_url) setAvatarUrl(existing.avatar_url);
      } catch {
        // Non-blocking
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    void loadExisting();
    return () => {
      isCurrent = false;
    };
  }, [user]);

  // Live profile completion calculation
  const currentDraft = {
    display_name: displayName,
    username,
    bio,
    location,
    dating_intention: datingIntention,
    interests,
    avatar_url: avatarUrl ?? localAvatarUri,
  };
  const completion = getProfileCompletion(currentDraft);

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  };

  const handlePickPhoto = async () => {
    if (!user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Please grant photo access so you can choose a profile picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setLocalAvatarUri(uri);
    setIsUploadingPhoto(true);
    setErrorMessage(null);

    try {
      const publicUrl = await uploadProfileImage(user.id, uri, "avatars");
      setAvatarUrl(publicUrl);
    } catch {
      // Keep local URI preview so user is not blocked
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveAndContinue = async () => {
    if (!user) return;
    setErrorMessage(null);

    if (!completion.isCoreComplete) {
      Alert.alert(
        "Complete Required Details",
        `Please address the following before continuing:\n• ${completion.missingFields.slice(0, 3).join("\n• ")}`,
      );
      return;
    }

    setIsSaving(true);
    try {
      const finalUsername =
        username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "") ||
        `member_${user.id.slice(0, 8)}`;

      const draftToSave: Partial<GormatiProfileDraft> & { avatar_url?: string | null } = {
        full_name: displayName.trim(),
        display_name: displayName.trim(),
        username: finalUsername,
        bio: bio.trim(),
        location: location.trim(),
        dating_intention: datingIntention,
        interests,
        avatar_url: avatarUrl ?? localAvatarUri,
        is_private: false,
      };

      await upsertGormatiProfile(user.id, draftToSave);
      router.replace("/(tabs)");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save profile. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/(auth)/sign-in" as never);
    } catch {
      // fallback
      router.replace("/(auth)/sign-in" as never);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.secondary }]}>
          Loading profile setup…
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top + 16, 24),
            paddingBottom: Math.max(insets.bottom + 24, 32),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand & Progress Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
              <Icon name="sparkles" color="#FFFFFF" size={18} />
            </View>
            <View>
              <Text style={[styles.brandTitle, { color: colors.text }]}>GorMati</Text>
              <Text style={[styles.brandSubtitle, { color: colors.secondary }]}>
                Mandatory Profile Setup
              </Text>
            </View>
          </View>

          <Card style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressTitle, { color: colors.text }]}>Profile Completion</Text>
              <View style={[styles.percentBadge, { backgroundColor: colors.subtle }]}>
                <Text style={[styles.percentText, { color: colors.accent }]}>
                  {completion.completionPercentage}%
                </Text>
              </View>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.subtle }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(8, completion.completionPercentage)}%`,
                    backgroundColor: completion.isCoreComplete ? "#10B981" : colors.accent,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressHelp, { color: colors.secondary }]}>
              {completion.isCoreComplete
                ? "✓ Core requirements satisfied! You are ready to enter."
                : `Complete all mandatory fields to unlock community access (${completion.missingFields.length} remaining)`}
            </Text>
          </Card>
        </View>

        {/* 1. Photo Section */}
        <Card style={styles.formCard}>
          <Text style={[styles.fieldSectionTitle, { color: colors.text }]}>1. Profile Photo</Text>
          <Text style={[styles.fieldHelp, { color: colors.secondary }]}>
            Members with a photo receive 5x more circle connections.
          </Text>

          <View style={styles.photoRow}>
            <Pressable
              onPress={handlePickPhoto}
              disabled={isUploadingPhoto}
              style={[
                styles.photoCircle,
                { backgroundColor: colors.subtle, borderColor: colors.border },
              ]}
            >
              {avatarUrl || localAvatarUri ? (
                <Image
                  source={{ uri: avatarUrl || localAvatarUri || "" }}
                  style={styles.photoImage}
                  contentFit="cover"
                />
              ) : (
                <Icon name="photo" color={colors.secondary} size={36} />
              )}
              {isUploadingPhoto ? (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>

            <View style={styles.photoActions}>
              <AppButton
                label={avatarUrl || localAvatarUri ? "Change Photo" : "Upload Photo"}
                icon="photo"
                variant="outline"
                onPress={handlePickPhoto}
                disabled={isUploadingPhoto}
              />
              <Text
                style={[
                  styles.photoStatusText,
                  { color: avatarUrl || localAvatarUri ? "#10B981" : colors.secondary },
                ]}
              >
                {avatarUrl || localAvatarUri ? "✓ Photo added" : "• Photo required"}
              </Text>
            </View>
          </View>
        </Card>

        {/* 2. Identity Section */}
        <Card style={styles.formCard}>
          <Text style={[styles.fieldSectionTitle, { color: colors.text }]}>2. Identity & Location</Text>

          {/* Display Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Display Name <Text style={{ color: colors.accent }}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text },
              ]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Venky Jatroth"
              placeholderTextColor={colors.secondary}
              maxLength={50}
            />
          </View>

          {/* Handle */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Username / Handle</Text>
            <View style={styles.handleInputWrap}>
              <Text style={[styles.handlePrefix, { color: colors.secondary }]}>@</Text>
              <TextInput
                style={[
                  styles.textInput,
                  styles.handleInput,
                  { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text },
                ]}
                value={username}
                onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                placeholder="venky.jatroth"
                placeholderTextColor={colors.secondary}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
              />
            </View>
          </View>

          {/* Location */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              City / Location <Text style={{ color: colors.accent }}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text },
              ]}
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Dubai, UAE or Hyderabad, India"
              placeholderTextColor={colors.secondary}
              maxLength={80}
            />
          </View>

          {/* Dating / Community Intention */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Primary Community Goal</Text>
            <View style={styles.chipsWrap}>
              {DATING_INTENTIONS.map((intention) => (
                <ChoiceChip
                  key={intention}
                  label={intention}
                  selected={datingIntention === intention}
                  onPress={() => setDatingIntention(intention)}
                />
              ))}
            </View>
          </View>
        </Card>

        {/* 3. Bio Section */}
        <Card style={styles.formCard}>
          <View style={styles.fieldHeaderRow}>
            <Text style={[styles.fieldSectionTitle, { color: colors.text }]}>
              3. About You (Bio) <Text style={{ color: colors.accent }}>*</Text>
            </Text>
            <Text
              style={[
                styles.counterText,
                { color: bio.trim().length >= 15 ? "#10B981" : colors.secondary },
              ]}
            >
              {bio.trim().length}/15 chars min
            </Text>
          </View>
          <Text style={[styles.fieldHelp, { color: colors.secondary }]}>
            Write at least 15 characters introducing yourself, what you do, or what makes you curious.
          </Text>

          <TextInput
            style={[
              styles.textArea,
              { backgroundColor: colors.subtle, borderColor: colors.border, color: colors.text },
            ]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell the community a little about your passions, background, and what you’re looking forward to…"
            placeholderTextColor={colors.secondary}
            multiline
            numberOfLines={4}
            maxLength={300}
            textAlignVertical="top"
          />
        </Card>

        {/* 4. Interests Section */}
        <Card style={styles.formCard}>
          <View style={styles.fieldHeaderRow}>
            <Text style={[styles.fieldSectionTitle, { color: colors.text }]}>
              4. Interests <Text style={{ color: colors.accent }}>*</Text>
            </Text>
            <View
              style={[
                styles.badgePill,
                { backgroundColor: interests.length >= 3 ? "#DCFCE7" : colors.subtle },
              ]}
            >
              <Text
                style={[
                  styles.badgePillText,
                  { color: interests.length >= 3 ? "#15803D" : colors.secondary },
                ]}
              >
                {interests.length}/3 selected
              </Text>
            </View>
          </View>
          <Text style={[styles.fieldHelp, { color: colors.secondary }]}>
            Pick at least 3 topics to personalize your circles and recommend like-minded members.
          </Text>

          <View style={styles.chipsWrap}>
            {INTEREST_OPTIONS.map((interest) => (
              <ChoiceChip
                key={interest}
                label={interest}
                selected={interests.includes(interest)}
                onPress={() => toggleInterest(interest)}
              />
            ))}
          </View>
        </Card>

        {/* Missing Requirements List (if any) */}
        {!completion.isCoreComplete && completion.missingFields.length > 0 ? (
          <Card style={[styles.alertCard, { backgroundColor: colors.subtle, borderColor: colors.border }]}>
            <Text style={[styles.alertTitle, { color: colors.text }]}>Remaining Required Steps:</Text>
            {completion.missingFields.map((f, i) => (
              <Text key={i} style={[styles.alertItem, { color: colors.secondary }]}>
                • {f}
              </Text>
            ))}
          </Card>
        ) : null}

        {errorMessage ? (
          <Text style={[styles.errorBanner, { color: colors.accentStrong }]}>{errorMessage}</Text>
        ) : null}

        {/* Submit Action */}
        <View style={styles.actionContainer}>
          <AppButton
            label={isSaving ? "Saving Profile…" : "Save Profile & Enter GorMati"}
            disabled={!completion.isCoreComplete || isSaving || isUploadingPhoto}
            onPress={() => {
              void handleSaveAndContinue();
            }}
          />

          <Pressable onPress={() => { void handleSignOut(); }} style={styles.signOutButton}>
            <Text style={[styles.signOutText, { color: colors.secondary }]}>
              Want to switch accounts? Sign out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  loadingText: { fontSize: 14 },
  container: {
    paddingHorizontal: 16,
    gap: 16,
  },
  header: {
    gap: 12,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressCard: {
    padding: 14,
    gap: 8,
    borderRadius: 16,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  percentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  percentText: {
    fontSize: 12,
    fontWeight: "800",
  },
  progressTrack: {
    width: "100%",
    height: 7,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressHelp: {
    fontSize: 12,
  },
  formCard: {
    padding: 16,
    gap: 12,
    borderRadius: 16,
  },
  fieldHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldSectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  fieldHelp: {
    fontSize: 12,
    lineHeight: 17,
  },
  counterText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 4,
  },
  photoCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: {
    flex: 1,
    gap: 6,
  },
  photoStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  textInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  handleInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  handlePrefix: {
    position: "absolute",
    left: 12,
    zIndex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  handleInput: {
    flex: 1,
    paddingLeft: 28,
  },
  textArea: {
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  alertCard: {
    padding: 12,
    gap: 4,
    borderRadius: 12,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  alertItem: {
    fontSize: 12,
    lineHeight: 18,
  },
  errorBanner: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  actionContainer: {
    gap: 12,
    marginTop: 8,
  },
  signOutButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
