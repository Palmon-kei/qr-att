
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { signIn, useAuth } from '@/lib/auth';

const C = {
  purple: '#6444E8',
  darkPurple: '#352080',
  lightPurple: '#EEE9FF',
  background: '#F8F7FC',
  white: '#FFFFFF',
  text: '#191535',
  muted: '#77748D',
  border: '#ECEAF5',
  red: '#C62828',
  lightRed: '#FFF0F0',
};

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;

    Keyboard.dismiss();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      // Preserve existing Supabase authentication.
      const { error: authError } = await signIn(
        email.trim(),
        password
      );

      if (authError) {
        setError(authError.message);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Wait for Supabase session restoration before showing login.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/(tabs)');
    }
  }, [authLoading, user, router]);

  if (authLoading || user) {
    return (
      <View
        style={[
          styles.screen,
          styles.loadingScreen,
          { paddingTop: insets.top },
        ]}
      >
        <View style={styles.loadingIcon}>
          <Ionicons
            name="qr-code-outline"
            size={38}
            color={C.purple}
          />
        </View>

        <ActivityIndicator
          size="large"
          color={C.purple}
        />

        <Text style={styles.loadingText}>
          Loading QRR KOP...
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={
          Platform.OS === 'ios' ? 'padding' : 'height'
        }
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* QRR KOP BRAND HEADER */}
            <View style={styles.hero}>
              <View style={styles.heroDecorationOne} />
              <View style={styles.heroDecorationTwo} />

              <View style={styles.logoContainer}>
                <Ionicons
                  name="qr-code-outline"
                  size={46}
                  color={C.purple}
                />
              </View>

              <Text style={styles.brandName}>
                QRR KOP
              </Text>

              <Text style={styles.brandSubtitle}>
                QR Attendance Management System
              </Text>

              <View style={styles.heroPill}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={16}
                  color={C.white}
                />

                <Text style={styles.heroPillText}>
                  Secure School Portal
                </Text>
              </View>
            </View>

            {/* WELCOME */}
            <View style={styles.welcome}>
              <Text style={styles.welcomeEyebrow}>
                ACCOUNT ACCESS
              </Text>

              <Text style={styles.welcomeTitle}>
                Welcome Back!
              </Text>

              <Text style={styles.welcomeSubtitle}>
                Sign in to access your QRR KOP account
                and continue managing attendance.
              </Text>
            </View>

            {/* LOGIN FORM */}
            <View style={styles.formCard}>
              <View style={styles.formHeading}>
                <View style={styles.formIcon}>
                  <Ionicons
                    name="log-in-outline"
                    size={22}
                    color={C.purple}
                  />
                </View>

                <View style={styles.formHeadingText}>
                  <Text style={styles.formTitle}>
                    Sign In
                  </Text>

                  <Text style={styles.formSubtitle}>
                    Enter your account credentials.
                  </Text>
                </View>
              </View>

              {/* EMAIL */}
              <Text style={styles.label}>
                Email Address
              </Text>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={21}
                  color={C.muted}
                />

                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your.email@school.edu"
                  placeholderTextColor={C.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!loading}
                  returnKeyType="next"
                  accessibilityLabel="Email address"
                />
              </View>

              {/* PASSWORD */}
              <Text style={styles.label}>
                Password
              </Text>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={21}
                  color={C.muted}
                />

                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={C.muted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    void handleLogin();
                  }}
                  accessibilityLabel="Password"
                />

                <Pressable
                  onPress={() =>
                    setShowPassword((current) => !current)
                  }
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                  hitSlop={10}
                >
                  <Ionicons
                    name={
                      showPassword
                        ? 'eye-off-outline'
                        : 'eye-outline'
                    }
                    size={22}
                    color={C.muted}
                  />
                </Pressable>
              </View>

              {/* LOGIN ERROR */}
              {error && (
                <View style={styles.errorBox}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={20}
                    color={C.red}
                  />

                  <Text style={styles.errorText}>
                    {error}
                  </Text>
                </View>
              )}

              {/* SIGN IN BUTTON */}
              <Pressable
                style={({ pressed }) => [
                  styles.signInButton,
                  pressed && styles.buttonPressed,
                  loading && styles.buttonDisabled,
                ]}
                onPress={() => {
                  void handleLogin();
                }}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
              >
                {loading ? (
                  <ActivityIndicator
                    color={C.white}
                    size="small"
                  />
                ) : (
                  <Ionicons
                    name="log-in-outline"
                    size={21}
                    color={C.white}
                  />
                )}

                <Text style={styles.signInText}>
                  {loading
                    ? 'Signing In...'
                    : 'Sign In'}
                </Text>

                {!loading && (
                  <Ionicons
                    name="arrow-forward"
                    size={19}
                    color={C.white}
                  />
                )}
              </Pressable>

              {/* REGISTER LINK */}
              <View style={styles.registerRow}>
                <Text style={styles.registerPrompt}>
                  Don't have an account?{' '}
                </Text>

                <Link
                  href="/register"
                  style={styles.registerLink}
                >
                  Sign Up
                </Link>
              </View>
            </View>

            {/* SECURITY INFORMATION */}
            <View style={styles.securityCard}>
              <View style={styles.securityIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={22}
                  color={C.purple}
                />
              </View>

              <View style={styles.securityContent}>
                <Text style={styles.securityTitle}>
                  Secure Account Access
                </Text>

                <Text style={styles.securityDescription}>
                  Sign in with your registered QRR KOP
                  account to access your assigned role.
                </Text>
              </View>
            </View>

            {/* FOOTER */}
            <View style={styles.footer}>
              <Ionicons
                name="qr-code-outline"
                size={17}
                color={C.purple}
              />

              <Text style={styles.footerText}>
                QRR KOP • QR Attendance System
              </Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: 38,
  },
  loadingScreen: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingIcon: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: C.muted,
    fontWeight: '600',
  },

  // Purple brand header
  hero: {
    backgroundColor: C.purple,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    paddingTop: 34,
    paddingBottom: 38,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroDecorationOne: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -95,
    right: -95,
  },
  heroDecorationTwo: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -70,
    left: -55,
  },
  logoContainer: {
    width: 86,
    height: 86,
    borderRadius: 27,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
  },
  brandName: {
    color: C.white,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandSubtitle: {
    color: '#EAE4FF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.17)',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 30,
    marginTop: 21,
  },
  heroPillText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '700',
  },

  // Welcome
  welcome: {
    paddingHorizontal: 24,
    marginTop: 27,
    marginBottom: 18,
  },
  welcomeEyebrow: {
    color: C.purple,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  welcomeTitle: {
    color: C.text,
    fontSize: 27,
    fontWeight: '900',
    marginBottom: 7,
  },
  welcomeSubtitle: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 21,
  },

  // Form
  formCard: {
    backgroundColor: C.white,
    marginHorizontal: 18,
    padding: 21,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: C.border,
  },
  formHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 23,
  },
  formIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formHeadingText: {
    flex: 1,
  },
  formTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  formSubtitle: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  label: {
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 9,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 54,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingVertical: 13,
    minWidth: 0,
  },
  errorBox: {
    backgroundColor: C.lightRed,
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 18,
  },
  errorText: {
    flex: 1,
    color: C.red,
    fontSize: 12,
    lineHeight: 19,
  },
  signInButton: {
    backgroundColor: C.purple,
    borderRadius: 15,
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 3,
  },
  signInText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  registerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 25,
  },
  registerPrompt: {
    color: C.muted,
    fontSize: 13,
  },
  registerLink: {
    color: C.purple,
    fontSize: 13,
    fontWeight: '800',
  },

  // Security information
  securityCard: {
    marginHorizontal: 18,
    marginTop: 19,
    padding: 16,
    backgroundColor: C.lightPurple,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  securityIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityContent: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.darkPurple,
    marginBottom: 4,
  },
  securityDescription: {
    fontSize: 11,
    color: C.muted,
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 27,
    paddingHorizontal: 15,
  },
  footerText: {
    color: C.muted,
    fontSize: 11,
  },
});
