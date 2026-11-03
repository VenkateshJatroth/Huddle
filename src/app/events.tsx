import { useCallback, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/Icon";
import {
  AppButton,
  Card,
  ChoiceChip,
  IconButton,
  rowStyles,
} from "../components/ui";
import {
  CITIES_LIST,
  createCommunityEvent,
  fetchCommunityEvents,
  toggleEventRSVP,
  type CommunityEvent,
} from "../lib/events";
import { useAppColors } from "../theme/colors";

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const navigation = useNavigation();
  const { user } = useAuth();

  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("All Cities");
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Event Form State
  const [newTitle, setNewTitle] = useState("");
  const [newCity, setNewCity] = useState("Dubai");
  const [newLocation, setNewLocation] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDaysAhead, setNewDaysAhead] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Safe Back-Stack navigation
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, [navigation]);

  const loadEvents = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchCommunityEvents(selectedCity, user?.id);
      setEvents(data);
    } finally {
      setRefreshing(false);
    }
  }, [selectedCity, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
    }, [loadEvents]),
  );

  const handleRSVP = async (event: CommunityEvent) => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to RSVP for community meetups.");
      return;
    }

    const previousAttending = Boolean(event.is_attending);
    // Optimistic UI update
    setEvents((current) =>
      current.map((e) =>
        e.id === event.id
          ? {
              ...e,
              is_attending: !previousAttending,
              attendees_count: e.attendees_count + (!previousAttending ? 1 : -1),
            }
          : e
      )
    );

    const success = await toggleEventRSVP(event.id, user.id, previousAttending);
    if (!success) {
      // Revert if failed
      void loadEvents();
    }
  };

  const handleCreateEvent = async () => {
    if (!newTitle.trim() || !newLocation.trim()) {
      Alert.alert("Missing Details", "Please provide a meetup title and location.");
      return;
    }
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to host a community meetup.");
      return;
    }

    setIsSubmitting(true);
    try {
      const eventDate = new Date(Date.now() + newDaysAhead * 86400000);
      const creatorName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Organizer";

      await createCommunityEvent({
        title: newTitle.trim(),
        description: newDescription.trim() || "Join fellow community members for this local gathering.",
        location: newLocation.trim(),
        city: newCity,
        eventDate,
        creatorId: user.id,
        creatorName,
      });

      setIsModalOpen(false);
      setNewTitle("");
      setNewLocation("");
      setNewDescription("");
      void loadEvents();

      Alert.alert("Meetup Created! 🎉", "Your community gathering has been announced.");
    } catch {
      Alert.alert("Error", "Could not create event. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconButton name="arrowBack" label="Back" onPress={handleBack} />
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Meetups & Events</Text>
          <Text style={[styles.headerSubtitle, { color: colors.secondary }]}>
            Local community gatherings
          </Text>
        </View>
        <AppButton
          label="+ Host"
          variant="primary"
          onPress={() => setIsModalOpen(true)}
        />
      </View>

      {/* City Chips Filter */}
      <View style={styles.cityFilterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cityScroll}
        >
          {CITIES_LIST.map((c) => (
            <ChoiceChip
              key={c}
              label={c}
              selected={selectedCity === c}
              onPress={() => setSelectedCity(c)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void loadEvents(); }}
            tintColor={colors.accent}
          />
        }
      >
        {events.length === 0 ? (
          <Card style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="people" color={colors.accent} size={32} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No upcoming meetups yet</Text>
            <Text style={[styles.emptySub, { color: colors.secondary }]}>
              Be the first to host a gathering in {selectedCity}!
            </Text>
            <View style={{ marginTop: 8 }}>
              <AppButton
                label="Host a Meetup"
                variant="primary"
                onPress={() => setIsModalOpen(true)}
              />
            </View>
          </Card>
        ) : (
          events.map((item) => {
            const evDate = new Date(item.event_date);
            const monthStr = evDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
            const dayStr = evDate.getDate();
            const timeStr = evDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

            return (
              <Card
                key={item.id}
                style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.eventRow}>
                  {/* Date badge */}
                  <View style={[styles.dateBadge, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.dateMonth, { color: colors.accent }]}>{monthStr}</Text>
                    <Text style={[styles.dateDay, { color: colors.accent }]}>{dayStr}</Text>
                  </View>

                  {/* Event Details */}
                  <View style={styles.eventInfo}>
                    <View style={rowStyles.row}>
                      <View style={[styles.cityPill, { backgroundColor: colors.subtle }]}>
                        <Text style={[styles.cityPillText, { color: colors.secondary }]}>
                          📍 {item.city}
                        </Text>
                      </View>
                      <Text style={[styles.timeText, { color: colors.secondary }]}>
                        🕒 {timeStr}
                      </Text>
                    </View>

                    <Text style={[styles.eventTitle, { color: colors.text }]}>{item.title}</Text>

                    <Text style={[styles.eventLocation, { color: colors.secondary }]}>
                      {item.location}
                    </Text>

                    {item.description ? (
                      <Text style={[styles.eventDesc, { color: colors.secondary }]} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}

                    {/* Bottom action row */}
                    <View style={styles.eventFooter}>
                      <Text style={[styles.attendeesText, { color: colors.text }]}>
                        👥 {item.attendees_count} {item.attendees_count === 1 ? "member" : "members"} going
                      </Text>

                      <AppButton
                        label={item.is_attending ? "Going ✓" : "RSVP Going"}
                        variant={item.is_attending ? "outline" : "primary"}
                        onPress={() => { void handleRSVP(item); }}
                      />
                    </View>
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Host a Meetup Modal */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Host a Community Meetup</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setIsModalOpen(false)}
                hitSlop={8}
              >
                <Icon name="close" color={colors.secondary} size={20} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Event Title</Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="e.g. Marina Coffee Walk, Tech & Chai"
                placeholderTextColor={colors.secondary}
                style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>City</Text>
              <View style={styles.cityOptionsRow}>
                {["Dubai", "Hyderabad", "Bengaluru", "Mumbai", "London"].map((c) => (
                  <ChoiceChip
                    key={c}
                    label={c}
                    selected={newCity === c}
                    onPress={() => setNewCity(c)}
                  />
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Location & Venue</Text>
              <TextInput
                value={newLocation}
                onChangeText={setNewLocation}
                placeholder="e.g. Starbucks Pier 7, Niloufer Cafe"
                placeholderTextColor={colors.secondary}
                style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>When</Text>
              <View style={styles.cityOptionsRow}>
                {[
                  { label: "This Weekend", days: 3 },
                  { label: "In 1 Week", days: 7 },
                  { label: "In 2 Weeks", days: 14 },
                ].map((item) => (
                  <ChoiceChip
                    key={item.days}
                    label={item.label}
                    selected={newDaysAhead === item.days}
                    onPress={() => setNewDaysAhead(item.days)}
                  />
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
              <TextInput
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="Tell members what to expect, what to bring, etc."
                placeholderTextColor={colors.secondary}
                multiline
                numberOfLines={3}
                style={[
                  styles.input,
                  { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border, minHeight: 80, textAlignVertical: "top" },
                ]}
              />
            </ScrollView>

            <View style={styles.modalButtons}>
              <AppButton
                label="Cancel"
                variant="outline"
                onPress={() => setIsModalOpen(false)}
              />
              <AppButton
                label={isSubmitting ? "Creating…" : "Publish Meetup"}
                variant="primary"
                disabled={isSubmitting || !newTitle.trim() || !newLocation.trim()}
                onPress={() => { void handleCreateEvent(); }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  headerSubtitle: {
    fontSize: 12,
  },
  cityFilterWrap: {
    paddingVertical: 10,
  },
  cityScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  eventCard: {
    padding: 14,
    borderRadius: 16,
  },
  eventRow: {
    flexDirection: "row",
    gap: 14,
  },
  dateBadge: {
    width: 52,
    height: 58,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dateMonth: {
    fontSize: 11,
    fontWeight: "800",
  },
  dateDay: {
    fontSize: 20,
    fontWeight: "900",
  },
  eventInfo: {
    flex: 1,
    gap: 6,
  },
  cityPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cityPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  timeText: {
    fontSize: 11,
    marginLeft: 8,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  eventLocation: {
    fontSize: 12,
  },
  eventDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  eventFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
  },
  attendeesText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyCard: {
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    borderRadius: 18,
    padding: 18,
    maxHeight: "85%",
    gap: 14,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  modalScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  cityOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
});
