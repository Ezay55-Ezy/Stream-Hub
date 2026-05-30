import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useSendAuthCode,
  useVerifyAuthCode,
  useSyncSavedMessages,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFeaturedSeriesQueryKey,
  getGetRecentSeriesQueryKey,
  getListSeriesQueryKey,
  getListCategoriesQueryKey,
  getGetAuthStatusQueryKey,
} from "@workspace/api-client-react";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type Step = "PHONE" | "CODE" | "SUCCESS";

interface Props {
  visible: boolean;
  onAuthenticated: () => void;
}

export function TelegramAuthModal({ visible, onAuthenticated }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Animation: card slides up from bottom
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setStep("PHONE");
      setPhone("");
      setCode("");
      setError(null);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 14,
        }),
      ]).start();
    }
  }, [visible]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onAuthenticated();
    });
  }, [onAuthenticated, fadeAnim, slideAnim]);

  const sendCode = useSendAuthCode();
  const verifyCode = useVerifyAuthCode();
  const syncMessages = useSyncSavedMessages();

  const handleSendCode = useCallback(async () => {
    if (!phone.trim()) return;
    setError(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendCode.mutate(
      { data: { phone: phone.trim() } },
      {
        onSuccess: (data) => {
          setPhoneCodeHash(data.phoneCodeHash);
          setStep("CODE");
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Failed to send code";
          setError(msg);
        },
      }
    );
  }, [phone, sendCode]);

  const handleVerifyCode = useCallback(async () => {
    if (!code.trim()) return;
    setError(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    verifyCode.mutate(
      { data: { phone: phone.trim(), phoneCodeHash, code: code.trim() } },
      {
        onSuccess: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setStep("SUCCESS");

          // Invalidate auth status and content
          queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetFeaturedSeriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentSeriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSeriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

          // Kick off background sync — don't await, let it run in background
          syncMessages.mutate(undefined, {
            onSuccess: (r) => {
              queryClient.invalidateQueries({ queryKey: getGetFeaturedSeriesQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetRecentSeriesQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListSeriesQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
            },
          });

          // Auto-dismiss after short success flash
          setTimeout(() => dismiss(), 1400);
        },
        onError: (err: any) => {
          const errMsg: string = err?.data?.error ?? err?.message ?? "Verification failed";
          if (errMsg === "2FA_REQUIRED") {
            setError("Two-step verification is enabled on your account. Please disable 2FA temporarily and try again, or contact support.");
          } else {
            setError(errMsg);
          }
        },
      }
    );
  }, [code, phone, phoneCodeHash, verifyCode, syncMessages, queryClient, dismiss]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} statusBarTranslucent>
      {/* Dim overlay */}
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 20,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {step === "SUCCESS" ? (
            // ── Success state ──────────────────────────────────────────────
            <View style={styles.successContainer}>
              <View style={[styles.successIcon, { backgroundColor: colors.primary }]}>
                <Feather name="check" size={32} color="#fff" />
              </View>
              <Text style={[styles.successTitle, { color: colors.foreground }]}>
                Connected!
              </Text>
              <Text style={[styles.successBody, { color: colors.mutedForeground }]}>
                Syncing your Saved Messages…
              </Text>
              {syncMessages.isPending && (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
              )}
            </View>
          ) : (
            <>
              {/* ── Header ──────────────────────────────────────────────── */}
              <View style={styles.header}>
                <View style={[styles.iconBadge, { backgroundColor: "rgba(229,9,20,0.12)" }]}>
                  <Feather name="send" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.foreground }]}>
                    {step === "PHONE" ? "Connect Telegram" : "Enter Code"}
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                    {step === "PHONE"
                      ? "Sign in to load your Saved Messages"
                      : `Code sent to ${phone}`}
                  </Text>
                </View>
              </View>

              {/* ── Step indicator ────────────────────────────────────── */}
              <View style={styles.stepRow}>
                {(["PHONE", "CODE"] as Step[]).map((s, i) => (
                  <View
                    key={s}
                    style={[
                      styles.stepDot,
                      {
                        backgroundColor:
                          step === s ? colors.primary : colors.border,
                        width: step === s ? 20 : 8,
                      },
                    ]}
                  />
                ))}
              </View>

              {/* ── Input ─────────────────────────────────────────────── */}
              {step === "PHONE" ? (
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Phone number
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.secondary,
                        color: colors.foreground,
                        borderColor: colors.border,
                      },
                    ]}
                    placeholder="+1 234 567 8900"
                    placeholderTextColor={colors.mutedForeground}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSendCode}
                  />
                </View>
              ) : (
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Verification code
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.codeInput,
                      {
                        backgroundColor: colors.secondary,
                        color: colors.foreground,
                        borderColor: colors.border,
                      },
                    ]}
                    placeholder="12345"
                    placeholderTextColor={colors.mutedForeground}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyCode}
                    maxLength={6}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setStep("PHONE");
                      setCode("");
                      setError(null);
                    }}
                  >
                    <Text style={[styles.backLink, { color: colors.primary }]}>
                      ← Change phone number
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Error ─────────────────────────────────────────────── */}
              {error ? (
                <View style={[styles.errorBox, { backgroundColor: "rgba(255,59,48,0.1)" }]}>
                  <Feather name="alert-circle" size={14} color={colors.destructive} />
                  <Text style={[styles.errorText, { color: colors.destructive }]}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* ── CTA button ────────────────────────────────────────── */}
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: colors.primary },
                  (sendCode.isPending || verifyCode.isPending) && styles.buttonDisabled,
                ]}
                onPress={step === "PHONE" ? handleSendCode : handleVerifyCode}
                activeOpacity={0.85}
                disabled={sendCode.isPending || verifyCode.isPending}
              >
                {sendCode.isPending || verifyCode.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>
                      {step === "PHONE" ? "Send Code" : "Verify & Connect"}
                    </Text>
                    <Feather name="arrow-right" size={18} color="#fff" />
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  stepRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 24,
    alignItems: "center",
  },
  stepDot: {
    height: 8,
    borderRadius: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  codeInput: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 8,
    textAlign: "center",
    marginBottom: 8,
  },
  backLink: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 32,
    paddingBottom: 16,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  successBody: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
