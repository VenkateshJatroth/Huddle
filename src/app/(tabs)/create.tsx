import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../../components/Icon";
import { AppScreen, AppButton, Card, ChoiceChip, MutedText, PageHeading } from "../../components/ui";
import { useAppColors } from "../../theme/colors";

const audiences = ["Everyone", "Connections", "Only me"] as const;

export default function CreateScreen() {
  const colors = useAppColors();
  const [draft, setDraft] = useState("");
  const [audience, setAudience] = useState<(typeof audiences)[number]>("Everyone");
  const [photoPreview, setPhotoPreview] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  return (
    <AppScreen>
      <PageHeading title="Create a post" subtitle="Start a conversation with your community." eyebrow="Share a moment" />

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
        <View style={[styles.attachmentRow, { borderColor: colors.border }]}>
          <AppButton
            label={photoPreview ? "Photo preview added" : "Add photo"}
            variant="outline"
            icon={photoPreview ? "check" : "photo"}
            selected={photoPreview}
            onPress={() => setPhotoPreview((current) => !current)}
            accessibilityLabel="Toggle mock photo attachment preview"
          />
          <Text style={[styles.attachmentHint, { color: colors.secondary }]}>Preview action</Text>
        </View>
        {photoPreview ? (
          <View style={[styles.photoPlaceholder, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
            <Icon name="photo" color={colors.accent} size={24} />
            <Text style={[styles.photoText, { color: colors.secondary }]}>Mock attachment preview</Text>
          </View>
        ) : null}
      </Card>

      <View style={styles.audienceBlock}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Audience</Text>
        <Text style={[styles.helperText, { color: colors.secondary }]}>Choose who would see this post in a future version.</Text>
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

      <AppButton
        label={previewVisible ? "Hide preview" : "Preview post"}
        icon="sparkles"
        onPress={() => setPreviewVisible((current) => !current)}
      />
      <MutedText>Preview only · not published or saved.</MutedText>

      {previewVisible ? (
        <Card style={styles.previewCard}>
          <Text style={[styles.previewEyebrow, { color: colors.accent }]}>LOCAL PREVIEW · {audience.toUpperCase()}</Text>
          <Text style={[styles.previewText, { color: colors.text }]}>{draft.trim() || "Your message will appear here."}</Text>
          {photoPreview ? <Text style={[styles.previewMeta, { color: colors.secondary }]}>Photo attachment placeholder</Text> : null}
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
  textArea: { minHeight: 160, borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 14, lineHeight: 22 },
  attachmentRow: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10 },
  attachmentHint: { fontSize: 12 },
  photoPlaceholder: { minHeight: 110, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 8 },
  photoText: { fontSize: 12, fontWeight: "600" },
  audienceBlock: { gap: 9 },
  helperText: { fontSize: 13, lineHeight: 19, marginTop: -4 },
  audienceChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  previewCard: { gap: 10 },
  previewEyebrow: { fontSize: 11, letterSpacing: 0.5, fontWeight: "800" },
  previewText: { fontSize: 14, lineHeight: 22 },
  previewMeta: { fontSize: 12 },
});
