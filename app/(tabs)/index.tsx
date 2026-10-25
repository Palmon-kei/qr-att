
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/lib/useUserRole';

const C = {
  purple: COLORS.primary,
  purpleDark: COLORS.primaryDark,
  deep: COLORS.primaryDeep,
  lavender: COLORS.primaryLight,
  lavenderSoft: COLORS.surface,
  canvas: COLORS.background,
  white: COLORS.white,
  ink: COLORS.textPrimary,
  muted: COLORS.textSecondary,
  border: COLORS.border,
  green: COLORS.success,
  greenSoft: COLORS.successLight,
  blue: '#3478DC',
  blueSoft: '#E9F2FF',
};

type IconName = keyof typeof Ionicons.glyphMap;

type Destination =
  | '/(tabs)/scan'
  | '/(tabs)/history'
  | '/(tabs)/teacher'
  | '/(tabs)/admin'
  | '/(tabs)/users'
  | '/(tabs)/profile';

type QuickActionProps = {
  title: string;
  subtitle: string;
  icon: IconName;
  destination: Destination;
  tint?: string;
  background?: string;
};

function QuickAction({
  title,
  subtitle,
  icon,
  destination,
  tint = C.purple,
  background = C.lavender,
}: QuickActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push(destination)}
      style={({ pressed }) => [
        styles.quickAction,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.quickIcon,
          { backgroundColor: background },
        ]}
      >
        <Ionicons name={icon} size={23} color={tint} />
      </View>

      <Text style={styles.quickTitle}>{title}</Text>
      <Text style={styles.quickSubtitle}>{subtitle}</Text>

      <Ionicons
        name="arrow-forward"
        size={17}
        color={C.muted}
        style={styles.quickArrow}
      />
    </Pressable>
  );
}

type StatCardProps = {
  icon: IconName;
  label: string;
  value: string;
  color?: string;
  background?: string;
};

function StatCard({
  icon,
  label,
  value,
  color = C.purple,
  background = C.lavender,
}: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View
        style={[
          styles.statIcon,
          { backgroundColor: background },
        ]}
      >
        <Ionicons name={icon} size={19} color={color} />
      </View>

      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>

      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

type GuideRowProps = {
  number: string;
  title: string;
  description: string;
  icon: IconName;
  last?: boolean;
};

function GuideRow({
  number,
  title,
  description,
  icon,
  last = false,
}: GuideRowProps) {
  return (
    <View
      style={[
        styles.guideRow,
        !last && styles.guideDivider,
      ]}
    >
      <View style={styles.guideIcon}>
        <Ionicons name={icon} size={21} color={C.purple} />
      </View>

      <View style={styles.guideCopy}>
        <Text style={styles.guideStep}>
          STEP {number}
        </Text>
        <Text style={styles.guideTitle}>{title}</Text>
        <Text style={styles.guideDescription}>
          {description}
        </Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { user, loading: authLoading } = useAuth();

  const {
    roleLoading,
    isStudent,
    isTeacher,
    isAdmin,
  } = useUserRole();

  const [displayName, setDisplayName] =
    useState<string | null>(null);

  const [recordCount, setRecordCount] =
    useState<number | null>(null);

  const [countLoading, setCountLoading] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const loadOverview = useCallback(
    async (isActive: () => boolean) => {
      if (!user?.id) return;

      if (isActive()) setCountLoading(true);

      try {
        const profileRequest = supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();

        const countRequest = isStudent
          ? supabase
              .from('attendance')
              .select('id', {
                count: 'exact',
                head: true,
              })
              .eq('student_id', user.id)
          : isTeacher
            ? supabase
                .from('events')
                .select('event_id', {
                  count: 'exact',
                  head: true,
                })
                .eq('created_by', user.id)
            : null;

        const [profileResult, countResult] =
          await Promise.all([
            profileRequest,
            countRequest,
          ]);

        if (!isActive()) return;

        if (!profileResult.error) {
          setDisplayName(
            profileResult.data?.full_name?.trim() || null
          );
        }

        if (countResult) {
          setRecordCount(
            countResult.error
              ? null
              : countResult.count ?? null
          );
        } else {
          setRecordCount(null);
        }
      } catch (error) {
        console.warn(
          'Unable to load dashboard overview:',
          error
        );

        if (isActive()) setRecordCount(null);
      } finally {
        if (isActive()) setCountLoading(false);
      }
    },
    [user?.id, isStudent, isTeacher]
  );

  // Refresh whenever Home becomes active.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (!authLoading && !roleLoading && user?.id) {
        void loadOverview(() => active);
      }

      return () => {
        active = false;
      };
    }, [
      authLoading,
      roleLoading,
      user?.id,
      loadOverview,
    ])
  );

  const handleRefresh = async () => {
    if (!user?.id || refreshing) return;

    setRefreshing(true);

    try {
      await loadOverview(() => true);
    } finally {
      setRefreshing(false);
    }
  };

  if (authLoading || roleLoading) {
    return (
      <View style={styles.loadingScreen}>
        <View style={styles.loadingLogo}>
          <Ionicons
            name="qr-code-outline"
            size={34}
            color={C.purple}
          />
        </View>

        <ActivityIndicator
          size="large"
          color={C.purple}
        />

        <Text style={styles.loadingText}>
          Preparing your dashboard...
        </Text>
      </View>
    );
  }

  const role = isAdmin
    ? 'Administrator'
    : isTeacher
      ? 'Teacher'
      : isStudent
        ? 'Student'
        : 'Account';

  const mainDestination: Destination = isAdmin
    ? '/(tabs)/admin'
    : isTeacher
      ? '/(tabs)/teacher'
      : isStudent
        ? '/(tabs)/scan'
        : '/(tabs)/profile';

  const mainTitle = isAdmin
    ? 'Open Admin Dashboard'
    : isTeacher
      ? 'Manage Attendance'
      : isStudent
        ? 'Ready to Scan?'
        : 'View Your Profile';

  const mainDescription = isAdmin
    ? 'Review school activity, accounts, and reports.'
    : isTeacher
      ? 'Create events, share QR codes, and review attendance.'
      : isStudent
        ? 'Scan your teacher’s QR code to record your attendance.'
        : 'Access your account information and settings.';

  const firstName = displayName?.split(/\s+/)[0];

  const greetingName = firstName
    ? `, ${firstName}`
    : '';

  const initial = (
    displayName ||
    user?.email ||
    'Q'
  ).trim().charAt(0).toUpperCase();

  const countValue = countLoading
    ? '...'
    : recordCount === null
      ? '—'
      : String(recordCount);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={C.purple}
          colors={[C.purple]}
        />
      }
    >
      {/* BRAND HEADER */}
      <View style={styles.header}>
        <View style={styles.headerOrbOne} />
        <View style={styles.headerOrbTwo} />

        <View style={styles.headerTop}>
          <View style={styles.headerBrand}>
            <View style={styles.brandMark}>
              <Ionicons
                name="qr-code-outline"
                size={23}
                color={C.white}
              />
            </View>

            <View>
              <Text style={styles.brandName}>
                QRR KOP
              </Text>

              <Text style={styles.brandCaption}>
                Smart Attendance
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() =>
              router.push('/(tabs)/profile')
            }
            style={({ pressed }) => [
              styles.avatar,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.avatarText}>
              {initial}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.headerEyebrow}>
          YOUR WORKSPACE
        </Text>

        <Text style={styles.headerGreeting}>
          Welcome back{greetingName}!
        </Text>

        <Text style={styles.headerDescription}>
          {isAdmin
            ? 'Everything you need to oversee attendance.'
            : isTeacher
              ? 'Keep your classes and attendance organized.'
              : isStudent
                ? 'Your attendance journey, all in one place.'
                : 'Your attendance account at a glance.'}
        </Text>

        <View style={styles.rolePill}>
          <Ionicons
            name={
              isAdmin
                ? 'shield-checkmark-outline'
                : isTeacher
                  ? 'school-outline'
                  : 'person-outline'
            }
            size={14}
            color={C.deep}
          />

          <Text style={styles.rolePillText}>
            {role}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* OVERVIEW */}
        <View style={styles.overviewTitleRow}>
          <View>
            <Text style={styles.sectionEyebrow}>
              OVERVIEW
            </Text>

            <Text style={styles.sectionTitle}>
              At a glance
            </Text>
          </View>

          <View style={styles.overviewAccent}>
            <Ionicons
              name="sparkles-outline"
              size={18}
              color={C.purple}
            />
          </View>
        </View>

        <View style={styles.statsRow}>
          {isStudent ? (
            <>
              <StatCard
                icon="checkmark-done-outline"
                label="My attendance records"
                value={countValue}
                color={C.green}
                background={C.greenSoft}
              />

              <StatCard
                icon="scan-outline"
                label="QR attendance"
                value="Ready"
              />
            </>
          ) : isTeacher ? (
            <>
              <StatCard
                icon="calendar-outline"
                label="Events created"
                value={countValue}
              />

              <StatCard
                icon="people-outline"
                label="Attendance tools"
                value="Ready"
                color={C.blue}
                background={C.blueSoft}
              />
            </>
          ) : isAdmin ? (
            <>
              <StatCard
                icon="shield-checkmark-outline"
                label="Your access"
                value="Admin"
              />

              <StatCard
                icon="bar-chart-outline"
                label="Reports"
                value="Ready"
                color={C.green}
                background={C.greenSoft}
              />
            </>
          ) : (
            <>
              <StatCard
                icon="person-outline"
                label="Account"
                value="Active"
              />

              <StatCard
                icon="settings-outline"
                label="Profile"
                value="Ready"
              />
            </>
          )}
        </View>

        {/* MAIN ACTION */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mainTitle}
          onPress={() =>
            router.push(mainDestination)
          }
          style={({ pressed }) => [
            styles.heroCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.heroOrb} />

          <View style={styles.heroIcon}>
            <Ionicons
              name={
                isAdmin
                  ? 'shield-outline'
                  : isTeacher
                    ? 'calendar-outline'
                    : isStudent
                      ? 'qr-code-outline'
                      : 'person-outline'
              }
              size={28}
              color={C.white}
            />
          </View>

          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>
              QUICK START
            </Text>

            <Text style={styles.heroTitle}>
              {mainTitle}
            </Text>

            <Text style={styles.heroDescription}>
              {mainDescription}
            </Text>
          </View>

          <View style={styles.heroArrow}>
            <Ionicons
              name="arrow-forward"
              size={22}
              color={C.purple}
            />
          </View>
        </Pressable>

        {/* QUICK ACTIONS */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>
            Quick actions
          </Text>

          <Text style={styles.sectionHint}>
            Just a tap away
          </Text>
        </View>

        <View style={styles.actionsGrid}>
          {isAdmin ? (
            <>
              <QuickAction
                title="Admin Panel"
                subtitle="School overview and reports"
                icon="shield-checkmark-outline"
                destination="/(tabs)/admin"
              />

              <QuickAction
                title="Manage Users"
                subtitle="View registered accounts"
                icon="people-outline"
                destination="/(tabs)/users"
                tint={C.blue}
                background={C.blueSoft}
              />

              <QuickAction
                title="Events"
                subtitle="View event management tools"
                icon="calendar-outline"
                destination="/(tabs)/teacher"
                tint={C.green}
                background={C.greenSoft}
              />

              <QuickAction
                title="My Profile"
                subtitle="Account information"
                icon="person-outline"
                destination="/(tabs)/profile"
              />
            </>
          ) : isTeacher ? (
            <>
              <QuickAction
                title="Teacher Tools"
                subtitle="Create and manage events"
                icon="calendar-outline"
                destination="/(tabs)/teacher"
              />

              <QuickAction
                title="My Profile"
                subtitle="Account information"
                icon="person-outline"
                destination="/(tabs)/profile"
                tint={C.blue}
                background={C.blueSoft}
              />
            </>
          ) : isStudent ? (
            <>
              <QuickAction
                title="Scan QR"
                subtitle="Record attendance"
                icon="scan-outline"
                destination="/(tabs)/scan"
              />

              <QuickAction
                title="My History"
                subtitle="View your records"
                icon="time-outline"
                destination="/(tabs)/history"
                tint={C.blue}
                background={C.blueSoft}
              />

              <QuickAction
                title="My Profile"
                subtitle="Account information"
                icon="person-outline"
                destination="/(tabs)/profile"
                tint={C.green}
                background={C.greenSoft}
              />
            </>
          ) : (
            <QuickAction
              title="My Profile"
              subtitle="Account information"
              icon="person-outline"
              destination="/(tabs)/profile"
            />
          )}
        </View>

        {/* USER GUIDE */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>
            How it works
          </Text>

          <View style={styles.helpBadge}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={C.purple}
            />
          </View>
        </View>

        <View style={styles.guideCard}>
          {isAdmin ? (
            <>
              <GuideRow
                number="01"
                title="Review activity"
                description="See school attendance information."
                icon="stats-chart-outline"
              />

              <GuideRow
                number="02"
                title="Manage accounts"
                description="Review registered users and their access."
                icon="people-outline"
              />

              <GuideRow
                number="03"
                title="Export reports"
                description="Access attendance reporting tools."
                icon="document-text-outline"
                last
              />
            </>
          ) : isTeacher ? (
            <>
              <GuideRow
                number="01"
                title="Create an event"
                description="Set the event title and attendance window."
                icon="calendar-outline"
              />

              <GuideRow
                number="02"
                title="Show the QR code"
                description="Let students scan the event code."
                icon="qr-code-outline"
              />

              <GuideRow
                number="03"
                title="Review attendance"
                description="View attendees, reports, and analytics."
                icon="people-outline"
                last
              />
            </>
          ) : (
            <>
              <GuideRow
                number="01"
                title="Open the scanner"
                description="Point your camera at the event QR code."
                icon="scan-outline"
              />

              <GuideRow
                number="02"
                title="Register attendance"
                description="The app validates your scan and checks duplicates."
                icon="checkmark-circle-outline"
              />

              <GuideRow
                number="03"
                title="View your history"
                description="Find your recorded attendance in one place."
                icon="time-outline"
                last
              />
            </>
          )}
        </View>

        <Text style={styles.footer}>
          QRR KOP  •  Smart Attendance System
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.canvas,
  },
  scrollContent: {
    paddingBottom: 22,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.canvas,
    gap: 12,
  },
  loadingLogo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.lavender,
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 13,
    color: C.muted,
  },
  header: {
    backgroundColor: C.purple,
    paddingHorizontal: 23,
    paddingTop: 24,
    paddingBottom: 34,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  headerOrbOne: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.07)',
    right: -110,
    top: -90,
  },
  headerOrbTwo: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.07)',
    left: -70,
    bottom: -80,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 31,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  brandMark: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.19)',
  },
  brandName: {
    fontSize: 18,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.4,
  },
  brandCaption: {
    fontSize: 11,
    color: '#E7DEFF',
    marginTop: 2,
  },
  avatar: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: C.purple,
  },
  headerEyebrow: {
    color: '#DCD2FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  headerGreeting: {
    color: C.white,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 33,
  },
  headerDescription: {
    color: '#EAE4FF',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 300,
  },
  rolePill: {
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.white,
  },
  rolePillText: {
    fontSize: 11,
    color: C.deep,
    fontWeight: '800',
  },
  body: {
    paddingHorizontal: 19,
    paddingTop: 25,
  },
  overviewTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  overviewAccent: {
    width: 33,
    height: 33,
    borderRadius: 11,
    backgroundColor: C.lavender,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: C.purple,
    marginBottom: 5,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: C.ink,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    padding: 16,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  statValue: {
    fontSize: 25,
    fontWeight: '900',
    color: C.ink,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 16,
    color: C.muted,
    minHeight: 32,
  },
  heroCard: {
    borderRadius: 23,
    backgroundColor: C.purple,
    padding: 21,
    minHeight: 170,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    overflow: 'hidden',
    marginBottom: 28,
    elevation: 3,
    shadowColor: C.purpleDark,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
  },
  heroOrb: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: -55,
    top: -55,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.17)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    color: '#DDD5FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  heroTitle: {
    color: C.white,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 7,
  },
  heroDescription: {
    color: '#EEE9FF',
    fontSize: 12,
    lineHeight: 18,
  },
  heroArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  sectionHint: {
    fontSize: 11,
    color: C.muted,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  quickAction: {
    width: '47%',
    minHeight: 153,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    padding: 15,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 13,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 5,
  },
  quickSubtitle: {
    fontSize: 11,
    color: C.muted,
    lineHeight: 16,
    paddingRight: 14,
  },
  quickArrow: {
    position: 'absolute',
    right: 13,
    bottom: 14,
  },
  helpBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideCard: {
    borderRadius: 21,
    backgroundColor: C.white,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderColor: C.border,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    paddingVertical: 17,
  },
  guideDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  guideIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.lavenderSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideCopy: {
    flex: 1,
  },
  guideStep: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: C.purple,
    marginBottom: 4,
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 4,
  },
  guideDescription: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 18,
  },
  footer: {
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
    marginTop: 27,
    marginBottom: 10,
  },
  pressed: {
    opacity: 0.82,
  },
});
