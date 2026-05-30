/**
 * Downloads Tab
 *
 * Shows all active, queued, paused, and recently completed downloads.
 * Downloads here keep running even when the detail modal is closed.
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Animated } from "react-native";
import { useRef, useEffect } from "react";
import { useColors } from "@/hooks/useColors";
import {
  useDownloadManager,
  type DownloadItem,
  type DownloadStatus,
} from "@/contexts/DownloadManagerContext";

// ── Status config ─────────────────────────────────────────────────────────────

function statusConfig(
  status: DownloadStatus | "idle",
  primary: string,
): { icon: React.ComponentProps<typeof Feather>["name"]; label: string; color: string } {
  switch (status) {
    case "queued":
      return { icon: "clock", label: "Queued", color: "#6b7280" };
    case "downloading":
      return { icon: "download", label: "Downloading", color: primary };
    case "paused":
      return { icon: "pause-circle", label: "Paused", color: "#f59e0b" };
    case "merging":
      return { icon: "layers", label: "Merging chunks…", color: "#8b5cf6" };
    case "saving":
      return { icon: "save", label: "Saving to library…", color: "#06b6d4" };
    case "complete":
      return { icon: "check-circle", label: "Saved to Library", color: "#22c55e" };
    case "error":
      return { icon: "alert-circle", label: "Error", color: "#ef4444" };
    default:
      return { icon: "download", label: "Download", color: primary };
  }
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  progress,
  color,
  trackColor,
}: {
  progress: number;
  color: string;
  trackColor: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress / 100,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  return (
    <View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          styles.progressFill,
          {
            backgroundColor: color,
            width: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
}

// ── Download Row ──────────────────────────────────────────────────────────────

function DownloadRow({ item }: { item: DownloadItem }) {
  const colors = useColors();
  const manager = useDownloadManager();
  const cfg = statusConfig(item.status, colors.primary);
  const isActive = item.status === "downloading";
  const isPaused = item.status === "paused";
  const isQueued = item.status === "queued";
  const isFinished = item.status === "complete" || item.status === "error";
  const isBusy = item.status === "merging" || item.status === "saving";

  const handleAction = useCallback(() => {
    if (isActive) {
      manager.pause(item.id);
    } else if (isPaused || isQueued) {
      manager.resume(item.id);
    }
  }, [isActive, isPaused, isQueued, item.id, manager]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      "Remove Download",
      isFinished
        ? "Remove this entry from the list?"
        : "Cancel and remove this download?",
      [
        { text: "Keep", style: "cancel" },
        {
          text: isFinished ? "Remove" : "Cancel Download",
          style: "destructive",
          onPress: () => manager.cancel(item.id),
        },
      ],
    );
  }, [isFinished, item.id, manager]);

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Icon */}
      <View
        style={[
          styles.iconBadge,
          { backgroundColor: cfg.color + "18" },
        ]}
      >
        <Feather name={cfg.icon} size={18} color={cfg.color} />
      </View>

      {/* Body */}
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowTitle, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>

        {/* Status + speed row */}
        <View style={styles.rowMeta}>
          <Text style={[styles.statusLabel, { color: cfg.color }]}>
            {cfg.label}
          </Text>
          {item.speed && isActive ? (
            <Text style={[styles.speedLabel, { color: colors.mutedForeground }]}>
              · {item.speed}
            </Text>
          ) : null}
          {item.fileSize ? (
            <Text style={[styles.sizeLabel, { color: colors.mutedForeground }]}>
              · {formatSize(item.fileSize)}
            </Text>
          ) : null}
        </View>

        {/* Progress bar */}
        {!isFinished && (
          <View style={styles.progressWrapper}>
            <ProgressBar
              progress={item.progress}
              color={cfg.color}
              trackColor={colors.border}
            />
            <Text style={[styles.pctLabel, { color: cfg.color }]}>
              {item.progress}%
            </Text>
          </View>
        )}

        {/* Error message */}
        {item.status === "error" && item.error ? (
          <Text style={[styles.errorText, { color: "#ef4444" }]} numberOfLines={2}>
            {item.error}
          </Text>
        ) : null}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {!isFinished && !isBusy && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleAction}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather
              name={isActive ? "pause" : "play"}
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleCancel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="x" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DownloadsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { downloads } = useDownloadManager();

  const active = downloads.filter(
    (d) =>
      d.status === "downloading" ||
      d.status === "queued" ||
      d.status === "paused" ||
      d.status === "merging" ||
      d.status === "saving",
  );
  const finished = downloads.filter(
    (d) => d.status === "complete" || d.status === "error",
  );

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Downloads
        </Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          {active.length} active · up to 2 simultaneous
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPad + 80, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Active / queued */}
        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              IN PROGRESS
            </Text>
            {active.map((item) => (
              <DownloadRow key={item.id} item={item} />
            ))}
          </View>
        )}

        {/* Completed */}
        {finished.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              COMPLETED
            </Text>
            {finished.map((item) => (
              <DownloadRow key={item.id} item={item} />
            ))}
          </View>
        )}

        {/* Empty state */}
        {downloads.length === 0 && (
          <View style={styles.empty}>
            <Feather name="download-cloud" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No downloads yet
            </Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Tap the download button on any video to start.{"\n"}
              Up to 2 files download at the same time.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 19,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 2,
  },
  statusLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  speedLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  sizeLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  progressWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  pctLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    minWidth: 32,
    textAlign: "right",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  actionBtn: {
    padding: 6,
  },
  empty: {
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 80,
    gap: 14,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
