import React from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { SeriesPosterCard } from "./SeriesPosterCard";
import { useColors } from "@/hooks/useColors";
import type { Series } from "../lib/api-client";

interface Props {
  title: string;
  data: Series[] | undefined;
  isLoading: boolean;
  onPressSeries: (id: number) => void;
}

function SkeletonCard() {
  const colors = useColors();
  return (
    <View
      style={[
        styles.skeletonCard,
        { backgroundColor: colors.shimmer, borderRadius: colors.radius },
      ]}
    />
  );
}

export function SeriesRow({ title, data, isLoading, onPressSeries }: Props) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
      {isLoading ? (
        <FlatList
          horizontal
          data={[1, 2, 3, 4]}
          keyExtractor={(item) => String(item)}
          renderItem={() => <SkeletonCard />}
          contentContainerStyle={styles.listContent}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
        />
      ) : (
        <FlatList
          horizontal
          data={data ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <SeriesPosterCard
              id={item.id}
              title={item.title}
              posterUrl={item.posterUrl}
              onPress={onPressSeries}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!!(data && data.length > 0)}
          ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No content yet
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  skeletonCard: {
    width: 100,
    height: 150,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingVertical: 20,
  },
});
