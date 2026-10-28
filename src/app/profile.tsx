import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { FeedPostCard } from "../components/FeedPostCard";
import { AppScreen, AppButton, Avatar, Card, ChoiceChip, IconButton, LocalPreviewNotice, PageHeading, SectionHeading } from "../components/ui";
import { profilePosts } from "../data/mockData";
import { useAppColors } from "../theme/colors";

export default function ProfileScreen() {
  const colors = useAppColors();
  const [activeSection, setActiveSection] = useState<"Posts" | "About">("Posts");
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});

  return (
    <AppScreen>
      <PageHeading
        title="Profile"
        subtitle="Your story, shared with your community."
        eyebrow="A little about you"
        trailing={
          <IconButton
            name="more"
            label="Profile options"
            onPress={() => Alert.alert("Profile options", "Profile settings are a local preview.")}
          />
        }
      />

      <Card style={styles.profileCard}>
        <View style={styles.profileTop}>
          <Avatar name="Aarav Patel" tone={1} size={82} />
          <View style={styles.identity}>
            <Text style={[styles.name, { color: colors.text }]}>Aarav Patel</Text>
            <Text style={[styles.handle, { color: colors.secondary }]}>@aarav.patel</Text>
            <View style={styles.statsRow}>
              <Text style={[styles.stat, { color: colors.text }]}><Text style={styles.statStrong}>218</Text> connections</Text>
              <Text style={[styles.stat, { color: colors.text }]}><Text style={styles.statStrong}>36</Text> posts</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.bio, { color: colors.text }]}>Exploring Ahmedabad one walk, playlist, and cup of chai at a time. Always up for a good conversation.</Text>
        <View style={styles.locationRow}>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: colors.secondary }]}>Region</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>Ahmedabad, Gujarat</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: colors.secondary }]}>Languages</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>Gujarati, English</Text>
          </View>
        </View>
        <View style={styles.interests}>
          <Text style={[styles.infoLabel, { color: colors.secondary }]}>Interests</Text>
          <View style={styles.chips}>
            {["Local history", "Music", "Walking", "Books"].map((interest) => <ChoiceChip key={interest} label={interest} />)}
          </View>
        </View>
        <View style={styles.profileActions}>
          <AppButton label="Edit profile" variant="outline" onPress={() => Alert.alert("Edit profile", "Profile editing is a local preview.")} />
          <AppButton label="Share profile" variant="subtle" icon="share" onPress={() => Alert.alert("Share profile", "Profile sharing is not connected yet.")} />
        </View>
      </Card>

      <View style={styles.tabs}>
        <ChoiceChip label="Posts" selected={activeSection === "Posts"} onPress={() => setActiveSection("Posts")} />
        <ChoiceChip label="About" selected={activeSection === "About"} onPress={() => setActiveSection("About")} />
      </View>

      {activeSection === "Posts" ? (
        <>
          <SectionHeading title="Recent posts" />
          {profilePosts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              liked={Boolean(likedPosts[post.id])}
              onToggleLike={() => setLikedPosts((current) => ({ ...current, [post.id]: !current[post.id] }))}
            />
          ))}
        </>
      ) : (
        <Card style={styles.aboutCard}>
          <SectionHeading title="About Aarav" />
          <Text style={[styles.aboutText, { color: colors.text }]}>I’m happiest when I’m discovering a neighborhood on foot, hearing a new artist, or learning the story behind a familiar place. I’m here to meet curious people close to home.</Text>
          <LocalPreviewNotice>Profile details shown here are sample content for the Indiana preview.</LocalPreviewNotice>
        </Card>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  profileCard: { gap: 16 },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  identity: { flex: 1, gap: 4 },
  name: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  handle: { fontSize: 13 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 13, marginTop: 4 },
  stat: { fontSize: 12 },
  statStrong: { fontWeight: "800" },
  bio: { fontSize: 14, lineHeight: 21 },
  locationRow: { flexDirection: "row", gap: 24, flexWrap: "wrap" },
  infoItem: { gap: 4 },
  infoLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  infoValue: { fontSize: 13, fontWeight: "600" },
  interests: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  profileActions: { flexDirection: "row", gap: 9, flexWrap: "wrap" },
  tabs: { flexDirection: "row", gap: 8 },
  aboutCard: { gap: 13 },
  aboutText: { fontSize: 14, lineHeight: 22 },
});
