import { useState } from "react";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton, AppScreen, Card, PageHeading } from "../ui";
import { Icon } from "../Icon";
import { supabase } from "../../lib/supabase";
import { useAppColors } from "../../theme/colors";

type AuthMode = "sign-in" | "sign-up";
type Feedback = { kind: "error" | "success"; message: string } | null;

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const colors = useAppColors();
  const isSignUp = mode === "sign-up";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit() {
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

  const title = isSignUp ? "Create your account" : "Welcome back";

  return (
    <AppScreen>
      <View style={styles.brandRow}>
        <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
          <Icon name="sparkles" color="#FFFFFF" size={18} />
        </View>
        <View style={styles.brandText}>
          <Text style={[styles.brandName, { color: colors.text }]}>Gormati</Text>
          <Text style={[styles.brandSubtitle, { color: colors.secondary }]}>Your people, your place</Text>
        </View>
      </View>

      <PageHeading
        title={title}
        subtitle={isSignUp ? "Join communities across India, in every language and interest." : "Sign in to continue to your community."}
        eyebrow={isSignUp ? "Join Gormati" : "Good to see you"}
      />

      <Card style={styles.formCard}>
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
            onSubmitEditing={() => { if (!isSignUp) void submit(); }}
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
              onSubmitEditing={() => { void submit(); }}
              editable={!isSubmitting}
              style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
            />
          </View>
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

        <AppButton
          label={isSubmitting ? (isSignUp ? "Creating account…" : "Signing in…") : (isSignUp ? "Create account" : "Sign in")}
          disabled={isSubmitting}
          onPress={() => { void submit(); }}
        />
      </Card>

      <View style={styles.switchRow}>
        <Text style={[styles.switchPrompt, { color: colors.secondary }]}>
          {isSignUp ? "Already have an account?" : "New to Gormati?"}
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
    return "Could not reach Gormati right now. Check your connection and try again.";
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
