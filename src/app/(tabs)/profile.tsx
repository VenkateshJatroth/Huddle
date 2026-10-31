import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
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
import { deleteUserAccount } from "../../lib/safety";
import { useAuth } from "../../auth/AuthProvider";
import { DemoAvatar } from "../../components/DemoAvatar";
import { FeedPostCard } from "../../components/FeedPostCard";
import { Icon } from "../../components/Icon";
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
import { profilePosts } from "../../data/mockData";
import { demoProfilePostDescriptions, demoProfilePostImages } from "../../data/mockMedia";
import {
  fetchRelationshipCounts,
  relationshipErrorMessage,
  RelationshipSchemaUnavailableError,
} from "../../lib/relationships";
import type { RelationshipCounts } from "../../lib/relationships";
import { supabase } from "../../lib/supabase";
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
  const [activeSection, setActiveSection] = useState<"Posts" | "About">("Posts");
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [relationshipCounts, setRelationshipCounts] = useState<RelationshipCounts | null>(null);
  const [relationshipCountState, setRelationshipCountState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [relationshipCountError, setRelationshipCountError] = useState<string | null>(null);
  const [userCreatedPosts, setUserCreatedPosts] = useState<PublishedPost[]>([]);
  const [editingPost, setEditingPost] = useState<PublishedPost | null>(null);
  const [editText, setEditText] = useState("");
  const [editAudience, setEditAudience] = useState<PostAudience>("Everyone");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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
    setRelationshipCountState("loading");
    setRelationshipCountError(null);

    void fetchRelationshipCounts(user.id)
      .then((counts) => {
        if (!isCurrent) return;
        setRelationshipCounts(counts);
        setRelationshipCountState("ready");
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setRelationshipCounts(null);
        setRelationshipCountError(relationshipErrorMessage(error));
        setRelationshipCountState(error instanceof RelationshipSchemaUnavailableError ? "unavailable" : "error");
      });

    return () => { isCurrent = false; };
  }, [user.id]));

  function retryProfileLoad() {
    setProfile(null);
    setLoadState("loading");
    setReloadKey((value) => value + 1);
  }

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) setSignOutError("We couldn't sign out. Check your connection and try again.");
    } catch {
      setSignOutError("We couldn't sign out. Check your connection and try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  function promptDeleteAccount() {
    Alert.alert(
      "Delete Account Permanently?",
      "Are you sure you want to permanently delete your Gormati account? All your profile information, photos, matches, prompts, and message history will be immediately deleted. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete My Account",
          style: "destructive",
          onPress: () => {
            void executeDeleteAccount();
          },
        },
      ],
    );
  }

  async function executeDeleteAccount() {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      const res = await deleteUserAccount(user.id);
      if (res.success) {
        Alert.alert(
          "Account Deleted",
          "Your Gormati account and all associated data have been permanently removed.",
          [
            {
              text: "OK",
              onPress: () => {
                router.replace("/(auth)" as never);
              },
            },
          ],
        );
      } else {
        Alert.alert("Deletion Failed", res.error ?? "Failed to delete account. Please try again.");
      }
    } finally {
      setIsDeletingAccount(false);
    }
  }

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
      const name = profile?.display_name || user.email?.split("@")[0] || "Gormati Member";
      const handle = profile?.username ? `@${profile.username}` : "";
      const profileUrl = `https://gormati.app/m/${profile?.username || user.id}`;

      await Share.share({
        title: `${name}'s Profile on GorMati`,
        message: `Connect with ${name} ${handle ? `(${handle}) ` : ""}on GorMati — Your people, your place:\n${profileUrl}`,
        url: profileUrl,
      });
    } catch {
      // User cancelled or share error
    }
  }

  async function pickAndUploadAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Allow Gormati to access your photos to change your profile picture.");
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
      const publicUrl = await uploadProfileImage(user.id, result.assets[0].uri, "avatars");
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
      <PageHeading
        title="Profile"
        subtitle="Your story, shared with your community."
        eyebrow="A little about you"
        trailing={
          <IconButton
            name="settings"
            label="Settings"
            onPress={() => router.push("/settings" as never)}
          />
        }
      />

      <Card style={styles.accountCard}>
        <View style={styles.accountCopy}>
          <Text style={[styles.accountTitle, { color: colors.text }]}>Signed-in account</Text>
          <Text style={[styles.accountEmail, { color: colors.secondary }]}>{user.email ?? "Email unavailable"}</Text>
        </View>
        <View style={styles.accountButtonRow}>
          <AppButton
            label={isSigningOut ? "Signing out…" : "Sign out"}
            variant="outline"
            disabled={isSigningOut || isDeletingAccount}
            onPress={() => { void signOut(); }}
          />
          <AppButton
            label={isDeletingAccount ? "Deleting…" : "Delete account"}
            variant="subtle"
            disabled={isSigningOut || isDeletingAccount}
            onPress={promptDeleteAccount}
          />
        </View>
        {signOutError ? (
          <Text accessibilityLiveRegion="polite" style={[styles.signOutError, { color: colors.text }]}>
            {signOutError}
          </Text>
        ) : null}
      </Card>

      {loadState === "loading" ? (
        <Card><MutedText>Loading your profile…</MutedText></Card>
      ) : null}

      {loadState === "missing" ? (
        <View style={styles.stateBlock}>
          <LocalPreviewNotice>
            No profile record exists for this account yet. Complete your Gormati onboarding setup to connect with others.
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

      {profile ? (
        <>
          {/* Avatar with tap-to-change */}
          <Card style={styles.profileCard}>
            <View style={styles.profileTop}>
              <Pressable
                onPress={() => { void pickAndUploadAvatar(); }}
                accessibilityLabel="Change profile photo"
                style={styles.avatarWrap}
              >
                <Avatar
                  name={profile.display_name}
                  tone={1}
                  size={82}
                  imageSource={profile.avatar_url ? { uri: profile.avatar_url } : undefined}
                  imageKey={profile.avatar_url ?? profile.id}
                />
                <View style={[styles.avatarOverlay, { backgroundColor: colors.accent }]}>
                  <Text style={styles.avatarOverlayText}>
                    {isUploadingPhoto ? "…" : "✎"}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.identity}>
                <Text style={[styles.name, { color: colors.text }]}>{profile.display_name}</Text>
                <Text style={[styles.handle, { color: colors.secondary }]}>@{profile.username}</Text>
                {profile.is_verified ? (
                  <Text style={[styles.verifiedBadge, { color: colors.success }]}>✓ Verified</Text>
                ) : null}
                <Text style={[styles.privacyLabel, { color: colors.secondary }]}>
                  {profile.is_private ? "Private profile" : "Public to Gormati members"}
                </Text>
              </View>
            </View>

            {profile.bio ? (
              <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text>
            ) : null}

            {/* Live profile details */}
            {(profile.location || profile.dating_intention || profile.age) ? (
              <View style={styles.detailRow}>
                {profile.age ? (
                  <View style={styles.infoItem}>
                    <Text style={[styles.infoLabel, { color: colors.secondary }]}>Age</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{profile.age}</Text>
                  </View>
                ) : null}
                {profile.location ? (
                  <View style={styles.infoItem}>
                    <Text style={[styles.infoLabel, { color: colors.secondary }]}>Location</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{profile.location}</Text>
                  </View>
                ) : null}
                {profile.dating_intention ? (
                  <View style={styles.infoItem}>
                    <Text style={[styles.infoLabel, { color: colors.secondary }]}>Looking for</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{profile.dating_intention}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Interests chips */}
            {Array.isArray(profile.interests) && (profile.interests as string[]).length > 0 ? (
              <View style={styles.interests}>
                <Text style={[styles.infoLabel, { color: colors.secondary }]}>Interests</Text>
                <View style={styles.chips}>
                  {(profile.interests as string[]).map((interest) => (
                    <ChoiceChip key={interest} label={interest} />
                  ))}
                </View>
              </View>
            ) : null}

            {/* Prompts Cards */}
            {Array.isArray(profile.prompts) && (profile.prompts as { question: string; answer: string }[]).length > 0 ? (
              <View style={styles.promptsBlock}>
                <Text style={[styles.infoLabel, { color: colors.secondary }]}>Prompts</Text>
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
            ) : null}

            <View style={styles.profileActions}>
              <AppButton label="Edit profile" variant="outline" onPress={startEditing} />
              <AppButton
                label="Share profile"
                variant="subtle"
                icon="share"
                onPress={() => { void handleShareProfile(); }}
              />
            </View>
          </Card>

          {relationshipCountState === "ready" && relationshipCounts ? (
            <Card style={styles.connectionStats}>
              <SectionHeading title="Connections" />
              <View style={styles.connectionStatRow}>
                <View style={styles.connectionStat}>
                  <Text style={[styles.connectionStatValue, { color: colors.text }]}>{relationshipCounts.followers}</Text>
                  <Text style={[styles.connectionStatLabel, { color: colors.secondary }]}>Followers</Text>
                </View>
                <View style={styles.connectionStat}>
                  <Text style={[styles.connectionStatValue, { color: colors.text }]}>{relationshipCounts.following}</Text>
                  <Text style={[styles.connectionStatLabel, { color: colors.secondary }]}>Following</Text>
                </View>
              </View>
            </Card>
          ) : null}
          {relationshipCountState === "unavailable" ? (
            <LocalPreviewNotice>Follower and following counts will appear after the reviewed follow relationship migration is applied to a staging database.</LocalPreviewNotice>
          ) : null}
          {relationshipCountState === "error" ? (
            <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: colors.accentStrong }]}>{relationshipCountError}</Text>
          ) : null}
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
            label="Username"
            value={draft.username}
            onChangeText={(username) => setDraft((d) => ({ ...d, username }))}
            accessibilityLabel="Username"
            maxLength={40}
            autoCapitalize="none"
            autoCorrect={false}
            prefix="@"
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
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Gormati prompt</Text>
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
                : "Signed-in Gormati members can view this profile."}
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
      ) : (
        <Card style={styles.aboutCard}>
          <SectionHeading title="About · sample" />
          <Text style={[styles.aboutText, { color: colors.text }]}>
            {"I'm happiest when I'm discovering a neighborhood on foot, hearing a new artist, or learning the story behind a familiar place. I'm here to meet curious people close to home."}
          </Text>
          <LocalPreviewNotice>This about text is sample content and is not part of your saved profile.</LocalPreviewNotice>
        </Card>
      )}

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
});
