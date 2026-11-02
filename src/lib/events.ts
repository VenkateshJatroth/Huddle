import { supabase } from "./supabase";

export type CommunityEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string;
  city: string;
  event_date: string;
  creator_id: string;
  creator_name?: string;
  attendees_count: number;
  is_attending?: boolean;
  created_at: string;
};

export const CITIES_LIST = [
  "All Cities",
  "Dubai",
  "Hyderabad",
  "Bengaluru",
  "Mumbai",
  "London",
] as const;

export const SAMPLE_MEETUPS: CommunityEvent[] = [
  {
    id: "sample-event-dubai",
    title: "Dubai Marina Sunset Networking Walk",
    description: "Join fellow Huddle professionals for an evening stroll around Dubai Marina followed by Arabic coffee and conversations.",
    location: "Dubai Marina Promenade, Near Pier 7",
    city: "Dubai",
    event_date: new Date(Date.now() + 86400000 * 3).toISOString(),
    creator_id: "demo-creator-1",
    creator_name: "Venky",
    attendees_count: 14,
    is_attending: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "sample-event-hyderabad",
    title: "Banjara Hills Tech & Irani Chai Meetup",
    description: "Casual weekend meetup to discuss mobile architecture, AI agents, and indie hacking over fresh Osmania biscuits and tea.",
    location: "Niloufer Cafe, Banjara Hills Rd 10",
    city: "Hyderabad",
    event_date: new Date(Date.now() + 86400000 * 6).toISOString(),
    creator_id: "demo-creator-2",
    creator_name: "Rahul",
    attendees_count: 22,
    is_attending: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "sample-event-bengaluru",
    title: "Cubbon Park Weekend Runners & Walkers",
    description: "Energizing 5K morning jog or brisk stroll through green trails, open to all fitness levels.",
    location: "Cubbon Park Central Bandstand",
    city: "Bengaluru",
    event_date: new Date(Date.now() + 86400000 * 8).toISOString(),
    creator_id: "demo-creator-3",
    creator_name: "Pooja",
    attendees_count: 18,
    is_attending: false,
    created_at: new Date().toISOString(),
  },
];

const localEventsCache: CommunityEvent[] = [...SAMPLE_MEETUPS];

/**
 * Fetches upcoming community meetups and events.
 */
export async function fetchCommunityEvents(
  cityFilter?: string,
  currentUserId?: string
): Promise<CommunityEvent[]> {
  try {
    let query = (supabase as any)
      .from("community_events")
      .select("*, event_rsvps(user_id, status)")
      .order("event_date", { ascending: true });

    if (cityFilter && cityFilter !== "All Cities") {
      query = query.eq("city", cityFilter);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      if (cityFilter && cityFilter !== "All Cities") {
        return localEventsCache.filter((e) => e.city.toLowerCase() === cityFilter.toLowerCase());
      }
      return localEventsCache;
    }

    return data.map((item: any) => {
      const rsvps: any[] = item.event_rsvps || [];
      const isAttending = Boolean(currentUserId && rsvps.some((r) => r.user_id === currentUserId));
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        location: item.location,
        city: item.city || "Dubai",
        event_date: item.event_date,
        creator_id: item.creator_id,
        attendees_count: Math.max(1, rsvps.length),
        is_attending: isAttending,
        created_at: item.created_at,
      };
    });
  } catch {
    if (cityFilter && cityFilter !== "All Cities") {
      return localEventsCache.filter((e) => e.city.toLowerCase() === cityFilter.toLowerCase());
    }
    return localEventsCache;
  }
}

/**
 * Creates a new community gathering or meetup.
 */
export async function createCommunityEvent(payload: {
  title: string;
  description: string;
  location: string;
  city: string;
  eventDate: Date;
  creatorId: string;
  creatorName: string;
}): Promise<CommunityEvent> {
  const newEvent: CommunityEvent = {
    id: `event-${Date.now()}`,
    title: payload.title,
    description: payload.description,
    location: payload.location,
    city: payload.city,
    event_date: payload.eventDate.toISOString(),
    creator_id: payload.creatorId,
    creator_name: payload.creatorName,
    attendees_count: 1,
    is_attending: true,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await (supabase as any)
      .from("community_events")
      .insert({
        title: payload.title,
        description: payload.description,
        location: payload.location,
        city: payload.city,
        event_date: payload.eventDate.toISOString(),
        creator_id: payload.creatorId,
      })
      .select()
      .single();

    if (!error && data) {
      newEvent.id = data.id;
      // Auto RSVP creator
      await (supabase as any).from("event_rsvps").insert({
        event_id: data.id,
        user_id: payload.creatorId,
        status: "going",
      });
    }
  } catch {
    // Keep local
  }

  localEventsCache.unshift(newEvent);
  return newEvent;
}

/**
 * Toggles RSVP status for a meetup.
 */
export async function toggleEventRSVP(
  eventId: string,
  userId: string,
  currentlyAttending: boolean
): Promise<boolean> {
  if (!eventId || !userId) return currentlyAttending;
  const nextAttending = !currentlyAttending;

  // Local cache update
  const ev = localEventsCache.find((e) => e.id === eventId);
  if (ev) {
    ev.is_attending = nextAttending;
    ev.attendees_count += nextAttending ? 1 : -1;
  }

  try {
    if (nextAttending) {
      await (supabase as any).from("event_rsvps").upsert({
        event_id: eventId,
        user_id: userId,
        status: "going",
      });
    } else {
      await (supabase as any)
        .from("event_rsvps")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId);
    }
    return nextAttending;
  } catch {
    return nextAttending;
  }
}

