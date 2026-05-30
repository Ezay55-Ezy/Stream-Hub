import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import type { Series } from "@workspace/api-client-react";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const HERO_HEIGHT = SCREEN_HEIGHT * 0.52;

interface Props {
  series: Series | undefined;
  isLoading: boolean;
  onPress: (id: number) => void;
}

function HeroSkeleton() {
  const colors = useColors();
  return (
    <View
      style={[
        styles.skeleton,
        { height: HERO_HEIGHT, backgroundColor: colors.shimmer },
      ]}
    />
  );
}

export function HeroBanner({ series, isLoading, onPress }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading || !series) return <HeroSkeleton />;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onPress(series.id)}
      style={[styles.container, { height: HERO_HEIGHT }]}
    >
      <Image
        source={{ uri: series.posterUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <LinearGradient
        colors={["transparent", "rgba(20,20,20,0.7)", "#141414"]}
        locations={[0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, { paddingTop: topPad + 10 }]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {series.categoryName ?? "Featured"}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {series.title}
        </Text>
        {series.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {series.description}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: colors.primary }]}
            onPress={() => onPress(series.id)}
            activeOpacity={0.8}
          >
            <Feather name="play" size={16} color="#fff" />
            <Text style={styles.playBtnText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.infoBtn, { backgroundColor: "rgba(255,255,255,0.18)" }]}
            onPress={() => onPress(series.id)}
            activeOpacity={0.8}
          >
            <Feather name="info" size={16} color="#fff" />
            <Text style={styles.infoBtnText}>More Info</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    justifyContent: "flex-end",
  },
  skeleton: {
    width: "100%",
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  badge: {
    backgroundColor: "rgba(229,9,20,0.85)",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 3,
    marginBottom: 8,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  description: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
    lineHeight: 18,
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
  },
  playBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  infoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 4,
  },
  infoBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
