import { NativeTabs } from "expo-router/native-tabs";
import { View } from "react-native";
import { AuthenticatedRouteGuard } from "../../components/auth/AuthRouteGuard";
import { navigationColors } from "../../theme/colors";

export default function NativeTabLayout() {
  const labelStyle = { fontSize: 10, fontWeight: "600" as const };

  return (
    <AuthenticatedRouteGuard>
      <View style={{ flex: 1, backgroundColor: navigationColors.background }}>
        <NativeTabs
          backgroundColor={navigationColors.background}
          tintColor={navigationColors.active}
          iconColor={{ default: navigationColors.inactive, selected: navigationColors.active }}
          labelStyle={{
            default: { ...labelStyle, color: navigationColors.inactive },
            selected: { ...labelStyle, color: navigationColors.active },
          }}
          indicatorColor={navigationColors.activeBackground}
          rippleColor={navigationColors.activeBackground}
          labelVisibilityMode="labeled"
          tabBarRespectsIMEInsets
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
    </AuthenticatedRouteGuard>
  );
}
