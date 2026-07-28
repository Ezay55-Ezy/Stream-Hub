import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  StatusBar,
  LayoutChangeEvent,
} from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

function getDomain(): string {
  const d = process.env["EXPO_PUBLIC_DOMAIN"] || "";
  return d.startsWith("http") ? d : `https://${d}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  seriesId: number;
  title: string;
  visible: boolean;
  onClose: () => void;
}

export function VideoPlayer({ seriesId, title, visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const ref = useRef<VideoView>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekBarWidth = useRef(0);

  const domain = getDomain();
  const sourceUrl = domain
    ? `${domain}/api/download/${seriesId}`
    : `/api/download/${seriesId}`;

  const player = useVideoPlayer(sourceUrl, (player) => {
    player.loop = false;
    player.staysActiveInBackground = false;
  });

  const { isPlaying, status, duration, currentTime } = useEvent(player, "statusChange", {
    isPlaying: player.playing,
    status: player.status,
    duration: player.duration,
    currentTime: player.currentTime,
  });

  const isLoading = status === "loading";

  const progressWidth = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({
    width: progressWidth.value,
  }));

  useEffect(() => {
    if (duration && duration > 0 && currentTime != null) {
      progressWidth.value = withTiming((currentTime / duration) * 100 + "%", { duration: 200 });
    }
  }, [currentTime, duration, progressWidth]);

  useEffect(() => {
    if (visible) {
      player.play();
    } else {
      player.pause();
    }
  }, [visible, player]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player]);

  const toggleControls = useCallback(() => {
    setShowControls((prev) => !prev);
  }, []);

  const handleSeekBarLayout = useCallback((e: LayoutChangeEvent) => {
    seekBarWidth.current = e.nativeEvent.layout.width;
  }, []);

  const handleSeek = useCallback(
    (event: any) => {
      if (!duration || duration <= 0) return;
      const x = event.nativeEvent.locationX;
      const ratio = Math.max(0, Math.min(1, x / seekBarWidth.current));
      player.seekTo(ratio * duration);
    },
    [duration, player],
  );

  const handleClose = useCallback(() => {
    player.pause();
    onClose();
  }, [player, onClose]);

  useEffect(() => {
    if (showControls) {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      controlsTimer.current = setTimeout(() => {
        if (isPlaying) setShowControls(false);
      }, 3000);
    }
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [showControls, isPlaying]);

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <StatusBar hidden />
      <TouchableOpacity
        style={styles.container}
        activeOpacity={1}
        onPress={toggleControls}
      >
        <VideoView
          ref={ref}
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
        />

        {isLoading && (
          <View style={styles.centerOverlay}>
            <Text style={{ color: "#fff", fontSize: 14 }}>Loading…</Text>
          </View>
        )}

        {showControls && (
          <>
            <TouchableOpacity
              style={[styles.closeBtn, { top: insets.top + 12 }]}
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>

            <View style={[styles.titleBar, { top: insets.top + 56 }]}>
              <Text style={styles.titleText} numberOfLines={2}>
                {title}
              </Text>
            </View>

            <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.seekRow}>
                <Text style={styles.timeText}>
                  {formatTime(currentTime ?? 0)}
                </Text>
                <TouchableWithoutFeedback
                  onPress={handleSeek}
                  onLayout={handleSeekBarLayout}
                >
                  <View style={styles.seekBarBg}>
                    <Animated.View
                      style={[
                        styles.seekBarFill,
                        { backgroundColor: colors.primary },
                        progressStyle,
                      ]}
                    />
                  </View>
                </TouchableWithoutFeedback>
                <Text style={styles.timeText}>
                  {formatTime(duration ?? 0)}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.playBtn, { backgroundColor: colors.primary }]}
                onPress={togglePlayback}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <Feather
                  name={isPlaying ? "pause" : "play"}
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBar: {
    position: "absolute",
    left: 16,
    right: 72,
    zIndex: 10,
  },
  titleText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  seekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  timeText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    minWidth: 40,
    textAlign: "center",
  },
  seekBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  seekBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  playBtn: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
});
