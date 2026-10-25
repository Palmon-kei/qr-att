
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { useAuth, signOut } from '@/lib/auth';
import { getProfile, type Profile } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';

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

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return 'U';

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  return (
    words[0].charAt(0) +
    words[words.length - 1].charAt(0)
  ).toUpperCase();
}

// Convert the image picker's base64 into an ArrayBuffer.
// This preserves compatibility with Supabase Storage.
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  const clean = base64.replace(/\s/g, '');

  const padding = clean.endsWith('==')
    ? 2
    : clean.endsWith('=')
      ? 1
      : 0;

  const output = new Uint8Array(
    Math.floor(clean.length * 3 / 4) - padding
  );

  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const char of clean) {
    if (char === '=') break;

    const value = alphabet.indexOf(char);

    if (value < 0) {
      throw new Error(
        'The selected picture could not be read.'
      );
    }

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output[index++] = (buffer >> bits) & 255;
    }
  }

  return output.buffer as ArrayBuffer;
}

function getImageType(
  asset: ImagePicker.ImagePickerAsset
): {
  contentType: string;
  extension: string;
} {
  const mime = asset.mimeType?.toLowerCase();
  const filename = asset.fileName?.toLowerCase() ?? '';

  if (mime === 'image/png' || filename.endsWith('.png')) {
    return {
      contentType: 'image/png',
      extension: 'png',
    };
  }

  if (
    mime === 'image/webp' ||
    filename.endsWith('.webp')
  ) {
    return {
      contentType: 'image/webp',
      extension: 'webp',
    };
  }

  if (
    mime === 'image/jpeg' ||
    filename.endsWith('.jpg') ||
    filename.endsWith('.jpeg') ||
    (!mime && !filename)
  ) {
    return {
      contentType: 'image/jpeg',
      extension: 'jpg',
    };
  }

  throw new Error(
    'Please choose a JPG, PNG, or WebP picture.'
  );
}

type IconName =
  React.ComponentProps<typeof Ionicons>['name'];

type InfoRowProps = {
  icon: IconName;
  label: string;
  value: string;
  last?: boolean;
};

function InfoRow({
  icon,
  label,
  value,
  last = false,
}: InfoRowProps) {
  return (
    <View
      style={[
        styles.infoRow,
        !last && styles.infoRowBorder,
      ]}
    >
      <View style={styles.infoIcon}>
        <Ionicons
          name={icon}
          size={21}
          color={C.purple}
        />
      </View>

      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>
          {label}
        </Text>

        <Text style={styles.infoValue} selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [profileLoading, setProfileLoading] =
    useState(true);

  const [profileError, setProfileError] =
    useState<string | null>(null);

  const [signingOut, setSigningOut] =
    useState(false);

  const [avatarUrl, setAvatarUrl] =
    useState<string | null>(null);

  const [uploadingPhoto, setUploadingPhoto] =
    useState(false);

  // Reload profile whenever this tab becomes active.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadProfile = async () => {
        if (!user?.id) {
          if (active) {
            setProfile(null);
            setAvatarUrl(null);
            setProfileError(null);
            setProfileLoading(false);
          }
          return;
        }

        setProfileLoading(true);
        setProfileError(null);
        setProfile(null);
        setAvatarUrl(null);

        try {
          const [profileData, avatarResult] =
            await Promise.all([
              getProfile(user.id),

              supabase
                .from('profiles')
                .select('avatar_path')
                .eq('id', user.id)
                .maybeSingle(),
            ]);

          if (!active) return;

          setProfile(profileData);

          if (avatarResult.error) {
            console.warn(
              'Could not load avatar:',
              avatarResult.error
            );
          } else if (avatarResult.data?.avatar_path) {
            const { data: publicData } =
              supabase.storage
                .from('avatars')
                .getPublicUrl(
                  avatarResult.data.avatar_path
                );

            setAvatarUrl(publicData.publicUrl);
          }

          if (!profileData) {
            setProfileError(
              'Your profile information could not be found.'
            );
          }
        } catch (error) {
          console.error(
            'Failed to load profile:',
            error
          );

          if (active) {
            setProfileError(
              'Unable to load your profile. Please check your connection.'
            );
          }
        } finally {
          if (active) {
            setProfileLoading(false);
          }
        }
      };

      void loadProfile();

      return () => {
        active = false;
      };
    }, [user?.id])
  );

  const handleChangePhoto = async () => {
    if (
      !user?.id ||
      !profile ||
      uploadingPhoto ||
      signingOut
    ) {
      return;
    }

    try {
      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
          base64: true,
        });

      if (
        result.canceled ||
        !result.assets.length
      ) {
        return;
      }

      const asset = result.assets[0];

      if (!asset.base64) {
        throw new Error(
          'Unable to read that photo. Please try another.'
        );
      }

      const { contentType, extension } =
        getImageType(asset);

      const bytes =
        base64ToArrayBuffer(asset.base64);

      if (bytes.byteLength > 5 * 1024 * 1024) {
        throw new Error(
          'Your photo must be smaller than 5 MB.'
        );
      }

      setUploadingPhoto(true);

      // Keep the existing unique-path upload behavior.
      const path = `${user.id}/${Date.now()}-${Math.floor(
        Math.random() * 1000000
      )}.${extension}`;

      const { error: uploadError } =
        await supabase.storage
          .from('avatars')
          .upload(path, bytes, {
            contentType,
            upsert: false,
          });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Verify the database actually saved the avatar path.
      const {
        data: savedProfile,
        error: saveError,
      } = await supabase
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', user.id)
        .select('avatar_path')
        .single();

      if (
        saveError ||
        savedProfile?.avatar_path !== path
      ) {
        throw new Error(
          saveError?.message ||
            'Unable to save the photo to your profile.'
        );
      }

      const { data: publicData } =
        supabase.storage
          .from('avatars')
          .getPublicUrl(path);

      setAvatarUrl(publicData.publicUrl);

      Alert.alert(
        'Photo Updated',
        'Your profile picture has been saved.'
      );
    } catch (err: unknown) {
      Alert.alert(
        'Photo Upload Failed',
        err instanceof Error
          ? err.message
          : 'Please try again.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await signOut();
      router.replace('/login');
    } catch (err: unknown) {
      Alert.alert(
        'Sign Out Failed',
        err instanceof Error
          ? err.message
          : 'Failed to sign out.'
      );
    } finally {
      setSigningOut(false);
    }
  };

  const fullName =
    profile?.full_name?.trim() ||
    'QRR KOP User';

  const role =
    profile?.role === 'admin'
      ? 'Administrator'
      : profile?.role === 'teacher'
        ? 'Teacher'
        : profile?.role === 'student'
          ? 'Student'
          : 'Account';

  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const isStudent = profile?.role === 'student';

  const roleIcon: IconName = isAdmin
    ? 'shield-checkmark-outline'
    : isTeacher
      ? 'school-outline'
      : 'person-outline';

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile header */}
        <View style={styles.hero}>
          <View style={styles.heroDecoration} />

          <View style={styles.heroTop}>
            <View style={styles.heroHeadingIcon}>
              <Ionicons
                name="person-circle-outline"
                size={25}
                color={C.white}
              />
            </View>

            <View style={styles.heroTopText}>
              <Text style={styles.heroHeading}>
                My Profile
              </Text>

              <Text style={styles.heroEyebrow}>
                QRR KOP ACCOUNT
              </Text>
            </View>
          </View>

          <Text style={styles.heroSubtitle}>
            View your account details and manage
            your profile picture.
          </Text>

          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  onError={() =>
                    setAvatarUrl(null)
                  }
                />
              ) : (
                <Text style={styles.avatarText}>
                  {getInitials(fullName)}
                </Text>
              )}
            </View>

            <View style={styles.avatarBadge}>
              <Ionicons
                name="camera"
                size={16}
                color={C.white}
              />
            </View>
          </View>

          <Text style={styles.profileName}>
            {fullName}
          </Text>

          <Text style={styles.profileEmail}>
            {user?.email ||
              'No email available'}
          </Text>

          {profile && (
            <View style={styles.roleBadge}>
              <Ionicons
                name={roleIcon}
                size={17}
                color={C.darkPurple}
              />

              <Text style={styles.roleText}>
                {role} Account
              </Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.changePhotoButton,
              pressed && styles.buttonPressed,
              (uploadingPhoto ||
                profileLoading ||
                !profile) &&
                styles.disabledButton,
            ]}
            onPress={() => {
              void handleChangePhoto();
            }}
            disabled={
              uploadingPhoto ||
              profileLoading ||
              !profile ||
              signingOut
            }
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            {uploadingPhoto ? (
              <ActivityIndicator
                size="small"
                color={C.purple}
              />
            ) : (
              <Ionicons
                name="camera-outline"
                size={18}
                color={C.purple}
              />
            )}

            <Text style={styles.changePhotoText}>
              {uploadingPhoto
                ? 'Uploading Photo...'
                : 'Change Photo'}
            </Text>
          </Pressable>
        </View>

        {/* Account information */}
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <Ionicons
              name="id-card-outline"
              size={20}
              color={C.purple}
            />
          </View>

          <Text style={styles.sectionTitle}>
            Account Information
          </Text>
        </View>

        <Text style={styles.sectionSubtitle}>
          Your details are securely connected
          to your QRR KOP account.
        </Text>

        {profileLoading ? (
          <View style={styles.messageCard}>
            <ActivityIndicator
              size="large"
              color={C.purple}
            />

            <Text style={styles.messageText}>
              Loading your profile...
            </Text>
          </View>
        ) : profileError ? (
          <View style={styles.messageCard}>
            <View style={styles.errorIcon}>
              <Ionicons
                name="alert-circle-outline"
                size={30}
                color={C.red}
              />
            </View>

            <Text style={styles.errorTitle}>
              Profile Unavailable
            </Text>

            <Text style={styles.messageText}>
              {profileError}
            </Text>

            <Text style={styles.retryHint}>
              Switch tabs and return to Profile
              to try loading again.
            </Text>
          </View>
        ) : user && profile ? (
          <View style={styles.infoCard}>
            <InfoRow
              icon="person-outline"
              label="Full Name"
              value={
                profile.full_name ||
                'Not provided'
              }
            />

            <InfoRow
              icon="people-outline"
              label="Account Type"
              value={role}
            />

            {isStudent && (
              <InfoRow
                icon="card-outline"
                label="Student ID"
                value={
                  profile.student_id ||
                  'Not provided'
                }
              />
            )}

            <InfoRow
              icon="mail-outline"
              label="Email Address"
              value={
                user.email ||
                'Not provided'
              }
            />

            <InfoRow
              icon="finger-print-outline"
              label="Account User ID"
              value={user.id}
              last
            />
          </View>
        ) : (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>
              Please sign in to view
              your profile.
            </Text>
          </View>
        )}

        {/* Account actions */}
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <Ionicons
              name="settings-outline"
              size={20}
              color={C.purple}
            />
          </View>

          <Text style={styles.sectionTitle}>
            Account Actions
          </Text>
        </View>

        <View style={styles.actionCard}>
          <View style={styles.actionRow}>
            <View style={styles.actionIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={23}
                color={C.purple}
              />
            </View>

            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>
                Your Account
              </Text>

              <Text style={styles.actionSubtitle}>
                Your profile and attendance
                information are stored in Supabase.
              </Text>
            </View>
          </View>

          <View style={styles.actionDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.buttonPressed,
              signingOut && styles.disabledButton,
            ]}
            onPress={() => {
              void handleSignOut();
            }}
            disabled={signingOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out of QRR KOP"
          >
            {signingOut ? (
              <ActivityIndicator
                size="small"
                color={C.white}
              />
            ) : (
              <Ionicons
                name="log-out-outline"
                size={21}
                color={C.white}
              />
            )}

            <Text style={styles.signOutText}>
              {signingOut
                ? 'Signing Out...'
                : 'Sign Out'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          QRR KOP • QR Attendance System
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: 18,
    paddingBottom: 45,
  },

  // Profile header
  hero: {
    backgroundColor: C.purple,
    borderRadius: 25,
    padding: 23,
    alignItems: 'center',
    marginBottom: 27,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: C.darkPurple,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
  },
  heroDecoration: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor:
      'rgba(255,255,255,0.08)',
    top: -100,
    right: -90,
  },
  heroTop: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 10,
  },
  heroHeadingIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor:
      'rgba(255,255,255,0.17)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTopText: {
    flex: 1,
  },
  heroHeading: {
    color: C.white,
    fontSize: 23,
    fontWeight: '800',
  },
  heroEyebrow: {
    color: '#E3D9FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  heroSubtitle: {
    color: '#EAE4FF',
    fontSize: 12,
    lineHeight: 19,
    alignSelf: 'stretch',
    marginBottom: 26,
  },

  // Avatar
  avatarWrapper: {
    marginBottom: 16,
  },
  avatar: {
    width: 105,
    height: 105,
    borderRadius: 53,
    backgroundColor: C.white,
    borderWidth: 4,
    borderColor: '#DAD1FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 34,
    fontWeight: '800',
    color: C.purple,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 53,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 1,
    right: 0,
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: C.darkPurple,
    borderWidth: 2,
    borderColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 23,
    fontWeight: '900',
    color: C.white,
    textAlign: 'center',
    marginBottom: 7,
  },
  profileEmail: {
    fontSize: 13,
    color: '#EAE4FF',
    textAlign: 'center',
    marginBottom: 15,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: C.white,
    borderRadius: 25,
    paddingHorizontal: 17,
    paddingVertical: 9,
    marginBottom: 17,
  },
  roleText: {
    color: C.darkPurple,
    fontSize: 12,
    fontWeight: '800',
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: C.white,
  },
  changePhotoText: {
    color: C.purple,
    fontSize: 12,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  disabledButton: {
    opacity: 0.6,
  },

  // Account information
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 9,
  },
  sectionIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: C.text,
  },
  sectionSubtitle: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 17,
  },
  infoCard: {
    backgroundColor: C.white,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 18,
    paddingVertical: 4,
    marginBottom: 28,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    paddingVertical: 17,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
    paddingTop: 2,
  },
  infoLabel: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '600',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
    lineHeight: 21,
  },

  // Loading and error states
  messageCard: {
    backgroundColor: C.white,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.border,
    padding: 26,
    alignItems: 'center',
    marginBottom: 28,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 21,
    color: C.muted,
    textAlign: 'center',
    marginTop: 10,
  },
  errorIcon: {
    backgroundColor: C.lightRed,
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.text,
  },
  retryHint: {
    fontSize: 12,
    color: C.purple,
    textAlign: 'center',
    marginTop: 12,
  },

  // Account actions
  actionCard: {
    backgroundColor: C.white,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    marginTop: 11,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.text,
    marginBottom: 5,
  },
  actionSubtitle: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 19,
  },
  actionDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 18,
  },
  signOutButton: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '800',
    color: C.white,
  },
  footer: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 27,
  },
});
