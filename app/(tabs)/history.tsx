import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  getAttendanceHistory,
  type AttendanceRecord,
} from '@/lib/attendance';

export default function HistoryScreen() {
  const { user } = useAuth();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!user?.id) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const history = await getAttendanceHistory(user.id);

    setRecords(history);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const formatDate = (value: string) => {
    const date = new Date(value);

    return date.toLocaleString();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />

        <Text style={styles.loadingText}>
          Loading attendance...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Attendance History
      </Text>

      {records.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            No attendance yet
          </Text>

          <Text style={styles.emptyText}>
            Your attendance records will appear here after
            you scan an event QR code.
          </Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.eventTitle}>
                {item.eventTitle}
              </Text>

              <Text style={styles.label}>
                Event ID
              </Text>

              <Text style={styles.value}>
                {item.eventId}
              </Text>

              <Text style={styles.label}>
                Scanned
              </Text>

              <Text style={styles.value}>
                {formatDate(item.scannedAt)}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },

  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 15,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 20,
  },

  list: {
    paddingBottom: 20,
  },

  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },

  eventTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 14,
  },

  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 6,
    marginBottom: 2,
  },

  value: {
    fontSize: 15,
    color: COLORS.textPrimary,
  },

  emptyCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 20,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },

  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
  },
});