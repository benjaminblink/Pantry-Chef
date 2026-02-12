import { Stack } from "expo-router";
import { AuthProvider } from "../contexts/AuthContext";
import { SubscriptionProvider } from "../contexts/SubscriptionContext";
import { CreditProvider } from "../contexts/CreditContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <CreditProvider>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          />
        </CreditProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
