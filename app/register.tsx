import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Pressable,
} from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { signUp } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Role } from '@/lib/profiles';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);

    if (
      !email.trim() ||
      !fullName.trim() ||
      !password ||
      !confirmPassword
    ) {
      setError('Please fill in all required fields.');
      return;
    }

    if (role === 'student' && !studentId.trim()) {
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
      const { data, error: authError } = await signUp(
        email.trim(),
        password
      );

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.user) {
        setError('Registration was not completed. Please try again.');
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          student_id:
            role === 'student' ? studentId.trim() : null,
          role,
        })
        .eq('id', data.user.id);

      if (profileError) {
        setError(profileError.message);
        return;
      }

      setSuccess(true);
    } catch (err: any) {
      setError(
        err?.message || 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <Header title="QR Attendance" />
            </View>

            <Text style={styles.title}>Create Account</Text>

            <Text style={styles.subtitle}>
              Register to start using QR Attendance
            </Text>

            {success ? (
              <View style={styles.successContainer}>
                <Text style={styles.successTitle}>
                  Check your email!
                </Text>

                <Text style={styles.successText}>
                  We sent a confirmation link to {email}. Click the
                  link to verify your account, then come back and sign
                  in.
                </Text>

                <Link href="/login" style={styles.link}>
                  Back to Sign In
                </Link>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.label}>Full Name</Text>

                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor={COLORS.textSecondary}
                  editable={!loading}
                />

                <Text style={styles.label}>Account Type</Text>

                <View style={styles.roleContainer}>
                  <Pressable
                    style={[
                      styles.roleButton,
                      role === 'student' && styles.roleButtonSelected,
                    ]}
                    onPress={() => setRole('student')}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.roleText,
                        role === 'student' && styles.roleTextSelected,
                      ]}
                    >
                      Student
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.roleButton,
                      role === 'teacher' && styles.roleButtonSelected,
                    ]}
                    onPress={() => setRole('teacher')}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.roleText,
                        role === 'teacher' && styles.roleTextSelected,
                      ]}
                    >
                      Teacher
                    </Text>
                  </Pressable>
                </View>

                {role === 'student' && (
                  <>
                    <Text style={styles.label}>Student ID</Text>

                    <TextInput
                      style={styles.input}
                      value={studentId}
                      onChangeText={setStudentId}
                      placeholder="Enter your student ID"
                      placeholderTextColor={COLORS.textSecondary}
                      autoCapitalize="none"
                      editable={!loading}
                    />
                  </>
                )}

                <Text style={styles.label}>Email</Text>

                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your.email@school.edu"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />

                <Text style={styles.label}>Password</Text>

                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry
                  editable={!loading}
                />

                <Text style={styles.label}>Confirm Password</Text>

                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry
                  editable={!loading}
                />

                {error && <Text style={styles.error}>{error}</Text>}

                {loading ? (
                  <ActivityIndicator
                    size="large"
                    color={COLORS.primary}
                    style={styles.loader}
                  />
                ) : (
                  <AppButton
                    theme="primary"
                    title="Sign Up"
                    icon="person-add-outline"
                    onPress={handleRegister}
                  />
                )}
              </View>
            )}

            {!success && (
              <Link href="/login" style={styles.link}>
                Already have an account? Sign In
              </Link>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  roleButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  roleTextSelected: {
    color: '#FFFFFF',
  },
  error: {
    fontSize: 14,
    color: '#C62828',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  loader: {
    marginVertical: 16,
  },
  link: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    backgroundColor: COLORS.card,
    borderRadius: 14,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
});