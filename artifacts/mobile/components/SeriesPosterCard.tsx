import React, { useCallback } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  View,
  Text,
} from "react-native";
import { Image } from "expo-image";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.32;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

interface Props {
  id: number;
  title: string;
  posterUrl: string;
  onPress: (id: number) => void;
}

export function SeriesPosterCard({ id, title, posterUrl, onPress }: Props) {
  const colors = useColors();
  const handlePress = useCallback(() => onPress(id), [id, onPress]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handlePress}
      style={[styles.card, { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: colors.radius }]}
    >
      <Image
        source={{ uri: posterUrl }}
        style={[StyleSheet.absoluteFill, { borderRadius: colors.radius }]}
        contentFit="cover"
        transition={200}
      />
      <View style={[styles.overlay, { borderRadius: colors.radius }]}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    backgroundColor: "#1f1f1f",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 6,
  },
  title: {
    color: "#ffffff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
