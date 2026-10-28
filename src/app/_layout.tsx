import { NativeTabs } from "expo-router/native-tabs";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { AppThemeProvider, useAppColors } from "../theme/colors";

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <NativeTabLayout />
    </AppThemeProvider>
  );
}

function NativeTabLayout() {
  const colors = useAppColors();
  const labelStyle = { fontSize: 10, fontWeight: "600" as const };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={colors.background === "#0B1220" ? "light" : "dark"} />
      <NativeTabs
        backgroundColor={colors.surface}
        tintColor={colors.accentStrong}
        iconColor={{ default: colors.secondary, selected: colors.accentStrong }}
        labelStyle={{
          default: { ...labelStyle, color: colors.secondary },
          selected: { ...labelStyle, color: colors.accentStrong },
        }}
        indicatorColor={colors.accentSoft}
        rippleColor={colors.accentSoft}
        labelVisibilityMode="labeled"
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="discover">
          <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="create">
          <NativeTabs.Trigger.Label>Create</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "plus.circle", selected: "plus.circle.fill" }} md="add_circle" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="connections">
          <NativeTabs.Trigger.Label>Connections</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "person.2", selected: "person.2.fill" }} md="groups" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} md="account_circle" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}
