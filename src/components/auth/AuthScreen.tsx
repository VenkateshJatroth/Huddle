import { useState } from "react";
import { Link } from "expo-router";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton, AppScreen, Card, ChoiceChip, PageHeading } from "../ui";
import { Icon } from "../Icon";
import { supabase } from "../../lib/supabase";
import { useAppColors } from "../../theme/colors";

type AuthMode = "sign-in" | "sign-up";
type AuthMethod = "password" | "phone" | "magic-link";
type Feedback = { kind: "error" | "success"; message: string } | null;

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const colors = useAppColors();
  const isSignUp = mode === "sign-up";

  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Phone OTP state
  const [phone, setPhone] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // 1. Password submit
  async function submitPassword() {
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFeedback({ kind: "error", message: "Enter a valid email address to continue." });
      return;
    }
    if (!password) {
      setFeedback({ kind: "error", message: "Enter your password to continue." });
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setFeedback({ kind: "error", message: "Those passwords don’t match." });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });
        if (error) throw error;

        if (!data.session) {
          setFeedback({
            kind: "success",
            message: "Check your inbox for a confirmation link, then return here to sign in. You are not signed in until confirmation is complete.",
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
      }
    } catch (error) {
      setFeedback({ kind: "error", message: getAuthErrorMessage(error, isSignUp) });
    } finally {
      setIsSubmitting(false);
    }
  }

  // 2. Phone OTP Send
  async function submitPhoneSend() {
    const raw = phone.trim();
    if (!raw || raw.length < 10) {
      setFeedback({ kind: "error", message: "Enter a valid mobile phone number including country code (e.g. +91 9876543210)." });
      return;
    }

    const formatted = raw.startsWith("+") ? raw : `+91${raw.replace(/\D/g, "")}`;
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
      if (error) throw error;
      setIsOtpSent(true);
      setFeedback({ kind: "success", message: `Verification code sent via SMS to ${formatted}.` });
    } catch (error) {
      setFeedback({ kind: "error", message: getAuthErrorMessage(error, isSignUp) });
    } finally {
      setIsSubmitting(false);
    }
  }

  // 3. Phone OTP Verify
  async function submitPhoneVerify() {
    const code = otpToken.trim();
    if (!code || code.length < 6) {
      setFeedback({ kind: "error", message: "Enter the 6-digit code received on your phone." });
      return;
    }

    const raw = phone.trim();
    const formatted = raw.startsWith("+") ? raw : `+91${raw.replace(/\D/g, "")}`;

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: formatted,
        token: code,
        type: "sms",
      });
      if (error) throw error;
    } catch (error) {
      setFeedback({ kind: "error", message: getAuthErrorMessage(error, isSignUp) });
    } finally {
      setIsSubmitting(false);
    }
  }

  // 4. Magic Link Send
  async function submitMagicLink() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFeedback({ kind: "error", message: "Enter a valid email address to receive your magic link." });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: "gormati://auth/callback",
        },
      });
      if (error) throw error;
      setFeedback({
        kind: "success",
        message: "We sent a sign-in magic link to your email. Tap the link on your phone to open GorMati.",
      });
    } catch (error) {
      setFeedback({ kind: "error", message: getAuthErrorMessage(error, isSignUp) });
    } finally {
      setIsSubmitting(false);
    }
  }

  // 5. Social OAuth
  async function handleSocialSignIn(provider: "google" | "apple") {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: "gormati://auth/callback",
        },
      });
      if (error) throw error;
    } catch {
      const name = provider === "google" ? "Google" : "Apple";
      Alert.alert(
        `${name} Sign-In`,
        `Direct ${name} OAuth is connecting to your configured Supabase project. If not yet enabled in the Supabase console, use Email or SMS login.`,
      );
    }
  }

  const title = isSignUp ? "Create your account" : "Welcome back";

  return (
    <AppScreen>
      <View style={styles.brandRow}>
        <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
          <Icon name="sparkles" color="#FFFFFF" size={18} />
        </View>
        <View style={styles.brandText}>
          <Text style={[styles.brandName, { color: colors.text }]}>GorMati</Text>
          <Text style={[styles.brandSubtitle, { color: colors.secondary }]}>Your people, your place</Text>
        </View>
      </View>

      <PageHeading
        title={title}
        subtitle={isSignUp ? "Join communities across India, in every language and interest." : "Sign in to continue to your community."}
        eyebrow={isSignUp ? "Join GorMati" : "Good to see you"}
      />

      {/* Social OAuth Sign In Buttons */}
      <View style={styles.socialButtonsGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          onPress={() => { void handleSocialSignIn("google"); }}
          style={[styles.socialButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.socialIconText, { color: colors.text }]}>G</Text>
          <Text style={[styles.socialButtonText, { color: colors.text }]}>Continue with Google</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
          onPress={() => { void handleSocialSignIn("apple"); }}
          style={[styles.socialButton, { backgroundColor: colors.accent, borderColor: colors.accent }]}
        >
          <Text style={[styles.socialIconText, { color: "#FFFFFF" }]}></Text>
          <Text style={[styles.socialButtonText, { color: "#FFFFFF" }]}>Continue with Apple</Text>
        </Pressable>
      </View>

      {/* Or Divider */}
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.secondary }]}>OR CONTINUE WITH</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      {/* Method Switcher Tabs */}
      <View style={styles.methodTabs}>
        <ChoiceChip
          label="Password"
          selected={authMethod === "password"}
          onPress={() => {
            setAuthMethod("password");
            setFeedback(null);
          }}
        />
        <ChoiceChip
          label="Phone (SMS)"
          selected={authMethod === "phone"}
          onPress={() => {
            setAuthMethod("phone");
            setFeedback(null);
          }}
        />
        <ChoiceChip
          label="Magic Link"
          selected={authMethod === "magic-link"}
          onPress={() => {
            setAuthMethod("magic-link");
            setFeedback(null);
          }}
        />
      </View>

      <Card style={styles.formCard}>
        {/* --- 1. Password Form --- */}
        {authMethod === "password" ? (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Email</Text>
              <TextInput
                accessibilityLabel="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.secondary}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                textContentType="emailAddress"
                editable={!isSubmitting}
                style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Password</Text>
              <TextInput
                accessibilityLabel="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={colors.secondary}
                autoCapitalize="none"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                secureTextEntry
                returnKeyType={isSignUp ? "next" : "go"}
                textContentType={isSignUp ? "newPassword" : "password"}
                onSubmitEditing={() => { if (!isSignUp) void submitPassword(); }}
                editable={!isSubmitting}
                style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
              />
            </View>

            {isSignUp ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>Confirm password</Text>
                <TextInput
                  accessibilityLabel="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Enter your password again"
                  placeholderTextColor={colors.secondary}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  secureTextEntry
                  returnKeyType="go"
                  textContentType="newPassword"
                  onSubmitEditing={() => { void submitPassword(); }}
                  editable={!isSubmitting}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
                />
              </View>
            ) : null}

            <AppButton
              label={isSubmitting ? (isSignUp ? "Creating account…" : "Signing in…") : (isSignUp ? "Create account" : "Sign in")}
              disabled={isSubmitting}
              onPress={() => { void submitPassword(); }}
            />
          </>
        ) : null}

        {/* --- 2. Phone SMS Form --- */}
        {authMethod === "phone" ? (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Mobile Phone Number</Text>
              <TextInput
                accessibilityLabel="Mobile phone number"
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor={colors.secondary}
                keyboardType="phone-pad"
                editable={!isSubmitting && !isOtpSent}
                style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
              />
            </View>

            {isOtpSent ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>6-Digit Verification Code</Text>
                <TextInput
                  accessibilityLabel="Verification code"
                  value={otpToken}
                  onChangeText={setOtpToken}
                  placeholder="123456"
                  placeholderTextColor={colors.secondary}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!isSubmitting}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
                />
              </View>
            ) : null}

            {isOtpSent ? (
              <View style={{ gap: 10 }}>
                <AppButton
                  label={isSubmitting ? "Verifying…" : "Verify & Sign In"}
                  disabled={isSubmitting || !otpToken.trim()}
                  onPress={() => { void submitPhoneVerify(); }}
                />
                <AppButton
                  label="Change Phone Number"
                  variant="outline"
                  onPress={() => {
                    setIsOtpSent(false);
                    setOtpToken("");
                    setFeedback(null);
                  }}
                />
              </View>
            ) : (
              <AppButton
                label={isSubmitting ? "Sending SMS…" : "Send Verification Code"}
                disabled={isSubmitting || !phone.trim()}
                onPress={() => { void submitPhoneSend(); }}
              />
            )}
          </>
        ) : null}

        {/* --- 3. Magic Link Form --- */}
        {authMethod === "magic-link" ? (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Email</Text>
              <TextInput
                accessibilityLabel="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.secondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!isSubmitting}
                style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
              />
            </View>

            <AppButton
              label={isSubmitting ? "Sending Link…" : "Send Magic Link"}
              disabled={isSubmitting || !email.trim()}
              onPress={() => { void submitMagicLink(); }}
            />
          </>
        ) : null}

        {feedback ? (
          <View
            accessibilityRole={feedback.kind === "error" ? "alert" : undefined}
            accessibilityLiveRegion="polite"
            style={[
              styles.feedback,
              { backgroundColor: colors.accentSoft, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.feedbackText, { color: colors.text }]}>{feedback.message}</Text>
          </View>
        ) : null}
      </Card>

      <View style={styles.switchRow}>
        <Text style={[styles.switchPrompt, { color: colors.secondary }]}>
          {isSignUp ? "Already have an account?" : "New to GorMati?"}
        </Text>
        {isSignUp ? (
          <Link href="/sign-in" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <Text style={[styles.switchAction, { color: colors.accent }]}>Sign in</Text>
            </Pressable>
          </Link>
        ) : (
          <Link href="/sign-up" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <Text style={[styles.switchAction, { color: colors.accent }]}>Create an account</Text>
            </Pressable>
          </Link>
        )}
      </View>
    </AppScreen>
  );
}

function getAuthErrorMessage(error: unknown, isSignUp: boolean): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("email not confirmed")) {
    return "Please confirm your email using the link we sent before signing in.";
  }
  if (message.includes("invalid login credentials")) {
    return "Email or password is incorrect. Check your details and try again.";
  }
  if (message.includes("user already registered") || message.includes("user already exists")) {
    return "An account may already use this email. Try signing in instead.";
  }
  if (message.includes("password") && (message.includes("short") || message.includes("characters") || message.includes("length"))) {
    return "Your password does not meet the project’s password requirements.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Could not reach GorMati right now. Check your connection and try again.";
  }
  return isSignUp
    ? "We couldn’t create your account. Check your details and try again."
    : "We couldn’t sign you in. Check your details and try again.";
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  brandText: { flex: 1, gap: 2 },
  brandName: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  brandSubtitle: { fontSize: 12 },
  socialButtonsGroup: { gap: 10, marginTop: 4 },
  socialButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  socialIconText: { fontSize: 18, fontWeight: "800" },
  socialButtonText: { fontSize: 14, fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 6 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  methodTabs: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  formCard: { gap: 16 },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: "700" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 14 },
  feedback: { borderWidth: 1, borderRadius: 12, padding: 12 },
  feedbackText: { fontSize: 13, lineHeight: 19 },
  switchRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 5, paddingVertical: 4 },
  switchPrompt: { fontSize: 13 },
  switchAction: { fontSize: 13, fontWeight: "700" },
});
