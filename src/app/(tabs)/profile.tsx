import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { User } from "@supabase/supabase-js";
import {
  checkUsernameAvailability,
  isUsernameConflict,
  normalizeUsername,
  ProfileNotFoundError,
  ProfileTableUnavailableError,
} from "../../lib/profiles";
import {
  fetchFullProfile,
  updateGormatiProfile,
  uploadProfileImage,
} from "../../lib/gormati-profiles";
import type { GormatiProfile, GormatiProfileDraft } from "../../lib/gormati-profiles";
import { compressImage } from "../../utils/imageCompression";

import { useAuth } from "../../auth/AuthProvider";
import { DemoAvatar } from "../../components/DemoAvatar";
import { FeedPostCard } from "../../components/FeedPostCard";
import { Icon } from "../../components/Icon";
import { MemberProfileView } from "../../components/MemberProfileView";
import { ProfileCompletionBanner } from "../../components/ProfileCompletionBanner";
import { VoiceIntroCard } from "../../components/VoiceIntroCard";
import {
  checkProfileCompletion,
  checkAndTriggerProfileCompletionReminder,
} from "../../lib/profileCompletion";
import {
  AppScreen,
  AppButton,
  Avatar,
  Card,
  ChoiceChip,
  IconButton,
  LocalPreviewNotice,
  MutedText,
  PageHeading,
  SectionHeading,
} from "../../components/ui";
import {
  deletePost,
  editPost,
  fetchUserPosts,
  subscribeToPosts,
  type PostAudience,
  type PublishedPost,
} from "../../lib/posts";
import { BADGE_DEFINITIONS, getUserBadges } from "../../lib/badges";
import { fetchSavedPosts } from "../../lib/bookmarks";
import { profilePosts } from "../../data/mockData";
import { demoProfilePostDescriptions, demoProfilePostImages } from "../../data/mockMedia";
import {
  fetchRelationshipCounts,
  fetchRelationshipMembers,
} from "../../lib/relationships";
import type { RelationshipCounts, RelationshipProfileSummary } from "../../lib/relationships";
import { useAppColors } from "../../theme/colors";

type ProfileLoadState = "loading" | "ready" | "missing" | "table-missing" | "error";

const DATING_INTENTIONS = ["Long-term", "Friends", "Casual", "Unsure"];
const INTEREST_OPTIONS = [
  "Books", "Food", "Music", "Travel", "Photography",
  "Cycling", "Technology", "Arts", "Wellness", "Fitness",
  "Cooking", "Gaming",
];
const AVAILABLE_PROMPT_QUESTIONS = [
  "A typical Sunday for me looks like…",
  "My favorite conversation starter is…",
  "The quickest way to my heart is…",
  "I'm looking for someone who…",
];

const sampleProfile = {
  display_name: "Aarav Patel",
  username: "aarav.patel",
  bio: "Exploring Ahmedabad one walk, playlist, and cup of chai at a time. Always up for a good conversation.",
};

export default function ProfileScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ userId?: string; id?: string }>();
  const targetUserId = params.userId || params.id;

  // If a specific userId is passed and it's NOT the signed-in user, view their member profile
  if (targetUserId && (!user || targetUserId !== user.id)) {
    return <MemberProfileView memberId={targetUserId} />;
  }

  if (!user) {
    return (
      <AppScreen>
        <PageHeading title="Profile" subtitle="Your story, shared with your community." eyebrow="A little about you" />
        <Card><MutedText>Restoring your signed-in account…</MutedText></Card>
      </AppScreen>
    );
  }

  return <AuthenticatedProfileScreen key={user.id} user={user} />;
}

function draftFromProfile(profile: GormatiProfile): GormatiProfileDraft {
  const existingPrompts = Array.isArray(profile.prompts)
    ? (profile.prompts as { question: string; answer: string }[])
    : [];

  return {
    display_name: profile.display_name ?? "",
    username: profile.username ?? "",
    bio: profile.bio ?? "",
    is_private: profile.is_private ?? true,
    full_name: profile.full_name ?? "",
    age: profile.age != null ? String(profile.age) : "",
    location: profile.location ?? "",
    dating_intention: profile.dating_intention ?? "",
    interests: Array.isArray(profile.interests) ? (profile.interests as string[]) : [],
    prompts: existingPrompts.length > 0
      ? existingPrompts
      : [{ question: AVAILABLE_PROMPT_QUESTIONS[0], answer: "" }],
  };
}

function AuthenticatedProfileScreen({ user }: { user: User }) {
  const colors = useAppColors();
  const params = useLocalSearchParams<{ userId?: string; id?: string; edit?: string }>();
  const [activeSection, setActiveSection] = useState<"Posts" | "Saved" | "Badges" | "About">("Posts");
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [savedPosts, setSavedPosts] = useState<PublishedPost[]>([]);
  const [profile, setProfile] = useState<GormatiProfile | null>(null);
  const [loadState, setLoadState] = useState<ProfileLoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<GormatiProfileDraft>({
    display_name: "",
    username: "",
    bio: "",
    is_private: true,
    full_name: "",
    age: "",
    location: "",
    dating_intention: "",
    interests: [],
    prompts: [],
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [connectionsModalVisible, setConnectionsModalVisible] = useState(false);
  const [connectionsModalTab, setConnectionsModalTab] = useState<"followers" | "following">("followers");
  const [membersList, setMembersList] = useState<{
    followers: RelationshipProfileSummary[];
    following: RelationshipProfileSummary[];
  }>({ followers: [], following: [] });
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [relationshipCounts, setRelationshipCounts] = useState<RelationshipCounts | null>(null);
  const [userCreatedPosts, setUserCreatedPosts] = useState<PublishedPost[]>([]);
  const [editingPost, setEditingPost] = useState<PublishedPost | null>(null);
  const [editText, setEditText] = useState("");
  const [editAudience, setEditAudience] = useState<PostAudience>("Everyone");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const completion = profile ? checkProfileCompletion(profile) : null;

  useEffect(() => {
    if (params.edit === "true" && profile && !isEditing) {
      const timer = setTimeout(() => {
        setDraft(draftFromProfile(profile));
        setSaveError(null);
        setSaveNotice(null);
        setIsEditing(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [params.edit, profile, isEditing]);

  useEffect(() => {
    if (profile) {
      void checkAndTriggerProfileCompletionReminder(user.id, profile);
    }
  }, [user.id, profile]);

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      try {
        const posts = await fetchUserPosts(user.id);
        if (!isCurrent) return;
        setUserCreatedPosts(posts);
      } catch {
        // Fallback
      }
    }
    void load();
    const unsubscribe = subscribeToPosts(() => {
      void load();
    });
    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    let isCurrent = true;
    async function loadBookmarks() {
      try {
        const posts = await fetchSavedPosts(user.id);
        if (!isCurrent) return;
        setSavedPosts(posts);
      } catch {
        // Fallback
      }
    }
    if (activeSection === "Saved") {
      void loadBookmarks();
    }
    return () => {
      isCurrent = false;
    };
  }, [user.id, activeSection]);

  useEffect(() => {
    let isCurrent = true;

    void fetchFullProfile(user.id)
      .then((nextProfile) => {
        if (!isCurrent) return;
        setProfile(nextProfile);
        setLoadState(nextProfile ? "ready" : "missing");
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setProfile(null);
        setLoadState(error instanceof ProfileTableUnavailableError ? "table-missing" : "error");
      });

    return () => { isCurrent = false; };
  }, [user.id, reloadKey]);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;

    void fetchRelationshipCounts(user.id)
      .then((counts) => {
        if (!isCurrent) return;
        setRelationshipCounts(counts);
      })
      .catch(() => {
        if (!isCurrent) return;
        setRelationshipCounts({ followers: 0, following: 0 });
      });

    return () => { isCurrent = false; };
  }, [user.id]));

  function retryProfileLoad() {
    setProfile(null);
    setLoadState("loading");
    setReloadKey((value) => value + 1);
  }

  const openConnectionsModal = async (tab: "followers" | "following") => {
    setConnectionsModalTab(tab);
    setMemberSearchQuery("");
    setConnectionsModalVisible(true);
    setLoadingMembers(true);
    try {
      const data = await fetchRelationshipMembers(user.id);
      setMembersList(data);
    } catch {
      // Safe fallback
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleOpenEdit = (post: PublishedPost) => {
    setEditingPost(post);
    setEditText(post.text);
    setEditAudience(post.audience || "Everyone");
  };

  const handleSaveEdit = async () => {
    if (!editingPost || !editText.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await editPost(editingPost.id, editText.trim(), editAudience);
      setEditingPost(null);
    } catch {
      Alert.alert("Error", "Could not save your changes.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeletePost = async (post: PublishedPost) => {
    try {
      await deletePost(post.id);
    } catch {
      Alert.alert("Error", "Could not delete this post.");
    }
  };

  const startEditing = () => {
    if (!profile) return;
    setDraft(draftFromProfile(profile));
    setSaveError(null);
    setSaveNotice(null);
    setIsEditing(true);
  }

  async function handleShareProfile() {
    try {
      const name = profile?.display_name || user.email?.split("@")[0] || "Huddle Member";
      const handle = profile?.username ? `@${profile.username}` : "";
      const profileUrl = `https://huddle.app/m/${profile?.username || user.id}`;

      await Share.share({
        title: `${name}'s Profile on Huddle`,
        message: `Connect with ${name} ${handle ? `(${handle}) ` : ""}on Huddle — Your people, your place:\n${profileUrl}`,
        url: profileUrl,
      });
    } catch {
      // User cancelled or share error
    }
  }

  async function pickAndUploadAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Allow Huddle to access your photos to change your profile picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    setIsUploadingPhoto(true);
    setSaveError(null);
    try {
      const { uri: compressedUri } = await compressImage(result.assets[0].uri, { type: "avatar" });
      const publicUrl = await uploadProfileImage(user.id, compressedUri, "avatars");
      const updated = await updateGormatiProfile(user.id, { avatar_url: publicUrl });
      setProfile(updated);
      setSaveNotice("Profile photo updated!");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setSaveError(`Photo upload failed: ${msg}`);
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function saveProfile() {
    if (!profile || isSaving) return;

    const nextDraft = { ...draft, username: normalizeUsername(draft.username) };
    setSaveError(null);
    setSaveNotice(null);
    setIsSaving(true);

    try {
      if (nextDraft.username !== profile.username) {
        const available = await checkUsernameAvailability(nextDraft.username, user.id);
        if (!available) {
          setSaveError("That username appears to be in use. Try another one.");
          return;
        }
      }

      const saved = await updateGormatiProfile(user.id, nextDraft);
      setProfile(saved);
      setIsEditing(false);
      setSaveNotice("Your profile changes were saved.");
    } catch (error: unknown) {
      if (error instanceof ProfileNotFoundError) {
        setProfile(null);
        setLoadState("missing");
        setIsEditing(false);
      } else if (error instanceof ProfileTableUnavailableError) {
        setProfile(null);
        setLoadState("table-missing");
        setIsEditing(false);
      } else if (isUsernameConflict(error)) {
        setSaveError("That username is already in use. Try another one.");
      } else {
        setSaveError("We couldn't save your profile. Check your connection and try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  function cancelEditing() {
    setIsEditing(false);
    setSaveError(null);
    setSaveNotice(null);
  }

  const toggleInterest = (interest: string) => {
    setDraft((d) => ({
      ...d,
      interests: d.interests.includes(interest)
        ? d.interests.filter((i) => i !== interest)
        : [...d.interests, interest],
    }));
  };

  return (
    <AppScreen>
      {/* 1. Instagram-Style Top Bar */}
      <View style={styles.igTopBar}>
        <View style={styles.igTopBarLeft}>
          <Text style={[styles.igTopBarUsername, { color: colors.text }]}>
            @{profile?.username || user.email?.split("@")[0] || "member"}
          </Text>
          {profile?.is_verified ? (
            <Icon name="check" color={colors.accent} size={15} />
          ) : null}
          {profile?.is_private ? (
            <Icon name="lock" color={colors.secondary} size={14} />
          ) : null}
        </View>
        <IconButton
          name="settings"
          label="Settings"
          onPress={() => router.push("/settings" as never)}
        />
      </View>

      {loadState === "loading" ? (
        <Card><MutedText>Loading your profile…</MutedText></Card>
      ) : null}

      {loadState === "missing" ? (
        <View style={styles.stateBlock}>
          <LocalPreviewNotice>
            No profile record exists for this account yet. Complete your Huddle onboarding setup to connect with others.
          </LocalPreviewNotice>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <AppButton label="Complete profile" onPress={() => router.push("/onboarding" as never)} />
            <AppButton label="Check again" variant="outline" onPress={retryProfileLoad} />
          </View>
        </View>
      ) : null}

      {loadState === "table-missing" ? (
        <View style={styles.stateBlock}>
          <LocalPreviewNotice>
            The public.profiles table is not available yet. Apply the reviewed migration in your Supabase project, then check again.
          </LocalPreviewNotice>
          <AppButton label="Check again" variant="outline" onPress={retryProfileLoad} />
        </View>
      ) : null}

      {loadState === "error" ? (
        <View style={styles.stateBlock}>
          <LocalPreviewNotice>
            {"We couldn't load your profile. Check your connection and try again."}
          </LocalPreviewNotice>
          <AppButton label="Retry" variant="outline" onPress={retryProfileLoad} />
        </View>
      ) : null}

      {profile && completion && completion.completionPercentage < 100 ? (
        <ProfileCompletionBanner
          completion={completion}
          onCompletePress={startEditing}
          style={{ marginBottom: 14 }}
        />
      ) : null}

      {profile ? (
        <>
          {/* Instagram-Style Profile Header Card */}
          <Card style={styles.igProfileCard}>
            <View style={styles.igHeaderRow}>
              {/* Avatar with tap-to-change photo */}
              <Pressable
                onPress={() => { void pickAndUploadAvatar(); }}
                accessibilityLabel="Change profile photo"
                style={styles.igAvatarWrap}
              >
                <Avatar
                  name={profile.display_name}
                  tone={1}
                  size={84}
                  imageSource={profile.avatar_url ? { uri: profile.avatar_url } : undefined}
                  imageKey={profile.avatar_url ?? profile.id}
                />
                <View style={[styles.igAvatarBadge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.igAvatarBadgeText}>
                    {isUploadingPhoto ? "…" : "+"}
                  </Text>
                </View>
              </Pressable>

              {/* Stats Columns: Posts | Followers | Following */}
              <View style={styles.igStatsRow}>
                <Pressable
                  style={styles.igStatItem}
                  onPress={() => setActiveSection("Posts")}
                  accessibilityRole="button"
                  accessibilityLabel="View your posts"
                >
                  <Text style={[styles.igStatNumber, { color: colors.text }]}>
                    {userCreatedPosts.length}
                  </Text>
                  <Text style={[styles.igStatLabel, { color: colors.secondary }]}>Posts</Text>
                </Pressable>

                <Pressable
                  style={styles.igStatItem}
                  onPress={() => { void openConnectionsModal("followers"); }}
                  accessibilityRole="button"
                  accessibilityLabel="View followers list"
                >
                  <Text style={[styles.igStatNumber, { color: colors.text }]}>
                    {relationshipCounts?.followers ?? 0}
                  </Text>
                  <Text style={[styles.igStatLabel, { color: colors.secondary }]}>Followers</Text>
                </Pressable>

                <Pressable
                  style={styles.igStatItem}
                  onPress={() => { void openConnectionsModal("following"); }}
                  accessibilityRole="button"
                  accessibilityLabel="View following list"
                >
                  <Text style={[styles.igStatNumber, { color: colors.text }]}>
                    {relationshipCounts?.following ?? 0}
                  </Text>
                  <Text style={[styles.igStatLabel, { color: colors.secondary }]}>Following</Text>
                </Pressable>
              </View>
            </View>

            {/* Display Name, Handle & Bio */}
            <View style={styles.igBioSection}>
              <Text style={[styles.igDisplayName, { color: colors.text }]}>
                {profile.display_name}
              </Text>
              <Text style={[styles.igHandle, { color: colors.secondary }]}>
                @{profile.username}
              </Text>

              {profile.bio ? (
                <Text style={[styles.igBioText, { color: colors.text }]}>
                  {profile.bio}
                </Text>
              ) : null}

              {/* Details Pills: Location, Age, Looking For */}
              {(profile.location || profile.dating_intention || profile.age) ? (
                <View style={styles.igDetailsPills}>
                  {profile.location ? (
                    <View style={[styles.igPill, { backgroundColor: colors.subtle }]}>
                      <Icon name="location" color={colors.accent} size={12} />
                      <Text style={[styles.igPillText, { color: colors.text }]}>{profile.location}</Text>
                    </View>
                  ) : null}
                  {profile.age ? (
                    <View style={[styles.igPill, { backgroundColor: colors.subtle }]}>
                      <Text style={[styles.igPillText, { color: colors.text }]}>{profile.age} yrs</Text>
                    </View>
                  ) : null}
                  {profile.dating_intention ? (
                    <View style={[styles.igPill, { backgroundColor: colors.subtle }]}>
                      <Icon name="heart" color={colors.accent} size={12} />
                      <Text style={[styles.igPillText, { color: colors.text }]}>{profile.dating_intention}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* Action Buttons: Edit Profile & Share Profile */}
            <View style={styles.igActionsRow}>
              <Pressable
                accessibilityRole="button"
                style={[styles.igActionButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={startEditing}
              >
                <Text style={[styles.igActionButtonText, { color: colors.text }]}>Edit Profile</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={[styles.igShareButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => { void handleShareProfile(); }}
              >
                <Icon name="share" color={colors.text} size={16} />
              </Pressable>
            </View>
          </Card>

          {/* 15-Second Voice Introduction */}
          <VoiceIntroCard
            userId={user.id}
            voiceUrl={profile.voice_intro_url}
            durationSec={profile.voice_duration_sec || 15}
            isOwner
            onVoiceSaved={(newUrl, dur) => {
              setProfile((prev) =>
                prev ? { ...prev, voice_intro_url: newUrl, voice_duration_sec: dur } : prev,
              );
            }}
          />
        </>
      ) : loadState !== "loading" ? (
        <SampleProfileCard
          onShare={() => { void handleShareProfile(); }}
        />
      ) : null}

      {/* ---- Edit form ---- */}
      {profile && isEditing ? (
        <Card style={styles.editorCard}>
          <SectionHeading title="Edit profile" />

          <ProfileField
            label="Full name"
            value={draft.full_name}
            onChangeText={(full_name) => setDraft((d) => ({ ...d, full_name }))}
            accessibilityLabel="Full name"
            maxLength={80}
          />
          <ProfileField
            label="Display name"
            value={draft.display_name}
            onChangeText={(display_name) => setDraft((d) => ({ ...d, display_name }))}
            accessibilityLabel="Display name"
            maxLength={80}
          />
          <ProfileField
            label="Username (Handle)"
            value={draft.username}
            onChangeText={(username) => {
              const clean = username.toLowerCase().replace(/[^a-z0-9._]/g, "");
              setDraft((d) => ({ ...d, username: clean }));
            }}
            accessibilityLabel="Username"
            maxLength={30}
            autoCapitalize="none"
            autoCorrect={false}
            prefix="@"
            helper="Your custom Instagram-style handle (e.g. @alex.travels)"
          />
          <ProfileField
            label="Bio"
            value={draft.bio}
            onChangeText={(bio) => setDraft((d) => ({ ...d, bio }))}
            accessibilityLabel="Bio"
            multiline
            helper={`${Array.from(draft.bio).length}/280`}
          />
          <ProfileField
            label="Age"
            value={draft.age}
            onChangeText={(age) => setDraft((d) => ({ ...d, age }))}
            accessibilityLabel="Age"
            maxLength={3}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ProfileField
            label="Location"
            value={draft.location}
            onChangeText={(location) => setDraft((d) => ({ ...d, location }))}
            accessibilityLabel="Location"
            maxLength={100}
          />

          {/* Dating intention */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Looking for</Text>
            <View style={styles.chips}>
              {DATING_INTENTIONS.map((intention) => (
                <ChoiceChip
                  key={intention}
                  label={intention}
                  selected={draft.dating_intention === intention}
                  onPress={() => setDraft((d) => ({ ...d, dating_intention: intention }))}
                />
              ))}
            </View>
          </View>

          {/* Interests */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Interests</Text>
            <View style={styles.chips}>
              {INTEREST_OPTIONS.map((interest) => (
                <ChoiceChip
                  key={interest}
                  label={interest}
                  selected={draft.interests.includes(interest)}
                  onPress={() => toggleInterest(interest)}
                />
              ))}
            </View>
          </View>

          {/* Prompt Cards */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Huddle prompt</Text>
            <View style={styles.chips}>
              {AVAILABLE_PROMPT_QUESTIONS.map((question) => (
                <ChoiceChip
                  key={question}
                  label={question}
                  selected={draft.prompts[0]?.question === question}
                  onPress={() => {
                    const currentAnswer = draft.prompts[0]?.answer ?? "";
                    setDraft((d) => ({
                      ...d,
                      prompts: [{ question, answer: currentAnswer }],
                    }));
                  }}
                />
              ))}
            </View>
            <ProfileField
              label={draft.prompts[0]?.question ?? "Your answer"}
              value={draft.prompts[0]?.answer ?? ""}
              onChangeText={(answer) => {
                const currentQuestion = draft.prompts[0]?.question ?? AVAILABLE_PROMPT_QUESTIONS[0];
                setDraft((d) => ({
                  ...d,
                  prompts: [{ question: currentQuestion, answer }],
                }));
              }}
              accessibilityLabel="Prompt answer"
              multiline
              maxLength={200}
              helper={`${Array.from(draft.prompts[0]?.answer ?? "").length}/200`}
            />
          </View>

          {/* Privacy */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Profile privacy</Text>
            <View style={styles.chips}>
              <ChoiceChip
                label="Private"
                selected={draft.is_private}
                onPress={() => setDraft((d) => ({ ...d, is_private: true }))}
              />
              <ChoiceChip
                label="Public"
                selected={!draft.is_private}
                onPress={() => setDraft((d) => ({ ...d, is_private: false }))}
              />
            </View>
            <Text style={[styles.fieldHint, { color: colors.secondary }]}>
              {draft.is_private
                ? "Only you can view this profile."
                : "Signed-in Huddle members can view this profile."}
            </Text>
          </View>

          {saveError ? (
            <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: colors.accentStrong }]}>
              {saveError}
            </Text>
          ) : null}

          <View style={styles.editorActions}>
            <AppButton label="Cancel" variant="outline" disabled={isSaving} onPress={cancelEditing} />
            <AppButton
              label={isSaving ? "Saving…" : "Save changes"}
              disabled={isSaving}
              onPress={() => { void saveProfile(); }}
            />
          </View>
        </Card>
      ) : null}

      {saveNotice ? (
        <Text accessibilityLiveRegion="polite" style={[styles.successText, { color: colors.success }]}>
          {saveNotice}
        </Text>
      ) : null}

      <View style={styles.tabs}>
        <ChoiceChip label="Posts" selected={activeSection === "Posts"} onPress={() => setActiveSection("Posts")} />
        <ChoiceChip label="Saved" selected={activeSection === "Saved"} onPress={() => setActiveSection("Saved")} />
        <ChoiceChip label="Badges" selected={activeSection === "Badges"} onPress={() => setActiveSection("Badges")} />
        <ChoiceChip label="About" selected={activeSection === "About"} onPress={() => setActiveSection("About")} />
      </View>

      {activeSection === "Posts" ? (
        <>
          {userCreatedPosts.length > 0 ? (
            <>
              <SectionHeading title="Your posts" />
              {userCreatedPosts.map((post) => (
                <FeedPostCard
                  key={post.id}
                  post={post}
                  liked={Boolean(likedPosts[post.id])}
                  mediaSource={post.image_url ? { uri: post.image_url } : undefined}
                  currentUserId={user.id}
                  onToggleLike={() => setLikedPosts((current) => ({ ...current, [post.id]: !current[post.id] }))}
                  onEditPost={handleOpenEdit}
                  onDeletePost={handleDeletePost}
                />
              ))}
            </>
          ) : null}

          <SectionHeading title={userCreatedPosts.length > 0 ? "Sample community posts" : "Sample posts"} />
          <LocalPreviewNotice>These example posts are not connected to your profile or saved in Supabase.</LocalPreviewNotice>
          {profilePosts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              liked={Boolean(likedPosts[post.id])}
              demoAvatarId={post.id}
              mediaSource={demoProfilePostImages[post.id]}
              mediaAccessibilityLabel={demoProfilePostDescriptions[post.id]}
              onToggleLike={() => setLikedPosts((current) => ({ ...current, [post.id]: !current[post.id] }))}
            />
          ))}
        </>
      ) : activeSection === "Saved" ? (
        <View style={{ gap: 12 }}>
          <SectionHeading title="Saved Bookmarks" />
          {savedPosts.length > 0 ? (
            savedPosts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                liked={Boolean(likedPosts[post.id])}
                mediaSource={post.image_url ? { uri: post.image_url } : undefined}
                currentUserId={user.id}
                onToggleLike={() => setLikedPosts((current) => ({ ...current, [post.id]: !current[post.id] }))}
                onEditPost={handleOpenEdit}
                onDeletePost={handleDeletePost}
              />
            ))
          ) : (
            <Card style={[styles.emptySavedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Icon name="bookmark" color={colors.accent} size={30} />
              <Text style={[styles.emptySavedTitle, { color: colors.text }]}>No saved posts yet</Text>
              <Text style={[styles.emptySavedSub, { color: colors.secondary }]}>
                Tap the bookmark icon on any post in your community feed to save it for quick reference later.
              </Text>
            </Card>
          )}
        </View>
      ) : activeSection === "Badges" ? (
        <View style={{ gap: 12 }}>
          <SectionHeading title="Achievements & Roles" />
          <Card style={[styles.badgesContainerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.badgesSummary, { color: colors.secondary }]}>
              Badges are automatically unlocked as you maintain posting streaks, contribute to circles, and attend meetups.
            </Text>

            <View style={styles.badgeList}>
              {Object.values(BADGE_DEFINITIONS).map((badge) => {
                const userBadges = getUserBadges({
                  currentStreak: (profile as any)?.current_streak ?? 1,
                  longestStreak: (profile as any)?.longest_streak ?? 1,
                  totalPosts: (profile as any)?.total_posts ?? userCreatedPosts.length,
                  isVerified: true,
                });
                const isUnlocked = userBadges.some((b) => b.id === badge.id);

                return (
                  <View
                    key={badge.id}
                    style={[
                      styles.badgeItemRow,
                      {
                        backgroundColor: isUnlocked ? colors.subtle : colors.surface,
                        borderColor: isUnlocked ? colors.accentSoft : colors.border,
                        opacity: isUnlocked ? 1 : 0.6,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.badgeIconCircle,
                        { backgroundColor: isUnlocked ? badge.bgLight : colors.border },
                      ]}
                    >
                      <Text style={styles.badgeIconEmoji}>{badge.emoji}</Text>
                    </View>
                    <View style={styles.badgeItemTextWrap}>
                      <View style={styles.badgeNameRow}>
                        <Text style={[styles.badgeItemName, { color: colors.text }]}>
                          {badge.name}
                        </Text>
                        <View
                          style={[
                            styles.badgeStatusPill,
                            { backgroundColor: isUnlocked ? "#DCFCE7" : colors.subtle },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeStatusText,
                              { color: isUnlocked ? "#15803D" : colors.secondary },
                            ]}
                          >
                            {isUnlocked ? "UNLOCKED" : "LOCKED"}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.badgeItemDesc, { color: colors.secondary }]}>
                        {badge.description}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {/* Bio & Overview */}
          <Card style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SectionHeading title="Bio & Story" />
            <Text style={[styles.aboutText, { color: colors.text }]}>
              {profile?.bio || "No bio added yet. Tap Edit Profile to share a few words about yourself."}
            </Text>
          </Card>

          {/* Core Profile Details */}
          <Card style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SectionHeading title="Details" />
            <View style={styles.aboutDetailsList}>
              <View style={styles.aboutDetailRow}>
                <Text style={[styles.aboutDetailLabel, { color: colors.secondary }]}>Display Name</Text>
                <Text style={[styles.aboutDetailValue, { color: colors.text }]}>{profile?.display_name || "—"}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.aboutDetailRow}>
                <Text style={[styles.aboutDetailLabel, { color: colors.secondary }]}>Username</Text>
                <Text style={[styles.aboutDetailValue, { color: colors.accent }]}>@{profile?.username || "—"}</Text>
              </View>
              {profile?.location ? (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.aboutDetailRow}>
                    <Text style={[styles.aboutDetailLabel, { color: colors.secondary }]}>Location</Text>
                    <Text style={[styles.aboutDetailValue, { color: colors.text }]}>{profile.location}</Text>
                  </View>
                </>
              ) : null}
              {profile?.age ? (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.aboutDetailRow}>
                    <Text style={[styles.aboutDetailLabel, { color: colors.secondary }]}>Age</Text>
                    <Text style={[styles.aboutDetailValue, { color: colors.text }]}>{profile.age} years</Text>
                  </View>
                </>
              ) : null}
              {profile?.dating_intention ? (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.aboutDetailRow}>
                    <Text style={[styles.aboutDetailLabel, { color: colors.secondary }]}>Looking For</Text>
                    <Text style={[styles.aboutDetailValue, { color: colors.text }]}>{profile.dating_intention}</Text>
                  </View>
                </>
              ) : null}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.aboutDetailRow}>
                <Text style={[styles.aboutDetailLabel, { color: colors.secondary }]}>Profile Visibility</Text>
                <Text style={[styles.aboutDetailValue, { color: colors.text }]}>
                  {profile?.is_private ? "Private" : "Public"}
                </Text>
              </View>
            </View>
          </Card>

          {/* Interests */}
          {Array.isArray(profile?.interests) && (profile.interests as string[]).length > 0 ? (
            <Card style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SectionHeading title="Interests & Passions" />
              <View style={styles.chips}>
                {(profile.interests as string[]).map((interest) => (
                  <ChoiceChip key={interest} label={interest} />
                ))}
              </View>
            </Card>
          ) : null}

          {/* Prompts */}
          {Array.isArray(profile?.prompts) && (profile.prompts as { question: string; answer: string }[]).length > 0 ? (
            <Card style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SectionHeading title="Huddle Prompts" />
              <View style={{ gap: 10 }}>
                {(profile.prompts as { question: string; answer: string }[]).map((prompt, idx) => (
                  <View
                    key={idx}
                    style={[styles.promptCard, { backgroundColor: colors.subtle, borderColor: colors.border }]}
                  >
                    <Text style={[styles.promptQuestion, { color: colors.secondary }]}>
                      {prompt.question}
                    </Text>
                    <Text style={[styles.promptAnswer, { color: colors.text }]}>
                      {prompt.answer}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}
        </View>
      )}

      {/* Interactive Followers / Following List Modal */}
      <Modal
        visible={connectionsModalVisible}
        animationType="slide"
        onRequestClose={() => setConnectionsModalVisible(false)}
      >
        <View style={[styles.connectionsModalScreen, { backgroundColor: colors.background }]}>
          {/* Modal Header */}
          <View style={[styles.connectionsModalHeader, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.connectionsModalTitle, { color: colors.text }]}>
              {connectionsModalTab === "followers" ? "Followers" : "Following"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setConnectionsModalVisible(false)}
              hitSlop={10}
              style={styles.connectionsCloseBtn}
            >
              <Icon name="close" color={colors.text} size={22} />
            </Pressable>
          </View>

          {/* Segmented Control / Tabs */}
          <View style={[styles.connectionsTabRow, { borderBottomColor: colors.border }]}>
            <Pressable
              style={[
                styles.connectionsTabBtn,
                connectionsModalTab === "followers" && { borderBottomColor: colors.accent, borderBottomWidth: 2 },
              ]}
              onPress={() => setConnectionsModalTab("followers")}
            >
              <Text
                style={[
                  styles.connectionsTabBtnText,
                  { color: connectionsModalTab === "followers" ? colors.accent : colors.secondary },
                ]}
              >
                {relationshipCounts?.followers ?? membersList.followers.length} Followers
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.connectionsTabBtn,
                connectionsModalTab === "following" && { borderBottomColor: colors.accent, borderBottomWidth: 2 },
              ]}
              onPress={() => setConnectionsModalTab("following")}
            >
              <Text
                style={[
                  styles.connectionsTabBtnText,
                  { color: connectionsModalTab === "following" ? colors.accent : colors.secondary },
                ]}
              >
                {relationshipCounts?.following ?? membersList.following.length} Following
              </Text>
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={[styles.connectionsSearchWrap, { backgroundColor: colors.subtle, borderColor: colors.border }]}>
            <Icon name="search" color={colors.secondary} size={18} />
            <TextInput
              style={[styles.connectionsSearchInput, { color: colors.text }]}
              placeholder={`Search ${connectionsModalTab}…`}
              placeholderTextColor={colors.secondary}
              value={memberSearchQuery}
              onChangeText={setMemberSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {memberSearchQuery ? (
              <Pressable onPress={() => setMemberSearchQuery("")}>
                <Icon name="close" color={colors.secondary} size={16} />
              </Pressable>
            ) : null}
          </View>

          {/* Members List */}
          {loadingMembers ? (
            <View style={styles.connectionsLoading}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={[styles.connectionsLoadingText, { color: colors.secondary }]}>
                Loading {connectionsModalTab}…
              </Text>
            </View>
          ) : (
            <FlatList
              data={(connectionsModalTab === "followers" ? membersList.followers : membersList.following).filter((m) => {
                if (!memberSearchQuery.trim()) return true;
                const query = memberSearchQuery.toLowerCase();
                return (
                  m.display_name?.toLowerCase().includes(query) ||
                  m.username?.toLowerCase().includes(query)
                );
              })}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.connectionsListContent}
              ListEmptyComponent={
                <View style={styles.connectionsEmptyWrap}>
                  <Icon name="people" color={colors.secondary} size={40} />
                  <Text style={[styles.connectionsEmptyTitle, { color: colors.text }]}>
                    No {connectionsModalTab} yet
                  </Text>
                  <Text style={[styles.connectionsEmptySubtitle, { color: colors.secondary }]}>
                    {connectionsModalTab === "followers"
                      ? "When other members follow you on Huddle, they'll appear here."
                      : "Explore and connect with community members to see them here."}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.connectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => {
                    setConnectionsModalVisible(false);
                    router.push(("/member/" + item.id) as never);
                  }}
                >
                  <Avatar
                    name={item.display_name}
                    tone={item.display_name.length % 5}
                    size={46}
                    imageSource={item.avatar_url ? { uri: item.avatar_url } : undefined}
                  />
                  <View style={styles.connectionCardInfo}>
                    <Text numberOfLines={1} style={[styles.connectionCardName, { color: colors.text }]}>
                      {item.display_name}
                    </Text>
                    <Text numberOfLines={1} style={[styles.connectionCardHandle, { color: colors.secondary }]}>
                      @{item.username}
                    </Text>
                    {item.bio ? (
                      <Text numberOfLines={1} style={[styles.connectionCardBio, { color: colors.secondary }]}>
                        {item.bio}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.viewProfileBtn, { borderColor: colors.border }]}>
                    <Text style={[styles.viewProfileBtnText, { color: colors.accent }]}>View</Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Edit Post Modal */}
      <Modal
        visible={Boolean(editingPost)}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingPost(null)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Post</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setEditingPost(null)}
                hitSlop={8}
              >
                <Icon name="close" color={colors.secondary} size={20} />
              </Pressable>
            </View>

            <TextInput
              multiline
              value={editText}
              onChangeText={setEditText}
              placeholder="What would you like to update?"
              placeholderTextColor={colors.secondary}
              style={[
                styles.modalTextInput,
                { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border },
              ]}
              maxLength={500}
            />

            <View style={styles.modalAudienceRow}>
              <Text style={[styles.modalAudienceLabel, { color: colors.secondary }]}>Audience:</Text>
              {(["Everyone", "Connections", "Only me"] as PostAudience[]).map((aud) => (
                <ChoiceChip
                  key={aud}
                  label={aud}
                  selected={editAudience === aud}
                  onPress={() => setEditAudience(aud)}
                />
              ))}
            </View>

            <View style={styles.modalActionButtons}>
              <AppButton
                label="Cancel"
                variant="outline"
                onPress={() => setEditingPost(null)}
              />
              <AppButton
                label={isSavingEdit ? "Saving…" : "Save Changes"}
                disabled={isSavingEdit || !editText.trim()}
                onPress={() => { void handleSaveEdit(); }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </AppScreen>
  );
}

function SampleProfileCard({ onShare }: { onShare: () => void }) {
  const colors = useAppColors();

  return (
    <Card style={styles.profileCard}>
      <View style={styles.profileTop}>
        <DemoAvatar id="profile-aarav" name={sampleProfile.display_name} tone={1} size={82} />
        <View style={styles.identity}>
          <Text style={[styles.name, { color: colors.text }]}>{sampleProfile.display_name}</Text>
          <Text style={[styles.handle, { color: colors.secondary }]}>@{sampleProfile.username}</Text>
          <Text style={[styles.privacyLabel, { color: colors.secondary }]}>Preview profile</Text>
        </View>
      </View>
      <Text style={[styles.bio, { color: colors.text }]}>{sampleProfile.bio}</Text>
      <View style={styles.profileActions}>
        <AppButton label="Edit profile" variant="outline" disabled onPress={() => {}} />
        <AppButton label="Share profile" variant="subtle" icon="share" onPress={onShare} />
      </View>
    </Card>
  );
}

function ProfileField({
  label,
  value,
  onChangeText,
  accessibilityLabel,
  error,
  helper,
  prefix,
  multiline = false,
  maxLength,
  autoCapitalize,
  autoCorrect,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  accessibilityLabel: string;
  error?: string;
  helper?: string;
  prefix?: string;
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
}) {
  const colors = useAppColors();

  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
        {helper ? <Text style={[styles.fieldHint, { color: colors.secondary }]}>{helper}</Text> : null}
      </View>
      <View style={[
        styles.inputShell,
        { backgroundColor: colors.subtle, borderColor: error ? colors.accent : colors.border },
        multiline ? styles.multilineShell : null,
      ]}>
        {prefix ? <Text style={[styles.inputPrefix, { color: colors.secondary }]}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={error}
          value={value}
          onChangeText={onChangeText}
          maxLength={maxLength}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          textAlignVertical={multiline ? "top" : "center"}
          placeholder={label}
          placeholderTextColor={colors.secondary}
          selectionColor={colors.accent}
          style={[styles.input, { color: colors.text }, multiline ? styles.multilineInput : null]}
        />
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: colors.accentStrong }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  accountCard: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  accountCopy: { flex: 1, minWidth: 180, gap: 4 },
  accountButtonRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  accountTitle: { fontSize: 14, fontWeight: "700" },
  accountEmail: { fontSize: 13 },
  signOutError: { width: "100%", fontSize: 13, lineHeight: 18 },
  stateBlock: { gap: 10 },
  profileCard: { gap: 16 },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarWrap: { position: "relative" },
  avatarOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOverlayText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  identity: { flex: 1, gap: 4 },
  name: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  handle: { fontSize: 13 },
  verifiedBadge: { fontSize: 12, fontWeight: "700" },
  privacyLabel: { fontSize: 12, fontWeight: "700" },
  bio: { fontSize: 14, lineHeight: 21 },
  detailRow: { flexDirection: "row", gap: 24, flexWrap: "wrap" },
  infoItem: { gap: 4 },
  infoLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  infoValue: { fontSize: 13, fontWeight: "600" },
  interests: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  promptsBlock: { gap: 8, marginTop: 4 },
  promptCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  promptQuestion: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  promptAnswer: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  profileActions: { flexDirection: "row", gap: 9, flexWrap: "wrap" },
  connectionStats: { gap: 12 },
  connectionStatRow: { flexDirection: "row", gap: 30 },
  connectionStat: { gap: 3, minWidth: 70 },
  connectionStatValue: { fontSize: 20, fontWeight: "800" },
  connectionStatLabel: { fontSize: 12 },
  editorCard: { gap: 16 },
  field: { gap: 7 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "700" },
  fieldHint: { fontSize: 12 },
  fieldGroup: { gap: 9 },
  inputShell: { minHeight: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 4 },
  multilineShell: { minHeight: 112, alignItems: "flex-start", paddingVertical: 11 },
  inputPrefix: { fontSize: 15, fontWeight: "600" },
  input: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 15 },
  multilineInput: { minHeight: 88, paddingVertical: 0 },
  editorActions: { flexDirection: "row", flexWrap: "wrap", gap: 9, justifyContent: "flex-end" },
  errorText: { fontSize: 13, lineHeight: 18 },
  successText: { fontSize: 13, fontWeight: "600" },
  tabs: { flexDirection: "row", gap: 8 },
  aboutCard: { gap: 13 },
  aboutText: { fontSize: 14, lineHeight: 22 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    padding: 20,
    gap: 16,
    borderRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 17, fontWeight: "800" },
  modalTextInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    textAlignVertical: "top",
  },
  modalAudienceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  modalAudienceLabel: { fontSize: 13, fontWeight: "600" },
  modalActionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  emptySavedCard: {
    padding: 26,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
  },
  emptySavedTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySavedSub: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  badgesContainerCard: {
    padding: 16,
    borderRadius: 16,
    gap: 14,
  },
  badgesSummary: {
    fontSize: 13,
    lineHeight: 18,
  },
  badgeList: {
    gap: 10,
  },
  badgeItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  badgeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeIconEmoji: {
    fontSize: 22,
  },
  badgeItemTextWrap: {
    flex: 1,
    gap: 2,
  },
  badgeNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeItemName: {
    fontSize: 14,
    fontWeight: "800",
  },
  badgeStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeStatusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  badgeItemDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  // Instagram Redesign Styles
  igTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 4,
  },
  igTopBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  igTopBarUsername: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  igProfileCard: {
    padding: 16,
    gap: 14,
  },
  igHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  igAvatarWrap: {
    position: "relative",
  },
  igAvatarBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000000",
  },
  igAvatarBadgeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    marginTop: -1,
  },
  igStatsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  igStatItem: {
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  igStatNumber: {
    fontSize: 18,
    fontWeight: "800",
  },
  igStatLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  igBioSection: {
    gap: 4,
  },
  igDisplayName: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  igHandle: {
    fontSize: 13,
    fontWeight: "500",
  },
  igBioText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  igDetailsPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  igPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  igPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  igActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  igActionButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  igActionButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  igShareButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  aboutDetailsList: {
    gap: 10,
  },
  aboutDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  aboutDetailLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  aboutDetailValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },

  // Connections Modal Styles
  connectionsModalScreen: {
    flex: 1,
  },
  connectionsModalHeader: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  connectionsModalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  connectionsCloseBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionsTabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  connectionsTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionsTabBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  connectionsSearchWrap: {
    margin: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  connectionsSearchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  connectionsLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 40,
  },
  connectionsLoadingText: {
    fontSize: 13,
  },
  connectionsListContent: {
    padding: 12,
    gap: 8,
  },
  connectionsEmptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 30,
    gap: 10,
  },
  connectionsEmptyTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  connectionsEmptySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  connectionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  connectionCardInfo: {
    flex: 1,
    gap: 2,
  },
  connectionCardName: {
    fontSize: 14,
    fontWeight: "700",
  },
  connectionCardHandle: {
    fontSize: 12,
  },
  connectionCardBio: {
    fontSize: 12,
    marginTop: 2,
  },
  viewProfileBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  viewProfileBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
