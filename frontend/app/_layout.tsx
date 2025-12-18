import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});

function TabIcon({
  name,
  color,
  size,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  size: number;
}) {
  return <Ionicons name={name} color={color} size={size} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Tabs
          screenOptions={{
            headerShown: true,
            tabBarActiveTintColor: "#7C5CFF",
            tabBarInactiveTintColor: "#9AA0A6",
            tabBarStyle: {
              backgroundColor: "#0B0D12",
              borderTopColor: "#171A22",
            },
            headerStyle: { backgroundColor: "#0B0D12" },
            headerTitleStyle: { color: "#E8EAED" },
            headerTintColor: "#E8EAED",
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Dashboard",
              tabBarIcon: ({ color, size }) => (
                <TabIcon name="pulse" color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="add"
            options={{
              title: "Add",
              tabBarIcon: ({ color, size }) => (
                <TabIcon name="add-circle" color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: "Settings",
              tabBarIcon: ({ color, size }) => (
                <TabIcon name="settings" color={color} size={size} />
              ),
            }}
          />
        </Tabs>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
