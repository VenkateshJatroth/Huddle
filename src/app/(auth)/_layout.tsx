import { Stack } from "expo-router";
import { GuestRouteGuard } from "../../components/auth/AuthRouteGuard";

export default function GuestLayout() {
  return (
    <GuestRouteGuard>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack>
    </GuestRouteGuard>
  );
}
