import type { ImageSource } from "expo-image";

// Local generated artwork is used only for clearly identified demo content.
export const demoAvatarSheet: ImageSource | number = require("../../assets/images/demo-avatars.jpg");

export const demoAvatarTiles = {
  "profile-aarav": 1,
  "post-jaipur-books": 0,
  "post-bengaluru-cycling": 6,
  "post-kochi-food": 7,
  "account-sana": 2,
  "account-dev": 5,
  "account-priya": 8,
  "account-karthik": 6,
  "request-ananya": 4,
  "request-rahul": 3,
  "profile-post-walk": 1,
  "profile-post-music": 1,
} as const;

export const demoProfilePostImages: Record<string, ImageSource | number> = {
  "profile-post-walk": require("../../assets/images/demo-post-ahmedabad.jpg"),
  "profile-post-music": require("../../assets/images/demo-post-folk-music.jpg"),
};

export const demoProfilePostDescriptions: Record<string, string> = {
  "profile-post-walk": "A quiet old pol street in Ahmedabad, Gujarat.",
  "profile-post-music": "A community gathering for Gujarati folk music.",
};

export function getDemoAvatarTile(id: string): number | undefined {
  return demoAvatarTiles[id as keyof typeof demoAvatarTiles];
}
