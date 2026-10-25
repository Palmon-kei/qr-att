
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import {
  getAttendanceHistory,
  type AttendanceRecord,
} from '@/lib/attendance';
import { useUserRole } from '@/lib/useUserRole';

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

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function HistoryScreen() {
  const {
    user,
    authLoading,
    roleLoading,
    isStudent,
  } = useUserRole();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (showLoading = true) => {
      if (!user?.id || !isStudent) {
        setRecords([]);
        setError(null);
        setLoading(false);
        return;
      }

      if (showLoading) {
        setLoading(true);
      }

      setError(null);

      try {
        const history = await getAttendanceHistory(user.id);
        setRecords(history);
      } catch (err: any) {
        console.error(
          'Failed to load attendance history:',
          err
        );

        setError(
          err?.message ||
            'Unable to load attendance history. Please try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [user?.id, isStudent]
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !roleLoading) {
        void loadHistory();
      }
    }, [authLoading, roleLoading, loadHistory])
  );

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await loadHistory(false);
    } finally {
      setRefreshing(false);
    }
  };

  if (authLoading || roleLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={C.purple}
        />

        <Text style={styles.loadingText}>
          Loading attendance history...
        </Text>
      </View>
    );
  }

  if (!isStudent) {
    return (
      <View style={styles.center}>
        <View style={styles.centerIcon}>
          <Ionicons
            name="lock-closed-outline"
            size={36}
            color={C.purple}
          />
        </View>

        <Text style={styles.centerTitle}>
          Student Access Only
        </Text>

        <Text style={styles.centerSubtitle}>
          Attendance history is available only
          to users with the student role.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={error ? [] : records}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListHeaderComponent={
          <View>
            {/* Purple hero */}
            <View style={styles.hero}>
              <View style={styles.heroDecoration} />

              <View style={styles.heroTopRow}>
                <View style={styles.heroIcon}>
                  <Ionicons
                    name="time-outline"
                    size={28}
                    color={C.white}
                  />
                </View>

                <View style={styles.studentBadge}>
                  <Ionicons
                    name="school-outline"
                    size={14}
                    color={C.white}
                  />
                  <Text style={styles.studentBadgeText}>
                    STUDENT
                  </Text>
                </View>
              </View>

              <Text style={styles.heroEyebrow}>
                QRR KOP WORKSPACE
              </Text>

              <Text style={styles.heroTitle}>
                Attendance History
              </Text>

              <Text style={styles.heroSubtitle}>
                View your attendance records,
                previous QR check-ins, and class
                participation.
              </Text>
            </View>

            {/* Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <View style={styles.summaryIcon}>
                  <Ionicons
                    name="checkmark-done-outline"
                    size={27}
                    color={C.purple}
                  />
                </View>

                <View style={styles.summaryBadge}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={14}
                    color={C.green}
                  />
                  <Text style={styles.summaryBadgeText}>
                    Recorded
                  </Text>
                </View>
              </View>

              <Text style={styles.summaryLabel}>
                TOTAL ATTENDANCE
              </Text>

              <Text style={styles.summaryNumber}>
                {error ? '—' : records.length}
              </Text>

              <Text style={styles.summaryDescription}>
                Successfully recorded QR check-ins
              </Text>
            </View>

            {/* Section heading */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}>
                  <Ionicons
                    name="list-outline"
                    size={20}
                    color={C.purple}
                  />
                </View>

                <Text style={styles.sectionTitle}>
                  My Attendance
                </Text>
              </View>

              {!error && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>
                    {records.length}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionSubtitle}>
              Your attendance records are securely
              loaded from your QRR KOP account.
            </Text>

            {/* Error state */}
            {error ? (
              <View style={styles.errorCard}>
                <View style={styles.errorIcon}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={33}
                    color={C.red}
                  />
                </View>

                <Text style={styles.errorTitle}>
                  Unable to Load History
                </Text>

                <Text style={styles.errorMessage}>
                  {error}
                </Text>

                <Pressable
                  style={styles.retryButton}
                  onPress={() => {
                    void loadHistory();
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name="refresh-outline"
                    size={20}
                    color={C.white}
                  />

                  <Text style={styles.retryText}>
                    Try Again
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* Empty state */}
            {!error && records.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="calendar-outline"
                    size={38}
                    color={C.purple}
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  No Attendance Yet
                </Text>

                <Text style={styles.emptyText}>
                  Your attendance records will
                  appear here after you scan
                  a valid class QR code.
                </Text>

                <View style={styles.emptyHint}>
                  <Ionicons
                    name="qr-code-outline"
                    size={19}
                    color={C.purple}
                  />

                  <Text style={styles.emptyHintText}>
                    Visit the Scan tab to check in.
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.recordCard}>
            <View style={styles.recordTop}>
              <View style={styles.recordIcon}>
                <Ionicons
                  name="book-outline"
                  size={24}
                  color={C.purple}
                />
              </View>

              <View style={styles.presentBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={C.green}
                />

                <Text style={styles.presentText}>
                  Present
                </Text>
              </View>
            </View>

            <Text style={styles.eventTitle}>
              {item.eventTitle}
            </Text>

            <View style={styles.eventIdRow}>
              <Ionicons
                name="pricetag-outline"
                size={16}
                color={C.muted}
              />

              <Text style={styles.eventId}>
                {item.eventId}
              </Text>
            </View>

            <View style={styles.recordDivider} />

            <Text style={styles.scanLabel}>
              DATE AND TIME SCANNED
            </Text>

            <View style={styles.dateRow}>
              <View style={styles.dateInfo}>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={C.purple}
                />

                <Text style={styles.dateText}>
                  {formatDate(item.scannedAt)}
                </Text>
              </View>

              <View style={styles.dateInfo}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={C.purple}
                />

                <Text style={styles.dateText}>
                  {formatTime(item.scannedAt)}
                </Text>
              </View>
            </View>

            <View style={styles.recordBottom}>
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color={C.green}
              />

              <Text style={styles.recordBottomText}>
                Attendance recorded successfully
              </Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          <Text style={styles.footer}>
            QRR KOP • Student Attendance Records
          </Text>
        }
      />
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
    paddingBottom: 40,
    flexGrow: 1,
  },

  // Center and loading
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerIcon: {
    width: 80,
    height: 80,
    borderRadius: 25,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  centerTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  centerSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: C.muted,
    textAlign: 'center',
  },
  loadingText: {
    color: C.muted,
    fontSize: 14,
    marginTop: 13,
  },

  // Purple hero
  hero: {
    backgroundColor: C.purple,
    borderRadius: 25,
    padding: 23,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: C.darkPurple,
    shadowOpacity: 0.13,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: -95,
    top: -90,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.17)',
  },
  studentBadgeText: {
    color: C.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#E3D9FF',
    marginBottom: 9,
  },
  heroTitle: {
    color: C.white,
    fontSize: 27,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#EAE4FF',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 310,
  },

  // Summary card
  summaryCard: {
    backgroundColor: C.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 21,
    marginBottom: 26,
    elevation: 1,
    shadowColor: C.darkPurple,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  summaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.lightGreen,
  },
  summaryBadgeText: {
    color: C.green,
    fontSize: 11,
    fontWeight: '800',
  },
  summaryLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  summaryNumber: {
    color: C.text,
    fontSize: 38,
    fontWeight: '900',
    marginTop: 5,
  },
  summaryDescription: {
    color: C.muted,
    fontSize: 12,
    marginTop: 4,
  },

  // Section heading
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: '800',
  },
  countBadge: {
    backgroundColor: C.lightPurple,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
  },
  countText: {
    color: C.purple,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 18,
  },

  // Attendance record
  recordCard: {
    backgroundColor: C.white,
    borderRadius: 21,
    padding: 19,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 13,
    elevation: 1,
    shadowColor: C.darkPurple,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
  recordTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  recordIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presentBadge: {
    backgroundColor: C.lightGreen,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  presentText: {
    color: C.green,
    fontSize: 12,
    fontWeight: '800',
  },
  eventTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  eventIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventId: {
    color: C.muted,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  recordDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 16,
  },
  scanLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
  },
  dateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dateText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '700',
  },
  recordBottom: {
    backgroundColor: C.lightGreen,
    borderRadius: 12,
    padding: 12,
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  recordBottomText: {
    color: C.green,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  // Empty state
  emptyCard: {
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 26,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 25,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 19,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyText: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
  },
  emptyHint: {
    backgroundColor: C.lightPurple,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 20,
  },
  emptyHintText: {
    color: C.darkPurple,
    fontSize: 12,
    fontWeight: '700',
  },

  // Error state
  errorCard: {
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  errorIcon: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: C.lightRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 9,
  },
  errorMessage: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 19,
  },
  retryButton: {
    backgroundColor: C.purple,
    borderRadius: 13,
    paddingHorizontal: 22,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  retryText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 25,
  },
});
