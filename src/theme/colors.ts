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
  charcoalDark: "#121212",
  charcoalCard: "#18181A",
  charcoalLight: "#1C1C1E",
  pureWhite: "#FFFFFF",
  offWhite: "#E5E5EA",
  grayMuted: "#8E8E93",
  graySecondary: "#7C7C82",
  graySurface: "#F7F7F8",
  grayBorderLight: "#E5E5EA",
  grayBorderDark: "#262628",
  freshGreen: "#10B981",
} as const;

export const lightColors = {
  background: "#F7F7F8",
  surface: "#FFFFFF",
  text: "#000000",
  secondary: "#7C7C82",
  accent: "#000000",
  accentStrong: "#000000",
  accentSoft: "#E5E5EA",
  border: "#E5E5EA",
  subtle: "#F2F2F7",
  success: "#10B981",
  verified: "#000000",
  avatarBackgrounds: ["#E5E5EA", "#F2F2F7", "#E0E0E4", "#ECECEE", "#D8D8DC"],
} as const;

export const darkColors = {
  background: "#000000",
  surface: "#121212",
  text: "#FFFFFF",
  secondary: "#8E8E93",
  accent: "#FFFFFF",
  accentStrong: "#FFFFFF",
  accentSoft: "#1C1C1E",
  border: "#262628",
  subtle: "#18181A",
  success: "#10B981",
  verified: "#FFFFFF",
  avatarBackgrounds: ["#1C1C1E", "#262628", "#2C2C2E", "#1E1E20", "#333336"],
} as const;

export const navigationColors = {
  background: "#FFFFFF",
  border: "#E5E5EA",
  active: "#000000",
  activeBackground: "#E5E5EA",
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
