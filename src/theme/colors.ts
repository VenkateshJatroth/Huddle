import { createContext, createElement, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";

/**
 * Huddle Sleek Black & White Minimalist Design System
 * High contrast monochromatic aesthetic: Pure Black (#000000), Charcoal (#121212),
 * Pure White (#FFFFFF), and Off-White Gray (#E5E5EA).
 */
export const palette = {
  pureBlack: "#000000",
  obsidian: "#121212",
  charcoalCard: "#18181A",
  charcoalLight: "#1C1C1E",
  pureWhite: "#FFFFFF",
  instagramBorderLight: "rgba(0, 0, 0, 0.0975)",
  instagramBorderDark: "#262626",
  grayMuted: "#8E8E93",
  graySecondary: "#737373",
  grayDarkSecondary: "#A8A8A8",
  graySurface: "#FAFAFA",
  freshGreen: "#10B981",
} as const;

export const lightColors = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  text: "#000000",
  secondary: "#737373",
  accent: "#000000",
  accentStrong: "#000000",
  accentSoft: "#F0F0F2",
  border: "rgba(0, 0, 0, 0.0975)",
  subtle: "#FAFAFA",
  success: "#10B981",
  verified: "#0095F6",
  avatarBackgrounds: ["#EFEFEF", "#F5F5F5", "#EAEAEA", "#ECECEE", "#E2E2E6"],
} as const;

export const darkColors = {
  background: "#121212",
  surface: "#121212",
  text: "#F5F5F5",
  secondary: "#A8A8A8",
  accent: "#FFFFFF",
  accentStrong: "#FFFFFF",
  accentSoft: "#262626",
  border: "#262626",
  subtle: "#1C1C1E",
  success: "#10B981",
  verified: "#0095F6",
  avatarBackgrounds: ["#1C1C1E", "#262626", "#2C2C2E", "#1E1E20", "#333336"],
} as const;

export const navigationColors = {
  background: "#FFFFFF",
  border: "rgba(0, 0, 0, 0.0975)",
  active: "#000000",
  activeBackground: "#F0F0F2",
  inactive: "#8E8E93",
} as const;

export type AppColors = typeof lightColors | typeof darkColors;

const AppColorsContext = createContext<AppColors>(lightColors);
const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  );

  const colors = Platform.OS === "web" && !hasHydrated
    ? lightColors
    : systemScheme === "dark" ? darkColors : lightColors;

  return createElement(AppColorsContext.Provider, { value: colors }, children);
}

export function useAppColors(): AppColors {
  return useContext(AppColorsContext);
}
