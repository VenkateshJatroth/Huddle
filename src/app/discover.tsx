import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AccountCard } from "../components/AccountCard";
import { Icon } from "../components/Icon";
import { AppScreen, Card, ChoiceChip, PageHeading, SectionHeading } from "../components/ui";
import { interestOptions, languageOptions, regionOptions, suggestedAccounts } from "../data/mockData";
import { useAppColors } from "../theme/colors";

const regionTerms: Record<string, string[]> = {
  North: ["jaipur", "delhi", "lucknow", "chandigarh"],
  South: ["kochi", "bengaluru", "hyderabad", "chennai"],
  West: ["pune", "mumbai", "ahmedabad", "goa"],
  East: ["kolkata", "guwahati", "bhubaneswar"],
};

export default function DiscoverScreen() {
  const colors = useAppColors();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("Any language");
  const [region, setRegion] = useState("Any region");
  const [interests, setInterests] = useState<string[]>([]);
  const [following, setFollowing] = useState<Record<string, boolean>>({});

  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return suggestedAccounts.filter((account) => {
      const searchable = `${account.name} ${account.username} ${account.description} ${account.interests.join(" ")}`.toLowerCase();
      const languageMatch = language === "Any language" || account.language.toLowerCase().includes(language.toLowerCase());
      const regionMatch = region === "Any region" || regionTerms[region]?.some((term) => account.location.toLowerCase().includes(term));
      const interestMatch = interests.length === 0 || interests.some((interest) => account.interests.includes(interest));
      return searchable.includes(normalizedQuery) && languageMatch && regionMatch && interestMatch;
    });
  }, [interests, language, query, region]);

  const toggleInterest = (interest: string) => {
    setInterests((current) => current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest]);
  };

  return (
    <AppScreen>
      <PageHeading title="Discover" subtitle="Find people and ideas from every corner of India." eyebrow="Make a connection" />

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="search" color={colors.secondary} size={19} />
        <TextInput
          accessibilityLabel="Search people and interests"
          value={query}
          onChangeText={setQuery}
          placeholder="Search people, places, interests"
          placeholderTextColor={colors.secondary}
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.text }]}
        />
        {query.length > 0 ? <Text onPress={() => setQuery("")} style={[styles.clearText, { color: colors.accentStrong }]}>Clear</Text> : null}
      </View>

      <Card style={styles.filtersCard}>
        <View style={styles.filterBlock}>
          <Text style={[styles.filterTitle, { color: colors.text }]}>Language</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
            {languageOptions.map((option) => (
              <ChoiceChip key={option} label={option} selected={language === option} onPress={() => setLanguage(option)} />
            ))}
          </ScrollView>
        </View>
        <View style={styles.filterBlock}>
          <Text style={[styles.filterTitle, { color: colors.text }]}>Region</Text>
          <View style={styles.chips}>
            {regionOptions.map((option) => (
              <ChoiceChip key={option} label={option} selected={region === option} onPress={() => setRegion(option)} />
            ))}
          </View>
        </View>
      </Card>

      <View style={styles.interestsBlock}>
        <SectionHeading title="Explore interests" />
        <View style={styles.chips}>
          {interestOptions.map((interest) => (
            <ChoiceChip
              key={interest}
              label={interest}
              selected={interests.includes(interest)}
              onPress={() => toggleInterest(interest)}
            />
          ))}
        </View>
      </View>

      <View style={styles.suggestionsBlock}>
        <SectionHeading title="People you may like" action={<Text style={[styles.resultCount, { color: colors.secondary }]}>{matches.length} suggestions</Text>} />
        {matches.length > 0 ? matches.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            following={Boolean(following[account.id])}
            onToggleFollow={() => setFollowing((current) => ({ ...current, [account.id]: !current[account.id] }))}
          />
        )) : (
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No matches yet</Text>
            <Text style={[styles.emptyText, { color: colors.secondary }]}>Try changing a filter or searching for another interest.</Text>
          </Card>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  searchBox: { minHeight: 52, borderRadius: 17, borderWidth: 1, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, minHeight: 50, fontSize: 14, paddingVertical: 0 },
  clearText: { fontSize: 12, fontWeight: "700", padding: 6 },
  filtersCard: { gap: 17, padding: 15 },
  filterBlock: { gap: 10 },
  filterTitle: { fontSize: 13, fontWeight: "700" },
  horizontalChips: { gap: 7, paddingRight: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  interestsBlock: { gap: 11 },
  suggestionsBlock: { gap: 12 },
  resultCount: { fontSize: 12 },
  emptyCard: { alignItems: "flex-start", gap: 7 },
  emptyTitle: { fontSize: 15, fontWeight: "700" },
  emptyText: { fontSize: 13, lineHeight: 19 },
});
