import { Link, Slot, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthenticatedRouteGuard } from "../../components/auth/AuthRouteGuard";
import { Icon, type AppIconName } from "../../components/Icon";
import { navigationColors } from "../../theme/colors";

const tabs: { label: string; href: "/" | "/discover" | "/create" | "/connections" | "/profile"; icon: AppIconName }[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Discover", href: "/discover", icon: "search" },
  { label: "Create", href: "/create", icon: "plus" },
  { label: "Connections", href: "/connections", icon: "people" },
  { label: "Profile", href: "/profile", icon: "person" },
];

export default function WebLayout() {
  return (
    <AuthenticatedRouteGuard>
      <WebNavigationLayout />
    </AuthenticatedRouteGuard>
  );
}

function WebNavigationLayout() {
  const pathname = usePathname();

  return (
    <View style={styles.root}>
      <View style={styles.routeContent}>
        <Slot />
      </View>
      <SafeAreaView edges={["bottom"]} style={styles.navigationArea}>
        <View accessibilityRole="navigation" accessibilityLabel="Main navigation" style={styles.navigationShell}>
          <View style={styles.navigationItems}>
            {tabs.map((tab) => {
              const selected = pathname === tab.href;
              const foreground = selected ? "#FFFFFF" : navigationColors.inactive;

              return (
                <Link key={tab.href} href={tab.href} asChild>
                  <Pressable
                    accessibilityLabel={tab.label}
                    aria-current={selected ? "page" : undefined}
                    style={({ pressed }) => [
                      styles.navigationItem,
                      selected ? styles.navigationItemSelected : null,
                      { opacity: pressed ? 0.72 : 1 },
                    ]}
                  >
                    <Icon name={tab.icon} color={foreground} size={19} />
                    <Text numberOfLines={1} style={[styles.navigationLabel, { color: foreground }]}>{tab.label}</Text>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: "100%", backgroundColor: "#F7F7F8" },
  routeContent: { flex: 1, minHeight: 0 },
  navigationArea: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: navigationColors.border,
    backgroundColor: navigationColors.background,
    paddingHorizontal: 12,
    paddingTop: 7,
  },
  navigationShell: { width: "100%", maxWidth: 720, alignSelf: "center" },
  navigationItems: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  navigationItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingHorizontal: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  navigationItemSelected: { backgroundColor: navigationColors.active, borderColor: navigationColors.active },
  navigationLabel: { fontSize: 10, lineHeight: 13, fontWeight: "600", flexShrink: 1, letterSpacing: -0.15 },
});
