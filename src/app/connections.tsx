import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AccountCard } from "../components/AccountCard";
import { AppScreen, AppButton, Avatar, Card, LocalPreviewNotice, PageHeading, SectionHeading } from "../components/ui";
import { followRequests, suggestedAccounts } from "../data/mockData";
import { useAppColors } from "../theme/colors";

export default function ConnectionsScreen() {
  const colors = useAppColors();
  const [requestStates, setRequestStates] = useState<Record<string, "pending" | "accepted" | "dismissed">>({});
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const visibleRequests = followRequests.filter((request) => requestStates[request.id] !== "dismissed");

  return (
    <AppScreen>
      <PageHeading title="Connections" subtitle="Grow your circle, one conversation at a time." eyebrow="Your community" />
      <LocalPreviewNotice>Follow and request actions are local previews. They are not sent or saved.</LocalPreviewNotice>

      <View style={styles.section}>
        <SectionHeading title="Follow requests" action={<Text style={[styles.count, { color: colors.accentStrong }]}>{visibleRequests.filter((item) => requestStates[item.id] !== "accepted").length}</Text>} />
        {visibleRequests.length > 0 ? visibleRequests.map((request) => {
          const accepted = requestStates[request.id] === "accepted";
          return (
            <Card key={request.id} style={styles.requestCard}>
              <View style={styles.requestTop}>
                <Avatar name={request.name} tone={request.tone} size={48} />
                <View style={styles.requestDetails}>
                  <Text style={[styles.name, { color: colors.text }]}>{request.name}</Text>
                  <Text style={[styles.handle, { color: colors.secondary }]}>@{request.username}</Text>
                  <Text style={[styles.detail, { color: colors.secondary }]}>{request.detail}</Text>
                </View>
              </View>
              {accepted ? (
                <Text style={[styles.acceptedLabel, { color: colors.success }]}>Accepted for this preview</Text>
              ) : (
                <View style={styles.requestActions}>
                  <AppButton
                    label="Accept"
                    onPress={() => setRequestStates((current) => ({ ...current, [request.id]: "accepted" }))}
                  />
                  <AppButton
                    label="Dismiss"
                    variant="outline"
                    onPress={() => setRequestStates((current) => ({ ...current, [request.id]: "dismissed" }))}
                  />
                </View>
              )}
            </Card>
          );
        }) : (
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: colors.secondary }]}>You’re all caught up on sample requests.</Text>
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeading title="People to follow" />
        {suggestedAccounts.slice(0, 3).map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            following={Boolean(following[account.id])}
            onToggleFollow={() => setFollowing((current) => ({ ...current, [account.id]: !current[account.id] }))}
          />
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  count: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: "#FFF7ED", textAlign: "center", textAlignVertical: "center", fontSize: 12, fontWeight: "800", overflow: "hidden" },
  requestCard: { gap: 14 },
  requestTop: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  requestDetails: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: "700" },
  handle: { fontSize: 12 },
  detail: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  requestActions: { flexDirection: "row", gap: 9 },
  acceptedLabel: { fontSize: 13, fontWeight: "700" },
  emptyCard: { minHeight: 62, justifyContent: "center" },
  emptyText: { fontSize: 13, lineHeight: 19 },
});
