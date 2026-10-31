import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAppColors } from "../theme/colors";
import { AppButton } from "./ui";
import { blockMember, reportMember, REPORT_REASONS, type ReportReason } from "../lib/safety";

type SafetyActionModalProps = {
  visible: boolean;
  onClose: () => void;
  memberName: string;
  memberId: string;
  currentUserId: string;
  onBlockedOrReported?: () => void;
};

export function SafetyActionModal({
  visible,
  onClose,
  memberName,
  memberId,
  currentUserId,
  onBlockedOrReported,
}: SafetyActionModalProps) {
  const colors = useAppColors();

  const [step, setStep] = useState<"menu" | "report" | "block_confirm">("menu");
  const [selectedReason, setSelectedReason] = useState<ReportReason>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleResetAndClose = () => {
    setStep("menu");
    setSelectedReason(REPORT_REASONS[0]);
    setDetails("");
    setIsSubmitting(false);
    onClose();
  };

  const handleBlock = async () => {
    setIsSubmitting(true);
    try {
      await blockMember(currentUserId, memberId);
      handleResetAndClose();
      Alert.alert(
        "Member Blocked",
        `${memberName} has been blocked. They can no longer see your profile, send you messages, or appear in your Discover feed.`,
      );
      onBlockedOrReported?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReport = async () => {
    setIsSubmitting(true);
    try {
      await reportMember({
        reporterId: currentUserId,
        reportedUserId: memberId,
        reason: selectedReason,
        details: details.trim() || undefined,
      });
      handleResetAndClose();
      Alert.alert(
        "Report Submitted",
        `Thank you for helping keep Gormati safe. Our safety team will review this report within 24 hours. ${memberName} has also been blocked.`,
      );
      onBlockedOrReported?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={handleResetAndClose}
    >
      <Pressable style={styles.backdrop} onPress={handleResetAndClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {step === "menu" ? (
            <View style={styles.menuContainer}>
              <Text style={[styles.title, { color: colors.text }]}>Member Options</Text>
              <Text style={[styles.subtitle, { color: colors.secondary }]}>
                Actions for {memberName}
              </Text>

              <Pressable
                style={[styles.menuOption, { borderBottomColor: colors.border }]}
                onPress={() => setStep("report")}
              >
                <Text style={[styles.menuOptionText, { color: colors.accentStrong }]}>
                  Report {memberName}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.menuOption, { borderBottomColor: colors.border }]}
                onPress={() => setStep("block_confirm")}
              >
                <Text style={[styles.menuOptionText, { color: colors.accentStrong }]}>
                  Block {memberName}
                </Text>
              </Pressable>

              <Pressable style={styles.cancelOption} onPress={handleResetAndClose}>
                <Text style={[styles.cancelOptionText, { color: colors.secondary }]}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}

          {step === "block_confirm" ? (
            <View style={styles.contentContainer}>
              <Text style={[styles.title, { color: colors.text }]}>Block {memberName}?</Text>
              <Text style={[styles.bodyText, { color: colors.secondary }]}>
                They will not be able to view your profile, send you messages, or match with you. They will not be notified that you blocked them.
              </Text>

              <View style={styles.actionButtons}>
                <AppButton
                  label="Cancel"
                  variant="outline"
                  disabled={isSubmitting}
                  onPress={() => setStep("menu")}
                />
                <AppButton
                  label={isSubmitting ? "Blocking…" : "Block Member"}
                  disabled={isSubmitting}
                  onPress={() => { void handleBlock(); }}
                />
              </View>
            </View>
          ) : null}

          {step === "report" ? (
            <View style={styles.contentContainer}>
              <Text style={[styles.title, { color: colors.text }]}>Report {memberName}</Text>
              <Text style={[styles.bodyText, { color: colors.secondary }]}>
                Select the reason why you are reporting this member. Reports are strictly confidential.
              </Text>

              <ScrollView style={styles.reasonsList} showsVerticalScrollIndicator={false}>
                {REPORT_REASONS.map((reason) => {
                  const isSelected = selectedReason === reason;
                  return (
                    <Pressable
                      key={reason}
                      style={[
                        styles.reasonChip,
                        {
                          backgroundColor: isSelected ? colors.accent : colors.subtle,
                          borderColor: isSelected ? colors.accent : colors.border,
                        },
                      ]}
                      onPress={() => setSelectedReason(reason)}
                    >
                      <Text
                        style={[
                          styles.reasonText,
                          { color: isSelected ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {reason}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <TextInput
                placeholder="Additional details (optional)…"
                placeholderTextColor={colors.secondary}
                value={details}
                onChangeText={setDetails}
                multiline
                numberOfLines={3}
                style={[
                  styles.detailsInput,
                  {
                    backgroundColor: colors.subtle,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
              />

              <View style={styles.actionButtons}>
                <AppButton
                  label="Back"
                  variant="outline"
                  disabled={isSubmitting}
                  onPress={() => setStep("menu")}
                />
                <AppButton
                  label={isSubmitting ? "Submitting…" : "Submit Report"}
                  disabled={isSubmitting}
                  onPress={() => { void handleReport(); }}
                />
              </View>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  menuContainer: {
    gap: 8,
  },
  contentContainer: {
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  menuOption: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuOptionText: {
    fontSize: 16,
    fontWeight: "600",
  },
  cancelOption: {
    paddingTop: 14,
    paddingBottom: 4,
    alignItems: "center",
  },
  cancelOptionText: {
    fontSize: 15,
    fontWeight: "600",
  },
  reasonsList: {
    maxHeight: 180,
    marginVertical: 4,
  },
  reasonChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  detailsInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: "top",
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
});
