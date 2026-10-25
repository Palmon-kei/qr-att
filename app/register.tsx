
import { useState } from 'react';
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
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { signUp } from '@/lib/auth';

const C = {
  purple: '#6444E8',
  darkPurple: '#352080',
  lightPurple: '#EEE9FF',
  background: '#F8F7FC',
  white: '#FFFFFF',
  text: '#191535',
  muted: '#77748D',
  border: '#ECEAF5',
  green: '#16815A',
  lightGreen: '#E3F7EC',
  red: '#C62828',
  lightRed: '#FFF0F0',
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function FieldIcon({ name }: { name: IconName }) {
  return <Ionicons name={name} size={20} color={C.muted} />;
}

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (loading) return;

    Keyboard.dismiss();
    setError(null);

    // Preserve original registration validation.
    if (
      !email.trim() ||
      !fullName.trim() ||
      !password ||
      !confirmPassword
    ) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!studentId.trim()) {
      setError('Student ID is required for student accounts.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      // Keep the existing Supabase signup and metadata.
      const { data, error: authError } = await signUp(
        email.trim(),
        password,
        {
          full_name: fullName.trim(),
          student_id: studentId.trim(),
        }
      );

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.user) {
        setError(
          'Registration was not completed. Please try again.'
        );
        return;
      }

      // The existing database signup trigger creates
      // the student profile using the signup metadata.
      // Do not attempt an unauthenticated profile update.
      setSuccess(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* BRAND HEADER */}
            <View style={styles.hero}>
              <View style={styles.heroDecorationOne} />
              <View style={styles.heroDecorationTwo} />

              <View style={styles.logoContainer}>
                <Ionicons
                  name="qr-code-outline"
                  size={44}
                  color={C.purple}
                />
              </View>

              <Text style={styles.brandName}>QRR KOP</Text>
              <Text style={styles.brandSubtitle}>
                QR Attendance Management System
              </Text>

              <View style={styles.heroPill}>
                <Ionicons
                  name="person-add-outline"
                  size={16}
                  color={C.white}
                />
                <Text style={styles.heroPillText}>
                  Create Your Account
                </Text>
              </View>
            </View>

            {success ? (
              /* REGISTRATION SUCCESS */
              <View style={styles.successCard}>
                <View style={styles.successIcon}>
                  <Ionicons
                    name="mail-open-outline"
                    size={43}
                    color={C.green}
                  />
                </View>

                <Text style={styles.successEyebrow}>
                  REGISTRATION SUBMITTED
                </Text>

                <Text style={styles.successTitle}>
                  Check Your Email!
                </Text>

                <Text style={styles.successText}>
                  We sent a confirmation link to:
                </Text>

                <Text style={styles.successEmail} selectable>
                  {email.trim()}
                </Text>

                <Text style={styles.successDescription}>
                  Open your email and click the confirmation
                  link to verify your account. After
                  verification, return to QRR KOP and sign in.
                </Text>

                <View style={styles.successHint}>
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={C.purple}
                  />
                  <Text style={styles.successHintText}>
                    If you cannot find the email, check your
                    spam or junk folder.
                  </Text>
                </View>

                <Link href="/login" style={styles.successLink}>
                  Back to Sign In
                </Link>
              </View>
            ) : (
              <>
                {/* WELCOME */}
                <View style={styles.welcome}>
                  <Text style={styles.welcomeEyebrow}>
                    JOIN QRR KOP
                  </Text>

                  <Text style={styles.welcomeTitle}>
                    Create Account
                  </Text>

                  <Text style={styles.welcomeSubtitle}>
                    Register as a student to access the QR
                    attendance system. Teacher accounts are
                    assigned by an Administrator.
                  </Text>
                </View>

                {/* REGISTRATION FORM */}
                <View style={styles.formCard}>
                  <View style={styles.formHeading}>
                    <View style={styles.formHeadingIcon}>
                      <Ionicons
                        name="person-add-outline"
                        size={23}
                        color={C.purple}
                      />
                    </View>
                    <View style={styles.formHeadingText}>
                      <Text style={styles.formTitle}>
                        Student Registration
                      </Text>
                      <Text style={styles.formSubtitle}>
                        Enter your details below.
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.label}>Full Name</Text>
                  <View style={styles.inputContainer}>
                    <FieldIcon name="person-outline" />
                    <TextInput
                      style={styles.input}
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="Enter your full name"
                      placeholderTextColor={C.muted}
                      autoCapitalize="words"
                      editable={!loading}
                      accessibilityLabel="Full name"
                    />
                  </View>

                  {/* Student-only registration */}
                  <Text style={styles.label}>Account Type</Text>
                  <View style={styles.roleCard}>
                    <View style={styles.roleIcon}>
                      <Ionicons
                        name="school-outline"
                        size={24}
                        color={C.purple}
                      />
                    </View>
                    <View style={styles.roleContent}>
                      <Text style={styles.roleTitle}>Student</Text>
                      <Text style={styles.roleSubtitle}>
                        Student attendance account
                      </Text>
                    </View>
                    <Ionicons
                      name="checkmark-circle"
                      size={23}
                      color={C.purple}
                    />
                  </View>

                  <View style={styles.roleNotice}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={17}
                      color={C.purple}
                    />
                    <Text style={styles.roleNoticeText}>
                      Teacher and Administrator roles are
                      managed by school administrators.
                    </Text>
                  </View>

                  <Text style={styles.label}>Student ID</Text>
                  <View style={styles.inputContainer}>
                    <FieldIcon name="card-outline" />
                    <TextInput
                      style={styles.input}
                      value={studentId}
                      onChangeText={setStudentId}
                      placeholder="Enter your Student ID"
                      placeholderTextColor={C.muted}
                      autoCapitalize="none"
                      editable={!loading}
                      accessibilityLabel="Student ID"
                    />
                  </View>

                  <Text style={styles.label}>Email Address</Text>
                  <View style={styles.inputContainer}>
                    <FieldIcon name="mail-outline" />
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
                      editable={!loading}
                      accessibilityLabel="Email address"
                    />
                  </View>

                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputContainer}>
                    <FieldIcon name="lock-closed-outline" />
                    <TextInput
                      style={styles.input}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="At least 6 characters"
                      placeholderTextColor={C.muted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading}
                      accessibilityLabel="Password"
                    />
                    <Pressable
                      onPress={() =>
                        setShowPassword((current) => !current)
                      }
                      disabled={loading}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showPassword
                          ? 'Hide password'
                          : 'Show password'
                      }
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

                  <Text style={styles.label}>
                    Confirm Password
                  </Text>
                  <View style={styles.inputContainer}>
                    <FieldIcon name="shield-checkmark-outline" />
                    <TextInput
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Re-enter your password"
                      placeholderTextColor={C.muted}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading}
                      accessibilityLabel="Confirm password"
                    />
                    <Pressable
                      onPress={() =>
                        setShowConfirmPassword(
                          (current) => !current
                        )
                      }
                      disabled={loading}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showConfirmPassword
                          ? 'Hide confirm password'
                          : 'Show confirm password'
                      }
                    >
                      <Ionicons
                        name={
                          showConfirmPassword
                            ? 'eye-off-outline'
                            : 'eye-outline'
                        }
                        size={22}
                        color={C.muted}
                      />
                    </Pressable>
                  </View>

                  <View style={styles.passwordHint}>
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color={C.purple}
                    />
                    <Text style={styles.passwordHintText}>
                      Password must contain at least 6 characters.
                    </Text>
                  </View>

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

                  <Pressable
                    style={({ pressed }) => [
                      styles.signUpButton,
                      pressed && styles.buttonPressed,
                      loading && styles.buttonDisabled,
                    ]}
                    onPress={() => {
                      void handleRegister();
                    }}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="Create account"
                  >
                    {loading ? (
                      <ActivityIndicator
                        size="small"
                        color={C.white}
                      />
                    ) : (
                      <Ionicons
                        name="person-add-outline"
                        size={21}
                        color={C.white}
                      />
                    )}
                    <Text style={styles.signUpText}>
                      {loading
                        ? 'Creating Account...'
                        : 'Create Account'}
                    </Text>
                    {!loading && (
                      <Ionicons
                        name="arrow-forward"
                        size={19}
                        color={C.white}
                      />
                    )}
                  </Pressable>

                  <View style={styles.loginRow}>
                    <Text style={styles.loginPrompt}>
                      Already have an account?{' '}
                    </Text>
                    <Link href="/login" style={styles.loginLink}>
                      Sign In
                    </Link>
                  </View>
                </View>

                <View style={styles.securityCard}>
                  <View style={styles.securityIcon}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={21}
                      color={C.purple}
                    />
                  </View>
                  <View style={styles.securityContent}>
                    <Text style={styles.securityTitle}>
                      Secure Registration
                    </Text>
                    <Text style={styles.securityDescription}>
                      Your account is created through
                      Supabase Authentication.
                    </Text>
                  </View>
                </View>
              </>
            )}

            <View style={styles.footer}>
              <Ionicons
                name="qr-code-outline"
                size={18}
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
    paddingBottom: 35,
  },

  // Header
  hero: {
    backgroundColor: C.purple,
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
    paddingTop: 32,
    paddingBottom: 35,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroDecorationOne: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -90,
    right: -85,
  },
  heroDecorationTwo: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -55,
    left: -40,
  },
  logoContainer: {
    width: 83,
    height: 83,
    borderRadius: 26,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
    textAlign: 'center',
    marginTop: 6,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.17)',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 30,
    marginTop: 19,
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
  formHeadingIcon: {
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
    fontSize: 18,
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
    marginBottom: 19,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingVertical: 13,
    minWidth: 0,
  },

  // Role
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.lightPurple,
    borderWidth: 1,
    borderColor: '#DAD1FF',
    borderRadius: 15,
    padding: 13,
    marginBottom: 11,
    gap: 12,
  },
  roleIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleContent: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.darkPurple,
  },
  roleSubtitle: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
  },
  roleNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 22,
  },
  roleNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: C.muted,
  },

  // Hints and errors
  passwordHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 18,
  },
  passwordHintText: {
    flex: 1,
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
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

  // Buttons
  signUpButton: {
    backgroundColor: C.purple,
    borderRadius: 15,
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  signUpText: {
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
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 25,
  },
  loginPrompt: {
    color: C.muted,
    fontSize: 13,
  },
  loginLink: {
    color: C.purple,
    fontSize: 13,
    fontWeight: '800',
  },

  // Success
  successCard: {
    backgroundColor: C.white,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: C.border,
    marginHorizontal: 18,
    marginTop: 28,
    padding: 24,
    alignItems: 'center',
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 27,
    backgroundColor: C.lightGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 19,
  },
  successEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: C.green,
    marginBottom: 10,
  },
  successTitle: {
    color: C.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  successText: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 21,
  },
  successEmail: {
    color: C.purple,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 19,
  },
  successDescription: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 22,
    textAlign: 'center',
  },
  successHint: {
    backgroundColor: C.lightPurple,
    borderRadius: 13,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 20,
    marginBottom: 23,
  },
  successHintText: {
    flex: 1,
    color: C.darkPurple,
    fontSize: 12,
    lineHeight: 19,
  },
  successLink: {
    color: C.purple,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 10,
  },

  // Security and footer
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
    marginTop: 28,
    paddingHorizontal: 15,
  },
  footerText: {
    color: C.muted,
    fontSize: 11,
  },
});
