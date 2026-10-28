import { StyleSheet, Text, View } from "react-native";
import type { SuggestedAccount } from "../data/mockData";
import { useAppColors } from "../theme/colors";
import { Avatar, AppButton, Card, ChoiceChip, rowStyles } from "./ui";

export function AccountCard({
  account,
  following,
  onToggleFollow,
}: {
  account: SuggestedAccount;
  following: boolean;
  onToggleFollow: () => void;
}) {
  const colors = useAppColors();

  return (
    <Card style={styles.card}>
      <View style={[rowStyles.row, styles.accountRow]}>
        <Avatar name={account.name} tone={account.tone} size={48} />
        <View style={styles.details}>
          <Text style={[styles.name, { color: colors.text }]}>{account.name}</Text>
          <Text style={[styles.handle, { color: colors.secondary }]}>@{account.username}</Text>
        </View>
        <AppButton
          label={following ? "Following" : "Follow"}
          variant={following ? "outline" : "primary"}
          icon={following ? "check" : undefined}
          selected={following}
          onPress={onToggleFollow}
        />
      </View>
      <Text style={[styles.description, { color: colors.text }]}>{account.description}</Text>
      <View style={[rowStyles.row, styles.metaRow]}>
        <Text style={[styles.meta, { color: colors.secondary }]}>{account.location}</Text>
        <Text style={[styles.meta, { color: colors.secondary }]}>·</Text>
        <Text style={[styles.meta, { color: colors.secondary }]}>{account.language}</Text>
      </View>
      <View style={styles.chips}>
        {account.interests.map((interest) => <ChoiceChip key={interest} label={interest} />)}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  accountRow: { gap: 11 },
  details: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 15, fontWeight: "700" },
  handle: { fontSize: 12 },
  description: { fontSize: 14, lineHeight: 20 },
  metaRow: { gap: 6, flexWrap: "wrap" },
  meta: { fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
});
