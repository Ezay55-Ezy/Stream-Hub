import React, { useCallback, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Animated,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useGetSeriesById } from "@workspace/api-client-react";
import { useVideoDownload } from "@/hooks/useVideoDownload";

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

  const download = useVideoDownload(series?.id ?? 0);

  // Reset download state whenever a different series is opened
  const prevSeriesId = useRef<number | null>(null);
  useEffect(() => {
    if (seriesId !== null && seriesId !== prevSeriesId.current) {
      if (prevSeriesId.current !== null) download.reset();
      prevSeriesId.current = seriesId;
    }
  }, [seriesId]);

  // Animated progress bar width (0 → 1)
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: download.progress / 100,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [download.progress]);

  const handleClose = useCallback(async () => {
    if (download.status === "downloading") {
      await download.pause();
    }
    onClose();
  }, [download, onClose]);

  const handleDownloadPress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    switch (download.status) {
      case "idle":
      case "error":
        await download.start();
        break;
      case "downloading":
        await download.pause();
        break;
      case "paused":
        await download.resume();
        break;
      default:
        break;
    }
  }, [download]);

  const handleCancelDownload = useCallback(async () => {
    Alert.alert("Cancel Download", "Are you sure you want to cancel this download?", [
      { text: "Keep Downloading", style: "cancel" },
      {
        text: "Cancel",
        style: "destructive",
        onPress: () => download.cancel(),
      },
    ]);
  }, [download]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Dynamic button config based on download state
  const btnConfig = (() => {
    switch (download.status) {
      case "downloading":
        return { icon: "pause" as const, label: "Pause", color: "#f59e0b" };
      case "paused":
        return { icon: "play" as const, label: "Resume", color: colors.primary };
      case "complete":
        return { icon: "check-circle" as const, label: "Saved to Library", color: "#22c55e" };
      case "error":
        return { icon: "refresh-cw" as const, label: "Retry", color: "#ef4444" };
      default:
        return { icon: "download" as const, label: "Download", color: colors.primary };
    }
  })();

  const isActive = download.status === "downloading" || download.status === "paused";

  return (
    <Modal
      visible={seriesId !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Close button */}
        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={20} color="#fff" />
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} bounces>
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

            {/* ── Download section ───────────────────────────────────── */}
            {download.status !== "idle" && download.status !== "complete" && (
              <View style={styles.progressSection}>
                {/* Progress bar track */}
                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: btnConfig.color,
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                </View>

                {/* Progress labels */}
                <View style={styles.progressRow}>
                  <Text style={[styles.progressPct, { color: btnConfig.color }]}>
                    {download.progress}%
                  </Text>
                  {isActive && (
                    <TouchableOpacity onPress={handleCancelDownload} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[styles.cancelLink, { color: colors.mutedForeground }]}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  )}
                  {download.status === "error" && download.error ? (
                    <Text style={[styles.errorText, { color: "#ef4444" }]} numberOfLines={1}>
                      {download.error}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}

            {/* Download / Pause / Resume / Complete button */}
            <TouchableOpacity
              style={[
                styles.downloadBtn,
                { backgroundColor: btnConfig.color },
                !series && styles.btnDisabled,
              ]}
              onPress={handleDownloadPress}
              activeOpacity={0.85}
              disabled={!series || download.status === "complete"}
            >
              <Feather name={btnConfig.icon} size={18} color="#fff" />
              <Text style={styles.downloadBtnText}>{btnConfig.label}</Text>
            </TouchableOpacity>

            <View style={{ height: bottomPad + 16 }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  heroContainer: { width: "100%", height: 380 },
  posterImage: { width: "100%", height: "100%" },
  details: { paddingHorizontal: 20, paddingTop: 4 },
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
  meta: { fontSize: 13, fontFamily: "Inter_500Medium" },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    marginBottom: 24,
  },
  progressSection: { marginBottom: 14 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressPct: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  cancelLink: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
    textAlign: "right",
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
  btnDisabled: { opacity: 0.5 },
  downloadBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
});
