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
type AuthMethod = "email" | "phone";
type Feedback = { kind: "error" | "success"; message: string } | null;

const COUNTRY_CODES = [
  { code: "+91", label: "+91 IN", country: "India" },
  { code: "+971", label: "+971 AE", country: "UAE" },
  { code: "+974", label: "+974 QA", country: "Qatar" },
  { code: "+1", label: "+1 US", country: "USA" },
  { code: "+44", label: "+44 UK", country: "UK" },
  { code: "custom", label: "Custom +", country: "Other" },
];

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const colors = useAppColors();
  const isSignUp = mode === "sign-up";

  const [authMethod, setAuthMethod] = useState<AuthMethod>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Global Phone Authentication state
  const [selectedCountryCode, setSelectedCountryCode] = useState("+91");
  const [customCountryCode, setCustomCountryCode] = useState("+");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // 1. Email & Password Submit
  async function submitEmail() {
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

  // Helper: Build E.164 phone number
  function getFullPhoneNumber(): string {
    const rawNumber = phoneNumber.replace(/\D/g, "");
    if (selectedCountryCode === "custom") {
      const code = customCountryCode.startsWith("+") ? customCountryCode : `+${customCountryCode}`;
      return `${code}${rawNumber}`;
    }
    return `${selectedCountryCode}${rawNumber}`;
  }

  // 2. Phone OTP Send
  async function submitPhoneSend() {
    const raw = phoneNumber.trim().replace(/\D/g, "");
    if (!raw || raw.length < 7) {
      setFeedback({ kind: "error", message: "Enter a valid phone number (at least 7 digits)." });
      return;
    }

    const fullPhone = getFullPhoneNumber();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
      if (error) throw error;
      setIsOtpSent(true);
      setFeedback({ kind: "success", message: `Verification code sent via SMS to ${fullPhone}.` });
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
      setFeedback({ kind: "error", message: "Enter the 6-digit verification code sent to your phone." });
      return;
    }

    const fullPhone = getFullPhoneNumber();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: fullPhone,
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

  // 4. Continue with Google
  async function handleGoogleSignIn() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "gormati://auth/callback",
        },
      });
      if (error) throw error;
    } catch {
      Alert.alert(
        "Google Sign-In",
        "Google OAuth connects directly to your Supabase project. If not yet activated in your Supabase dashboard, use Email or Mobile Number to sign in.",
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
        subtitle={isSignUp ? "Join communities across India and globally, in every language and interest." : "Sign in to continue to your community."}
        eyebrow={isSignUp ? "Join GorMati" : "Good to see you"}
      />

      {/* Primary Social Option: Continue with Google */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        onPress={() => { void handleGoogleSignIn(); }}
        style={[styles.googleButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.googleIconText, { color: colors.text }]}>G</Text>
        <Text style={[styles.googleButtonText, { color: colors.text }]}>Continue with Google</Text>
      </Pressable>

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.secondary }]}>OR USE</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      {/* 2 Focused Sign-in Tabs: Email vs Mobile Number */}
      <View style={styles.methodTabs}>
        <ChoiceChip
          label="Email & Password"
          selected={authMethod === "email"}
          onPress={() => {
            setAuthMethod("email");
            setFeedback(null);
          }}
        />
        <ChoiceChip
          label="Mobile Number (SMS)"
          selected={authMethod === "phone"}
          onPress={() => {
            setAuthMethod("phone");
            setFeedback(null);
          }}
        />
      </View>

      <Card style={styles.formCard}>
        {/* --- 1. Email Form --- */}
        {authMethod === "email" ? (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Email Address</Text>
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
                onSubmitEditing={() => { if (!isSignUp) void submitEmail(); }}
                editable={!isSubmitting}
                style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
              />
            </View>

            {isSignUp ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>Confirm Password</Text>
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
                  onSubmitEditing={() => { void submitEmail(); }}
                  editable={!isSubmitting}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
                />
              </View>
            ) : null}

            <AppButton
              label={isSubmitting ? (isSignUp ? "Creating account…" : "Signing in…") : (isSignUp ? "Create account" : "Sign in")}
              disabled={isSubmitting}
              onPress={() => { void submitEmail(); }}
            />
          </>
        ) : null}

        {/* --- 2. Global Mobile Number Form with Country Code Selector --- */}
        {authMethod === "phone" ? (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Select Country Dial Code</Text>
              <View style={styles.countryCodesRow}>
                {COUNTRY_CODES.map((c) => (
                  <ChoiceChip
                    key={c.code}
                    label={c.label}
                    selected={selectedCountryCode === c.code}
                    onPress={() => setSelectedCountryCode(c.code)}
                  />
                ))}
              </View>
            </View>

            {selectedCountryCode === "custom" ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>Custom Dial Code</Text>
                <TextInput
                  accessibilityLabel="Custom Country Dial Code"
                  value={customCountryCode}
                  onChangeText={setCustomCountryCode}
                  placeholder="+XX"
                  placeholderTextColor={colors.secondary}
                  keyboardType="phone-pad"
                  style={[styles.input, { color: colors.text, backgroundColor: colors.subtle, borderColor: colors.border }]}
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Mobile Phone Number</Text>
              <View style={[styles.phoneInputRow, { backgroundColor: colors.subtle, borderColor: colors.border }]}>
                <Text style={[styles.phoneCodePrefix, { color: colors.secondary }]}>
                  {selectedCountryCode === "custom" ? customCountryCode : selectedCountryCode}
                </Text>
                <TextInput
                  accessibilityLabel="Phone number"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="98765 43210"
                  placeholderTextColor={colors.secondary}
                  keyboardType="phone-pad"
                  editable={!isSubmitting && !isOtpSent}
                  style={[styles.phoneInputField, { color: colors.text }]}
                />
              </View>
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
                disabled={isSubmitting || !phoneNumber.trim()}
                onPress={() => { void submitPhoneSend(); }}
              />
            )}
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
  googleButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 6,
  },
  googleIconText: { fontSize: 18, fontWeight: "800" },
  googleButtonText: { fontSize: 14, fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 8 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  methodTabs: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  formCard: { gap: 16 },
  field: { gap: 7 },
  countryCodesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  phoneInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
    gap: 8,
  },
  phoneCodePrefix: { fontSize: 14, fontWeight: "700" },
  phoneInputField: { flex: 1, fontSize: 14, paddingVertical: 10 },
  label: { fontSize: 14, fontWeight: "700" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 14 },
  feedback: { borderWidth: 1, borderRadius: 12, padding: 12 },
  feedbackText: { fontSize: 13, lineHeight: 19 },
  switchRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 5, paddingVertical: 4 },
  switchPrompt: { fontSize: 13 },
  switchAction: { fontSize: 13, fontWeight: "700" },
});
