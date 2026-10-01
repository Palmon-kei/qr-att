import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  createEvent,
  getEventsByTeacher,
  type CloudEvent,
} from '@/lib/events';
import {
  getTeacherEventAttendance,
  getTeacherEventSummary,
  type TeacherAttendanceRecord,
  type TeacherEventSummary,
} from '@/lib/attendance';
import { buildQRPayload } from '@/lib/qr';

export default function TeacherScreen() {
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [summaries, setSummaries] = useState<TeacherEventSummary[]>([]);
  const [attendance, setAttendance] = useState<TeacherAttendanceRecord[]>(
    []
  );

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadTeacherData = useCallback(async () => {
    if (!user?.id) {
      setEvents([]);
      setSummaries([]);
      setAttendance([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [teacherEvents, teacherSummaries, teacherAttendance] =
      await Promise.all([
        getEventsByTeacher(user.id),
        getTeacherEventSummary(user.id),
        getTeacherEventAttendance(user.id),
      ]);

    setEvents(teacherEvents);
    setSummaries(teacherSummaries);
    setAttendance(teacherAttendance);

    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadTeacherData();
    }, [loadTeacherData])
  );

  const handleCreateEvent = async () => {
    if (creating) {
      return;
    }

    if (!user?.id) {
      Alert.alert(
        'Not signed in',
        'You must be signed in to create an event.'
      );
      return;
    }

    if (!eventId.trim()) {
      Alert.alert(
        'Missing Event ID',
        'Please enter an event ID.'
      );
      return;
    }

    if (!title.trim()) {
      Alert.alert(
        'Missing Title',
        'Please enter an event title.'
      );
      return;
    }

    if (!start.trim() || !end.trim()) {
      Alert.alert(
        'Missing Time',
        'Please enter the event start and end time.'
      );
      return;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      Alert.alert(
        'Invalid Time',
        'Please use a valid date and time format.'
      );
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      Alert.alert(
        'Invalid Time',
        'The end time must be after the start time.'
      );
      return;
    }

    setCreating(true);

    try {
      await createEvent({
        eventId: eventId.trim(),
        title: title.trim(),
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      });

      setTitle('');
      setEventId('');
      setStart('');
      setEnd('');

      await loadTeacherData();

      Alert.alert(
        'Event Created',
        'The attendance event was created successfully.'
      );
    } catch (error: any) {
      Alert.alert(
        'Create Event Failed',
        error?.message ?? 'Unable to create the event.'
      );
    } finally {
      setCreating(false);
    }
  };

  const showQRPayload = (event: CloudEvent) => {
    const qrPayload = buildQRPayload({
      eventId: event.event_id,
      title: event.title,
      start: event.start_time,
      end: event.end_time,
    });

    Alert.alert(
      'QR Code Data',
      qrPayload,
      [
        {
          text: 'Close',
          style: 'cancel',
        },
      ]
    );
  };

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
          Loading teacher data...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.event_id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>
              Teacher
            </Text>

            <Text style={styles.subtitle}>
              Create attendance events and view attendance records.
            </Text>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Create Event
              </Text>

              <Text style={styles.label}>
                Event ID
              </Text>

              <TextInput
                value={eventId}
                onChangeText={setEventId}
                placeholder="Example: EVENT-001"
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="characters"
                style={styles.input}
              />

              <Text style={styles.label}>
                Event Title
              </Text>

              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Example: Database Laboratory"
                placeholderTextColor={COLORS.textSecondary}
                style={styles.input}
              />

              <Text style={styles.label}>
                Start Time
              </Text>

              <TextInput
                value={start}
                onChangeText={setStart}
                placeholder="2026-10-01T15:00:00"
                placeholderTextColor={COLORS.textSecondary}
                style={styles.input}
              />

              <Text style={styles.label}>
                End Time
              </Text>

              <TextInput
                value={end}
                onChangeText={setEnd}
                placeholder="2026-10-01T17:00:00"
                placeholderTextColor={COLORS.textSecondary}
                style={styles.input}
              />

              <AppButton
                title={
                  creating
                    ? 'Creating Event...'
                    : 'Create Event'
                }
                icon="add-circle-outline"
                onPress={handleCreateEvent}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                My Events
              </Text>

              {events.length === 0 ? (
                <Text style={styles.emptyText}>
                  No events created yet.
                </Text>
              ) : (
                events.map((event) => {
                  const summary = summaries.find(
                    (item) =>
                      item.eventId === event.event_id
                  );

                  return (
                    <View
                      key={event.event_id}
                      style={styles.eventCard}
                    >
                      <Text style={styles.eventTitle}>
                        {event.title}
                      </Text>

                      <Text style={styles.eventInfo}>
                        Event ID: {event.event_id}
                      </Text>

                      <Text style={styles.eventInfo}>
                        Start: {formatDate(event.start_time)}
                      </Text>

                      <Text style={styles.eventInfo}>
                        End: {formatDate(event.end_time)}
                      </Text>

                      <Text style={styles.attendeeCount}>
                        Attendees:{' '}
                        {summary?.attendeeCount ?? 0}
                      </Text>

                      <AppButton
                        title="Show QR Data"
                        icon="qr-code-outline"
                        onPress={() =>
                          showQRPayload(event)
                        }
                      />
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Attendance
              </Text>

              {attendance.length === 0 ? (
                <Text style={styles.emptyText}>
                  No students have scanned attendance yet.
                </Text>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const records = attendance.filter(
            (record) =>
              record.eventId === item.event_id
          );

          if (records.length === 0) {
            return null;
          }

          return (
            <View style={styles.attendanceCard}>
              <Text style={styles.eventTitle}>
                {item.title}
              </Text>

              {records.map((record) => (
                <View
                  key={record.id}
                  style={styles.attendanceRow}
                >
                  <Text style={styles.studentName}>
                    {record.studentName}
                  </Text>

                  {record.studentNumber ? (
                    <Text style={styles.studentNumber}>
                      Student ID: {record.studentNumber}
                    </Text>
                  ) : null}

                  <Text style={styles.eventInfo}>
                    Scanned: {formatDate(record.scannedAt)}
                  </Text>
                </View>
              ))}
            </View>
          );
        }}
      />
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

  list: {
    paddingBottom: 30,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },

  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 14,
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    color: COLORS.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },

  eventCard: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 14,
    marginTop: 14,
  },

  eventTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 7,
  },

  eventInfo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },

  attendeeCount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 6,
    marginBottom: 12,
  },

  emptyText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },

  attendanceCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },

  attendanceRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    marginTop: 12,
  },

  studentName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },

  studentNumber: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
});