import { createContext, createElement, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";

export const lightColors = {
  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#171717",
  secondary: "#737373",
  accent: "#F97316",
  accentStrong: "#C2410C",
  accentSoft: "#FFF7ED",
  border: "#E5E7EB",
  subtle: "#F1F5F9",
  success: "#15803D",
  avatarBackgrounds: ["#FFEDD5", "#DBEAFE", "#DCFCE7", "#FCE7F3", "#EDE9FE"],
} as const;

export const darkColors = {
  background: "#0B1220",
  surface: "#111827",
  text: "#F8FAFC",
  secondary: "#A1A1AA",
  accent: "#FB923C",
  accentStrong: "#FDBA74",
  accentSoft: "#2A1B12",
  border: "#273244",
  subtle: "#172033",
  success: "#4ADE80",
  avatarBackgrounds: ["#3B2A1B", "#1E3A5F", "#153B2B", "#47233C", "#34265D"],
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

  // React Native Web cannot know the browser's preferred scheme while rendering
  // HTML on the server. Use the same light snapshot on the server and the first
  // client render, then apply the browser preference after hydration.
  const colors = Platform.OS === "web" && !hasHydrated
    ? lightColors
    : systemScheme === "dark" ? darkColors : lightColors;

  return createElement(AppColorsContext.Provider, { value: colors }, children);
}

export function useAppColors(): AppColors {
  return useContext(AppColorsContext);
}
