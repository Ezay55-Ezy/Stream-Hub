import React, { useCallback } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useGetSeriesById } from "@workspace/api-client-react";

interface Props {
  seriesId: number | null;
  onClose: () => void;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function SeriesDetailModal({ seriesId, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: series, isLoading } = useGetSeriesById(seriesId ?? 0, {
    query: {
      enabled: seriesId !== null,
      queryKey: [seriesId],
    },
  });

  const handleDownload = useCallback(async () => {
    if (!series) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const canOpen = await Linking.canOpenURL(series.downloadUrl);
      if (canOpen) {
        await Linking.openURL(series.downloadUrl);
      } else {
        Alert.alert(
          "Download",
          "Opening download link in browser…",
          [{ text: "OK", onPress: () => Linking.openURL(series.downloadUrl) }]
        );
      }
    } catch {
      Alert.alert("Error", "Could not start download. Please try again.");
    }
  }, [series]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <Modal
      visible={seriesId !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Close button */}
        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={20} color="#fff" />
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} bounces={true}>
          {/* Poster hero */}
          <View style={styles.heroContainer}>
            {series?.posterUrl ? (
              <>
                <Image
                  source={{ uri: series.posterUrl }}
                  style={styles.posterImage}
                  contentFit="cover"
                />
                <LinearGradient
                  colors={["transparent", colors.background]}
                  locations={[0.5, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </>
            ) : (
              <View style={[styles.posterImage, { backgroundColor: colors.card }]} />
            )}
          </View>

          {/* Details */}
          <View style={styles.details}>
            {isLoading ? (
              <View style={[styles.titleSkeleton, { backgroundColor: colors.shimmer }]} />
            ) : (
              <Text style={[styles.title, { color: colors.foreground }]}>
                {series?.title ?? ""}
              </Text>
            )}

            {/* Meta row */}
            <View style={styles.metaRow}>
              {series?.categoryName ? (
                <View style={[styles.categoryBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.categoryText}>{series.categoryName}</Text>
                </View>
              ) : null}
              {series?.duration ? (
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  {formatDuration(series.duration)}
                </Text>
              ) : null}
              {series?.fileSize ? (
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  {formatFileSize(series.fileSize)}
                </Text>
              ) : null}
            </View>

            {series?.description ? (
              <Text style={[styles.description, { color: "rgba(255,255,255,0.75)" }]}>
                {series.description}
              </Text>
            ) : (
              !isLoading && (
                <Text style={[styles.description, { color: colors.mutedForeground }]}>
                  No description available.
                </Text>
              )
            )}

            {/* Download button */}
            <TouchableOpacity
              style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
              onPress={handleDownload}
              activeOpacity={0.85}
              disabled={!series}
            >
              <Feather name="download" size={18} color="#fff" />
              <Text style={styles.downloadBtnText}>Download Series</Text>
            </TouchableOpacity>

            <View style={{ height: bottomPad + 16 }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  heroContainer: {
    width: "100%",
    height: 380,
  },
  posterImage: {
    width: "100%",
    height: "100%",
  },
  details: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  titleSkeleton: {
    height: 30,
    borderRadius: 6,
    marginBottom: 12,
    width: "75%",
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 3,
  },
  categoryText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  meta: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    marginBottom: 24,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 6,
    marginTop: 4,
  },
  downloadBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
});
