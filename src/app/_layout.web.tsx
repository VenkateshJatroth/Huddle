import { Link, Slot, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon, type AppIconName } from "../components/Icon";
import { AppThemeProvider, useAppColors } from "../theme/colors";

const tabs: { label: string; href: "/" | "/discover" | "/create" | "/connections" | "/profile"; icon: AppIconName }[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Discover", href: "/discover", icon: "search" },
  { label: "Create", href: "/create", icon: "plus" },
  { label: "Connections", href: "/connections", icon: "people" },
  { label: "Profile", href: "/profile", icon: "person" },
];

export default function WebLayout() {
  return (
    <AppThemeProvider>
      <WebNavigationLayout />
    </AppThemeProvider>
  );
}

function WebNavigationLayout() {
  const colors = useAppColors();
  const pathname = usePathname();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.background === "#0B1220" ? "light" : "dark"} />
      <View style={styles.navigationArea}>
        <View
          accessibilityRole="navigation"
          accessibilityLabel="Main navigation"
          style={[styles.navigationShell, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.navigationItems}
            style={styles.navigationScroll}
          >
            {tabs.map((tab) => {
              const selected = pathname === tab.href;
              const foreground = selected ? colors.accentStrong : colors.secondary;

              return (
                <Link key={tab.href} href={tab.href} asChild>
                  <Pressable
                    accessibilityLabel={tab.label}
                    aria-current={selected ? "page" : undefined}
                    style={({ pressed }) => [
                      styles.navigationItem,
                      selected ? { backgroundColor: colors.accentSoft } : null,
                      { opacity: pressed ? 0.72 : 1 },
                    ]}
                  >
                    <Icon name={tab.icon} color={foreground} size={17} />
                    <Text numberOfLines={1} style={[styles.navigationLabel, { color: foreground }]}>{tab.label}</Text>
                  </Pressable>
                </Link>
              );
            })}
          </ScrollView>
        </View>
      </View>
      <View style={styles.routeContent}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: "100%" },
  navigationArea: { width: "100%", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  navigationShell: { alignSelf: "center", width: "100%", maxWidth: 560, minHeight: 54, borderWidth: 1, borderRadius: 28, padding: 4 },
  navigationScroll: { width: "100%" },
  navigationItems: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 2 },
  navigationItem: { minHeight: 44, minWidth: 78, paddingHorizontal: 11, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  navigationLabel: { fontSize: 12, fontWeight: "600", flexShrink: 0 },
  routeContent: { flex: 1, minHeight: 0 },
});
