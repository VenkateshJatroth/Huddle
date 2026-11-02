export type BadgeType =
  | "streak_master"
  | "community_legend"
  | "early_adopter"
  | "coffee_enthusiast"
  | "super_active"
  | "verified_member";

export type UserBadgeInfo = {
  id: BadgeType;
  emoji: string;
  name: string;
  description: string;
  bgLight: string;
  textColor: string;
};

export const BADGE_DEFINITIONS: Record<BadgeType, UserBadgeInfo> = {
  streak_master: {
    id: "streak_master",
    emoji: "🔥",
    name: "Streak Master",
    description: "Maintained a 3+ day consecutive posting streak",
    bgLight: "#FFEDD5",
    textColor: "#C2410C",
  },
  community_legend: {
    id: "community_legend",
    emoji: "🏆",
    name: "Community Legend",
    description: "Posted 10+ times or reached a 7+ day streak",
    bgLight: "#FEF3C7",
    textColor: "#B45309",
  },
  super_active: {
    id: "super_active",
    emoji: "⚡",
    name: "Super Active",
    description: "Contributed 5+ engaging posts to the circles",
    bgLight: "#E0E7FF",
    textColor: "#4338CA",
  },
  early_adopter: {
    id: "early_adopter",
    emoji: "🚀",
    name: "Early Adopter",
    description: "One of the founding members of the GorMati community",
    bgLight: "#EDE9FE",
    textColor: "#6D28D9",
  },
  coffee_enthusiast: {
    id: "coffee_enthusiast",
    emoji: "☕",
    name: "Coffee Enthusiast",
    description: "Active conversationalist in community meetups",
    bgLight: "#F5F5F4",
    textColor: "#57534E",
  },
  verified_member: {
    id: "verified_member",
    emoji: "🛡️",
    name: "Verified Member",
    description: "Authenticated and verified GorMati identity",
    bgLight: "#DCFCE7",
    textColor: "#15803D",
  },
};

/**
 * Computes all badges applicable to a user profile.
 */
export function getUserBadges(profile?: {
  currentStreak?: number;
  longestStreak?: number;
  totalPosts?: number;
  isVerified?: boolean;
}): UserBadgeInfo[] {
  const badges: UserBadgeInfo[] = [];

  // Everyone in v1 gets Early Adopter
  badges.push(BADGE_DEFINITIONS.early_adopter);

  if (profile?.isVerified) {
    badges.push(BADGE_DEFINITIONS.verified_member);
  }

  const currentStreak = profile?.currentStreak ?? 0;
  const longestStreak = profile?.longestStreak ?? 0;
  const totalPosts = profile?.totalPosts ?? 0;

  if (currentStreak >= 3) {
    badges.push(BADGE_DEFINITIONS.streak_master);
  }

  if (totalPosts >= 10 || longestStreak >= 7) {
    badges.push(BADGE_DEFINITIONS.community_legend);
  } else if (totalPosts >= 5) {
    badges.push(BADGE_DEFINITIONS.super_active);
  }

  // Coffee Enthusiast for everyone who joined meetups or posted
  badges.push(BADGE_DEFINITIONS.coffee_enthusiast);

  return badges;
}
