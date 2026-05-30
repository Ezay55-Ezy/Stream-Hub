import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme, Text } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useDownloadManager } from "@/contexts/DownloadManagerContext";

function ActiveBadge() {
  const colors = useColors();
  const { downloads } = useDownloadManager();
  const activeCount = downloads.filter(
    (d) => d.status === "downloading" || d.status === "queued" || d.status === "merging" || d.status === "saving",
  ).length;

  if (activeCount === 0) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: -4,
        right: -8,
        backgroundColor: colors.primary,
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 3,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" }}>
        {activeCount}
      </Text>
    </View>
  );
}

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="downloads">
        <Icon sf={{ default: "arrow.down.circle", selected: "arrow.down.circle.fill" }} />
        <Label>Downloads</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.tabBar,
          borderTopWidth: 0,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={95}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.tabBar },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ color }) => (
            <View>
              {isIOS ? (
                <SymbolView
                  name="arrow.down.circle"
                  tintColor={color}
                  size={24}
                />
              ) : (
                <Feather name="download-cloud" size={22} color={color} />
              )}
              <ActiveBadge />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
