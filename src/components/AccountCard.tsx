import { StyleSheet, Text, View } from "react-native";
import type { SuggestedAccount } from "../data/mockData";
import { useAppColors } from "../theme/colors";
import { DemoAvatar } from "./DemoAvatar";
import { Card, ChoiceChip, rowStyles } from "./ui";

export function AccountCard({ account }: { account: SuggestedAccount }) {
  const colors = useAppColors();

  return (
    <Card style={styles.card}>
      <View style={[rowStyles.row, styles.accountRow]}>
        <DemoAvatar id={account.id} name={account.name} tone={account.tone} size={48} />
        <View style={styles.details}>
          <Text style={[styles.name, { color: colors.text }]}>{account.name}</Text>
          <Text style={[styles.handle, { color: colors.secondary }]}>@{account.username}</Text>
        </View>
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
