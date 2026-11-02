import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "./Icon";
import { AppButton, Card } from "./ui";
import type { ProfileCompletionResult } from "../lib/profileCompletion";
import { useAppColors } from "../theme/colors";

export type ProfileCompletionBannerProps = {
  completion: ProfileCompletionResult;
  onCompletePress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ProfileCompletionBanner({
  completion,
  onCompletePress,
  style,
}: ProfileCompletionBannerProps) {
  const colors = useAppColors();

  if (completion.completionPercentage >= 100 || completion.isFullyComplete) {
    return null;
  }

  return (
    <Card
      style={[
        styles.bannerCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.accent,
        },
        style,
      ]}
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <View style={[styles.iconCircle, { backgroundColor: colors.subtle }]}>
            <Icon name="sparkles" color={colors.accent} size={18} />
          </View>
          <View style={styles.titleTextWrap}>
            <Text style={[styles.title, { color: colors.text }]}>Complete Your Profile</Text>
            <Text style={[styles.subtitle, { color: colors.secondary }]}>
              Help community members discover and connect with you.
            </Text>
          </View>
        </View>

        <View style={[styles.percentageBadge, { backgroundColor: colors.subtle }]}>
          <Text style={[styles.percentageText, { color: colors.accent }]}>
            {completion.completionPercentage}%
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.subtle }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.max(8, completion.completionPercentage)}%`,
              backgroundColor: colors.accent,
            },
          ]}
        />
      </View>

      {/* Missing Fields Chips */}
      {completion.missingFieldDetails && completion.missingFieldDetails.length > 0 ? (
        <View style={styles.missingFieldsRow}>
          <Text style={[styles.missingLabel, { color: colors.secondary }]}>Missing:</Text>
          <View style={styles.chipsWrap}>
            {completion.missingFieldDetails.map((field) => (
              <View
                key={field.id}
                style={[
                  styles.missingChip,
                  {
                    backgroundColor: colors.subtle,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.missingChipText, { color: colors.text }]}>
                  + {field.shortLabel}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : completion.missingFields.length > 0 ? (
        <View style={styles.missingFieldsRow}>
          <Text style={[styles.missingLabel, { color: colors.secondary }]}>Missing:</Text>
          <View style={styles.chipsWrap}>
            {completion.missingFields.map((label, idx) => (
              <View
                key={idx}
                style={[
                  styles.missingChip,
                  {
                    backgroundColor: colors.subtle,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.missingChipText, { color: colors.text }]}>
                  + {label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Primary Action Button */}
      <View style={styles.actionRow}>
        <AppButton
          label="Edit & Complete Profile"
          icon="chevronRight"
          onPress={onCompletePress}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bannerCard: {
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  titleTextWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  percentageBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  percentageText: {
    fontSize: 13,
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
  missingFieldsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  missingLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  missingChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  missingChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  actionRow: {
    marginTop: 2,
  },
});

