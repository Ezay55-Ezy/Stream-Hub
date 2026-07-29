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
import { useMutation } from "@tanstack/react-query";
import {
  useSendAuthCode,
  useVerifyAuthCode,
  useSyncSavedMessages,
} from "../lib/api-client";
import { customFetch } from "../lib/api-client";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFeaturedSeriesQueryKey,
  getGetRecentSeriesQueryKey,
  getListSeriesQueryKey,
  getListCategoriesQueryKey,
  getGetAuthStatusQueryKey,
} from "../lib/api-client";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type Step = "PHONE" | "CODE" | "PASSWORD" | "SUCCESS";

interface Props {
  visible: boolean;
  onAuthenticated: () => void;
}

export function TelegramAuthModal({ visible, onAuthenticated }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { setAuth } = useAuth();

  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
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
      setPassword("");
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

  const verifyPassword = useMutation({
    mutationFn: async (password: string) => {
      return customFetch<{ session: string }>("/api/auth/verify-password", {
        method: "POST",
        body: JSON.stringify({ password }),
        headers: { "Content-Type": "application/json" },
      });
    },
  });

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

  const handleVerifyPassword = useCallback(async () => {
    if (!password.trim()) return;
    setError(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    verifyPassword.mutate(password.trim(), {
      onSuccess: async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setAuth(phone.trim());
        setStep("SUCCESS");

        queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFeaturedSeriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentSeriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListSeriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

        syncMessages.mutate(undefined, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetFeaturedSeriesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetRecentSeriesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListSeriesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          },
        });

        setTimeout(() => dismiss(), 1400);
      },
      onError: (err: any) => {
        const errMsg = err?.data?.error ?? err?.message ?? "Password verification failed";
        setError(errMsg);
      },
    });
  }, [password, verifyPassword, phone, setAuth, syncMessages, queryClient, dismiss]);

  const handleVerifyCode = useCallback(async () => {
    if (!code.trim()) return;
    setError(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    verifyCode.mutate(
      { data: { phone: phone.trim(), phoneCodeHash, code: code.trim() } },
      {
        onSuccess: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setAuth(phone.trim());
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
            setStep("PASSWORD");
            setError(null);
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
                {(["PHONE", "CODE", "PASSWORD"] as Step[]).map((s, i) => (
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
              ) : step === "CODE" ? (
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
              ) : step === "PASSWORD" ? (
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Two-factor authentication password
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
                    placeholder="Enter your 2FA password"
                    placeholderTextColor={colors.mutedForeground}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyPassword}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setStep("CODE");
                      setPassword("");
                      setError(null);
                    }}
                  >
                    <Text style={[styles.backLink, { color: colors.primary }]}>
                      ← Back to code verification
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

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
                onPress={step === "PHONE" ? handleSendCode : step === "CODE" ? handleVerifyCode : handleVerifyPassword}
                activeOpacity={0.85}
                disabled={sendCode.isPending || verifyCode.isPending || verifyPassword.isPending}
              >
                {sendCode.isPending || verifyCode.isPending || verifyPassword.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>
                      {step === "PHONE" ? "Send Code" : step === "CODE" ? "Verify & Connect" : "Submit Password"}
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
