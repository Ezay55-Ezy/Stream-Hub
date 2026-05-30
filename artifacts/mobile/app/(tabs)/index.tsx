import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetFeaturedSeries,
  useGetRecentSeries,
  useListSeries,
  useListCategories,
  useGetAuthStatus,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { HeroBanner } from "@/components/HeroBanner";
import { SeriesRow } from "@/components/SeriesRow";
import { SeriesDetailModal } from "@/components/SeriesDetailModal";
import { TelegramAuthModal } from "@/components/TelegramAuthModal";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Auth state — poll every 10 s so the modal auto-dismisses if session
  // is established from another device or the server restarts already authenticated.
  const {
    data: authData,
    isLoading: authLoading,
    refetch: refetchAuth,
  } = useGetAuthStatus({
    query: {
      queryKey: ["authStatus"],
      refetchInterval: 10_000,
    },
  });

  const needsLogin = !authLoading && authData?.authenticated === false;

  const {
    data: featured,
    isLoading: featuredLoading,
    refetch: refetchFeatured,
  } = useGetFeaturedSeries();

  const {
    data: recent,
    isLoading: recentLoading,
    refetch: refetchRecent,
  } = useGetRecentSeries();

  const {
    data: categories,
    isLoading: categoriesLoading,
    refetch: refetchCategories,
  } = useListCategories();

  const {
    data: allSeries,
    isLoading: allLoading,
    refetch: refetchAll,
  } = useListSeries();

  const handlePressSeries = useCallback((id: number) => setSelectedId(id), []);
  const handleCloseModal = useCallback(() => setSelectedId(null), []);

  const handleAuthenticated = useCallback(() => {
    refetchAuth();
    refetchFeatured();
    refetchRecent();
    refetchCategories();
    refetchAll();
  }, [refetchAuth, refetchFeatured, refetchRecent, refetchCategories, refetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchAuth(),
      refetchFeatured(),
      refetchRecent(),
      refetchCategories(),
      refetchAll(),
    ]);
    setRefreshing(false);
  }, [refetchAuth, refetchFeatured, refetchRecent, refetchCategories, refetchAll]);

  const categoryRows = (categories ?? [])
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      data: (allSeries ?? []).filter((s) => s.categoryId === cat.id),
    }))
    .filter((row) => row.data.length > 0);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <HeroBanner
          series={featured}
          isLoading={featuredLoading}
          onPress={handlePressSeries}
        />

        <View style={styles.logoRow}>
          <Text style={[styles.logo, { color: colors.primary }]}>STREAM</Text>
          <Text style={[styles.logoGram, { color: colors.foreground }]}>GRAM</Text>
        </View>

        <SeriesRow
          title="Recently Added"
          data={recent}
          isLoading={recentLoading}
          onPressSeries={handlePressSeries}
        />

        {categoriesLoading || allLoading
          ? [1, 2].map((i) => (
              <SeriesRow
                key={i}
                title=""
                data={undefined}
                isLoading={true}
                onPressSeries={handlePressSeries}
              />
            ))
          : categoryRows.map((row) => (
              <SeriesRow
                key={row.id}
                title={row.name}
                data={row.data}
                isLoading={false}
                onPressSeries={handlePressSeries}
              />
            ))}

        {!allLoading && !recentLoading && (allSeries?.length ?? 0) === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>
              📡
            </Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {needsLogin ? "Sign in to load content" : "No content yet"}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              {needsLogin
                ? "Your Saved Messages videos will appear here after you connect."
                : "Forward video files to your Telegram Saved Messages to see them here."}
            </Text>
          </View>
        )}
      </ScrollView>

      <SeriesDetailModal seriesId={selectedId} onClose={handleCloseModal} />

      {/* Telegram login pop-up — only shown when session is unauthorized */}
      <TelegramAuthModal
        visible={needsLogin}
        onAuthenticated={handleAuthenticated}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  logoRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 18,
    alignItems: "baseline",
    gap: 1,
  },
  logo: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  logoGram: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 40,
    paddingBottom: 20,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
