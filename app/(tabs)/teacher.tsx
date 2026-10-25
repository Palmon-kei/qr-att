
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  TextInput,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';

import {
  createEvent,
  cancelEvent,
  deleteEvent,
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
import { useUserRole } from '@/lib/useUserRole';
import { COLORS } from '@/constants/colors';

const C = {
  purple: COLORS.primary,
  darkPurple: COLORS.primaryDeep,
  lightPurple: COLORS.primaryLight,
  background: COLORS.background,
  white: COLORS.white,
  text: COLORS.textPrimary,
  muted: COLORS.textSecondary,
  border: COLORS.border,
  green: COLORS.success,
  red: COLORS.danger,
};

type PickerField = 'start' | 'end';
type PickerMode = 'date' | 'time';
type AttendanceDateFilter = 'all' | 'today' | '7days' | '30days';

type PickerSelection = {
  field: PickerField;
  mode: PickerMode;
};

function formatDate(date: Date) {
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatDate(date)} • ${formatTime(date)}`;
}

// Quote every CSV field and guard against spreadsheet formula injection.
// Student names and IDs may come from user-entered profile data.
function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
  return `\"${safe.replace(/"/g, '""')}\"`;
}

function makeAttendanceCsv(records: TeacherAttendanceRecord[]): string {
  const header = [
    'Event ID',
    'Event Title',
    'Student Name',
    'Student ID',
    'Scanned At (Local)',
    'Scanned At (ISO)',
  ];

  const rows = records.map((record) => [
    record.eventId,
    record.eventTitle,
    record.studentName,
    record.studentNumber ?? '',
    formatDateTime(record.scannedAt),
    record.scannedAt,
  ]);

  // UTF-8 BOM improves compatibility with Excel for non-ASCII names.
  return '\uFEFF' + [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

// Phase 3: Read-only analytics from the same role-scoped attendance data
// already loaded for the teacher. No additional database permissions required.
type DailyScanPoint = { key: string; label: string; scans: number };

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildSevenDayScanTrend(
  records: TeacherAttendanceRecord[],
  now: Date
): DailyScanPoint[] {
  const days: DailyScanPoint[] = [];
  const byDay = new Map<string, DailyScanPoint>();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const point: DailyScanPoint = {
      key: localDayKey(date),
      label: date.toLocaleDateString('en-PH', { weekday: 'short' }),
      scans: 0,
    };
    days.push(point);
    byDay.set(point.key, point);
  }

  for (const record of records) {
    const date = new Date(record.scannedAt);
    if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime()) continue;
    const point = byDay.get(localDayKey(date));
    if (point) point.scans += 1;
  }

  return days;
}

export default function TeacherScreen() {
  const { user, authLoading, roleLoading, isTeacher, isAdmin } =
    useUserRole();

  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');

  const [start, setStart] = useState(
    () => new Date()
  );

  const [end, setEnd] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );

  const [iosPicker, setIosPicker] =
    useState<PickerSelection | null>(null);

  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [summaries, setSummaries] = useState<
    TeacherEventSummary[]
  >([]);
  const [attendance, setAttendance] = useState<
    TeacherAttendanceRecord[]
  >([]);
  const eventsListRef = useRef<FlatList<CloudEvent>>(null);
  const attendanceListRef = useRef<FlatList<TeacherAttendanceRecord>>(null);

  // Scroll the FlatList to the form or search area when an input is focused.
  // FlatList.scrollToOffset is supported by React Native's TypeScript types.
  const scrollToInput = (
    list: React.RefObject<FlatList<any> | null>,
    offset: number
  ) => {
    list.current?.scrollToOffset({ offset, animated: true });
  };

  const [exportingCsv, setExportingCsv] = useState(false);

  const [studentSearch, setStudentSearch] = useState('');
  const [attendanceDateFilter, setAttendanceDateFilter] =
    useState<AttendanceDateFilter>('all');

  const [selectedEventId, setSelectedEventId] =
    useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] =
    useState(false);

  // The teacher opens attendance for one event at a time.
  const [viewingEventId, setViewingEventId] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingEventId, setDeletingEventId] =
    useState<string | null>(null);
  const [cancellingEventId, setCancellingEventId] =
    useState<string | null>(null);

  const [createError, setCreateError] =
    useState<string | null>(null);

  const [loadError, setLoadError] =
    useState<string | null>(null);

  const loadTeacherData = useCallback(
    async (showLoader = true) => {
      if (!user?.id || (!isTeacher && !isAdmin)) {
        setEvents([]);
        setSummaries([]);
        setAttendance([]);
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      setLoadError(null);

      try {
        const [
          teacherEvents,
          teacherSummaries,
          teacherAttendance,
        ] = await Promise.all([
          getEventsByTeacher(user.id),
          getTeacherEventSummary(user.id),
          getTeacherEventAttendance(user.id),
        ]);

        setEvents(teacherEvents);
        setSummaries(teacherSummaries);
        setAttendance(teacherAttendance);
      } catch (error: any) {
        console.error('Load teacher data failed:', error);

        setLoadError(
          error?.message ||
            'Unable to load teacher data.'
        );
      } finally {
        setLoading(false);
      }
    },
    [user?.id, isTeacher, isAdmin]
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !roleLoading) {
        loadTeacherData();
      }
    }, [authLoading, roleLoading, loadTeacherData])
  );

  const handleExportCsv = async (
    event: CloudEvent,
    records: TeacherAttendanceRecord[]
  ) => {
    if (exportingCsv) return;

    if (records.length === 0) {
      Alert.alert('Nothing to export', 'No attendance records match the current filters.');
      return;
    }

    setExportingCsv(true);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Sharing unavailable', 'This device cannot open the file sharing menu.');
        return;
      }

      const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!directory) {
        throw new Error('Unable to access the app file directory.');
      }

      const safeId = event.event_id
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 50) || 'event';
      const fileUri = `${directory}QRR-KOP-Attendance-${safeId}-${Date.now()}.csv`;

      await FileSystem.writeAsStringAsync(
        fileUri,
        makeAttendanceCsv(records),
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: `Export attendance - ${event.title}`,
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error: any) {
      console.error('Attendance CSV export failed:', error);
      Alert.alert(
        'Export failed',
        error?.message || 'Unable to export attendance. Please try again.'
      );
    } finally {
      setExportingCsv(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await loadTeacherData(false);
    } finally {
      setRefreshing(false);
    }
  };

  const applyPickerValue = (
    field: PickerField,
    mode: PickerMode,
    selectedDate: Date
  ) => {
    const setter = field === 'start'
      ? setStart
      : setEnd;

    setter((previous) => {
      const updated = new Date(previous);

      if (mode === 'date') {
        updated.setFullYear(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate()
        );
      } else {
        updated.setHours(
          selectedDate.getHours(),
          selectedDate.getMinutes(),
          0,
          0
        );
      }

      return updated;
    });

    setCreateError(null);
  };

  const openPicker = (
    field: PickerField,
    mode: PickerMode
  ) => {
    const currentValue =
      field === 'start' ? start : end;

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentValue,
        mode,
        is24Hour: false,
        onValueChange: (_event, selectedDate) => {
          if (selectedDate) {
            applyPickerValue(field, mode, selectedDate);
          }
        },
      });
    } else {
      setIosPicker({ field, mode });
    }
  };

  const handleCreateEvent = async () => {
    if (creating) return;

    setCreateError(null);

    if (!isTeacher && !isAdmin) {
      setCreateError(
        'Teacher or administrator access is required.'
      );
      return;
    }

    if (!user?.id) {
      setCreateError(
        'You must be signed in.'
      );
      return;
    }

    if (!eventId.trim()) {
      setCreateError(
        'Please enter an Event ID.'
      );
      return;
    }

    if (!title.trim()) {
      setCreateError(
        'Please enter an Event Title.'
      );
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setCreateError(
        'End date and time must be later than the start.'
      );
      return;
    }

    setCreating(true);

    try {
      await createEvent({
        eventId: eventId.trim(),
        title: title.trim(),
        start: start.toISOString(),
        end: end.toISOString(),
      });

      setTitle('');
      setEventId('');

      const newStart = new Date();

      setStart(newStart);
      setEnd(
        new Date(
          newStart.getTime() + 60 * 60 * 1000
        )
      );

      setCreateError(null);
      setShowCreateForm(false);

      await loadTeacherData(false);
    } catch (error: any) {
      console.error(
        'Create event failed:',
        error
      );

      setCreateError(
        error?.message ||
          'Failed to create event.'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCancelEvent = async (event: CloudEvent) => {
    if (!user?.id || (!isTeacher && !isAdmin) ||
        cancellingEventId || deletingEventId) return;

    setCancellingEventId(event.event_id);

    try {
      await cancelEvent(event.event_id);

      // Preserve the event and all of its attendance records.
      setEvents((current) =>
        current.map((item) =>
          item.event_id === event.event_id
            ? { ...item, status: 'cancelled' }
            : item
        )
      );
      setSelectedEventId((current) =>
        current === event.event_id ? null : current
      );

      await loadTeacherData(false);
      Alert.alert(
        'Event cancelled',
        'New attendance scans are blocked. Existing attendance records are preserved.'
      );
    } catch (error: any) {
      console.error('Cancel event failed:', error);
      Alert.alert(
        'Could not cancel event',
        error?.message || 'Please try again.'
      );
    } finally {
      setCancellingEventId(null);
    }
  };

  const confirmCancelEvent = (event: CloudEvent) => {
    if (event.status === 'cancelled' ||
        cancellingEventId || deletingEventId) return;

    Alert.alert(
      'Cancel this event?',
      `Cancel "${event.title}"? Students will no longer be able to register attendance, but all existing attendance records will be kept.`,
      [
        { text: 'Keep Event', style: 'cancel' },
        {
          text: 'Cancel Event',
          style: 'destructive',
          onPress: () => { void handleCancelEvent(event); },
        },
      ]
    );
  };

  const handleDeleteEvent = async (event: CloudEvent) => {
    if (!user?.id || (!isTeacher && !isAdmin) || deletingEventId || cancellingEventId) return;

    setDeletingEventId(event.event_id);

    try {
      await deleteEvent(event.event_id);

      // Update the UI immediately after the database confirms deletion.
      setEvents((current) =>
        current.filter((item) => item.event_id !== event.event_id)
      );
      setSummaries((current) =>
        current.filter((item) => item.eventId !== event.event_id)
      );
      setAttendance((current) =>
        current.filter((item) => item.eventId !== event.event_id)
      );
      setSelectedEventId((current) =>
        current === event.event_id ? null : current
      );
      setViewingEventId((current) =>
        current === event.event_id ? null : current
      );

      await loadTeacherData(false);
    } catch (error: any) {
      console.error('Delete event failed:', error);
      Alert.alert(
        'Could not delete event',
        error?.message || 'Please try again.'
      );
    } finally {
      setDeletingEventId(null);
    }
  };

  const confirmDeleteEvent = (event: CloudEvent) => {
    if (!user?.id || (!isTeacher && !isAdmin) || deletingEventId || cancellingEventId) return;

    const attendeeCount = attendance.filter(
      (record) => record.eventId === event.event_id
    ).length;

    const countMessage =
      attendeeCount > 0
        ? `There are currently ${attendeeCount} attendance record(s) shown for this event. `
        : '';

    Alert.alert(
      'Delete this event?',
      `"${event.title}" will be permanently deleted. ` +
        countMessage +
        'All attendance records linked to this event will also be permanently deleted from student history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Event',
          style: 'destructive',
          onPress: () => {
            void handleDeleteEvent(event);
          },
        },
      ]
    );
  };

  const getEventStatus = (event: CloudEvent) => {
    if (event.status === 'cancelled') {
      return {
        label: 'Cancelled',
        color: C.red,
        background: '#FFF0F0',
      };
    }

    const now = Date.now();
    const startTime = new Date(
      event.start_time
    ).getTime();
    const endTime = new Date(
      event.end_time
    ).getTime();

    if (now < startTime) {
      return {
        label: 'Upcoming',
        color: '#A76A15',
        background: '#FFF3DC',
      };
    }

    if (now > endTime) {
      return {
        label: 'Ended',
        color: '#687386',
        background: '#EDF0F5',
      };
    }

    return {
      label: 'Active',
      color: C.green,
      background: '#E3F7EC',
    };
  };

  const activeEvents = events.filter(
    (event) => {
      const now = Date.now();

      return (
        event.status !== 'cancelled' &&
        now >=
          new Date(event.start_time).getTime() &&
        now <=
          new Date(event.end_time).getTime()
      );
    }
  ).length;

  // All-time overview metrics; the trend below is restricted to the last 7
  // local calendar days. These are scan counts, not attendance percentages.
  const uniqueStudentCount = new Set(
    attendance.map((record) => record.studentId).filter(Boolean)
  ).size;
  const averageScansPerEvent = events.length > 0
    ? (attendance.length / events.length).toFixed(1)
    : '0.0';
  const dailyScanTrend = buildSevenDayScanTrend(attendance, new Date());
  const maxDailyScans = Math.max(1, ...dailyScanTrend.map((day) => day.scans));
  const eventStatusBreakdown = [
    { label: 'Upcoming', color: '#B7791F' },
    { label: 'Active', color: C.green },
    { label: 'Ended', color: '#687386' },
    { label: 'Cancelled', color: C.red },
  ].map((item) => ({
    ...item,
    count: events.filter((event) => getEventStatus(event).label === item.label).length,
  }));
  const maxStatusCount = Math.max(1, ...eventStatusBreakdown.map((item) => item.count));

  if (authLoading || roleLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={C.purple}
        />
        <Text style={styles.muted}>
          Loading event management...
        </Text>
      </View>
    );
  }

  if (!isTeacher && !isAdmin) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="lock-closed-outline"
          size={42}
          color={C.purple}
        />

        <Text style={styles.accessTitle}>
          Staff Access Only
        </Text>

        <Text style={styles.muted}>
          Only teacher and administrator accounts can manage events.
        </Text>
      </View>
    );
  }

  // Show an event-specific attendance page instead of a mixed list.
  if (viewingEventId) {
    const currentEvent = events.find(
      (item) => item.event_id === viewingEventId
    );

    if (currentEvent) {
      const allEventRecords = attendance.filter(
        (record) => record.eventId === viewingEventId
      );
      const normalizedSearch = studentSearch.trim().toLocaleLowerCase();
      const now = new Date();
      const todayStart = new Date(
        now.getFullYear(), now.getMonth(), now.getDate()
      ).getTime();
      const dateStart = attendanceDateFilter === 'today'
        ? todayStart
        : attendanceDateFilter === '7days'
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime()
          : attendanceDateFilter === '30days'
            ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).getTime()
            : Number.NEGATIVE_INFINITY;

      const records = allEventRecords
        .filter((record) => {
          const matchesSearch = !normalizedSearch ||
            record.studentName.toLocaleLowerCase().includes(normalizedSearch) ||
            (record.studentNumber ?? '').toLocaleLowerCase().includes(normalizedSearch);
          const scanTime = new Date(record.scannedAt).getTime();
          const matchesDate = Number.isFinite(scanTime) &&
            scanTime >= dateStart && scanTime <= now.getTime();
          return matchesSearch && matchesDate;
        })
        .sort(
          (a, b) =>
            new Date(b.scannedAt).getTime() -
            new Date(a.scannedAt).getTime()
        );

      const status = getEventStatus(currentEvent);

      return (
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={attendanceListRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            data={records}
            keyExtractor={(record) => String(record.id)}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            ListHeaderComponent={
              <View>
                <Pressable
                  style={styles.backButton}
                  onPress={() => {
                    setViewingEventId(null);
                    setSelectedEventId(null);
                  }}
                >
                  <Ionicons
                    name="arrow-back"
                    size={21}
                    color={C.purple}
                  />
                  <Text style={styles.backText}>My Events</Text>
                </Pressable>

                <View style={styles.detailCard}>
                  <View style={styles.detailTopRow}>
                    <View style={styles.eventIcon}>
                      <Ionicons
                        name="book-outline"
                        size={23}
                        color={C.purple}
                      />
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: status.background },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: status.color },
                        ]}
                      >
                        {status.label}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.detailTitle}>
                    {currentEvent.title}
                  </Text>
                  <Text style={styles.eventId}>
                    {currentEvent.event_id}
                  </Text>
                  <Text style={styles.eventDate}>
                    Start: {formatDateTime(currentEvent.start_time)}
                  </Text>
                  <Text style={styles.eventDate}>
                    End: {formatDateTime(currentEvent.end_time)}
                  </Text>

                  {currentEvent.status !== 'cancelled' ? (
                  <Pressable
                    style={styles.detailQrButton}
                    onPress={() =>
                      setSelectedEventId(
                        selectedEventId === viewingEventId
                          ? null
                          : viewingEventId
                      )
                    }
                  >
                    <Ionicons
                      name="qr-code-outline"
                      size={19}
                      color={C.purple}
                    />
                    <Text style={styles.detailQrText}>
                      {selectedEventId === viewingEventId
                        ? 'Hide QR Code'
                        : 'Show QR Code'}
                    </Text>
                    <Ionicons
                      name={
                        selectedEventId === viewingEventId
                          ? 'chevron-up'
                          : 'chevron-down'
                      }
                      size={17}
                      color={C.purple}
                    />
                  </Pressable>
                  ) : null}

                  {currentEvent.status !== 'cancelled' && selectedEventId === viewingEventId ? (
                    <View style={styles.qrSection}>
                      <Text style={styles.qrSubtitle}>
                        Students can scan this code using QRR KOP.
                      </Text>
                      <View style={styles.qrBox}>
                        <QRCode
                          value={buildQRPayload({
                            eventId: currentEvent.event_id,
                            title: currentEvent.title,
                            start: currentEvent.start_time,
                            end: currentEvent.end_time,
                          })}
                          size={220}
                          backgroundColor="white"
                        />
                      </View>
                    </View>
                  ) : null}

                  {currentEvent.status !== 'cancelled' ? (
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => confirmCancelEvent(currentEvent)}
                      disabled={cancellingEventId !== null || deletingEventId !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel ${currentEvent.title}`}
                    >
                      {cancellingEventId === currentEvent.event_id ? (
                        <ActivityIndicator size="small" color={C.red} />
                      ) : (
                        <Ionicons name="close-circle-outline" size={18} color={C.red} />
                      )}
                      <Text style={styles.cancelButtonText}>
                        {cancellingEventId === currentEvent.event_id
                          ? 'Cancelling...'
                          : 'Cancel Event (Keep Attendance)'}
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => confirmDeleteEvent(currentEvent)}
                    disabled={deletingEventId !== null || cancellingEventId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${currentEvent.title}`}
                  >
                    {deletingEventId === currentEvent.event_id ? (
                      <ActivityIndicator size="small" color={C.red} />
                    ) : (
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={C.red}
                      />
                    )}
                    <Text style={styles.deleteButtonText}>
                      {deletingEventId === currentEvent.event_id
                        ? 'Deleting...'
                        : 'Delete Event'}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.attendanceHeading}>
                  <View>
                    <Text style={styles.sectionTitle}>
                      Students Attended
                    </Text>
                    <Text style={styles.attendanceSubtitle}>
                      {records.length} shown of {allEventRecords.length} attendance records
                    </Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>
                      {records.length}
                    </Text>
                  </View>
                </View>

                <View style={styles.reportSearchRow}>
                  <Ionicons name="search-outline" size={19} color={C.muted} />
                  <TextInput
                    style={styles.reportSearchInput}
                    value={studentSearch}
                    onChangeText={setStudentSearch}
                    onFocus={() => scrollToInput(attendanceListRef, 120)}
                    placeholder="Search student name or ID"
                    placeholderTextColor="#9994AC"
                    autoCapitalize="none"
                    accessibilityLabel="Search attendance by student name or ID"
                  />
                  {studentSearch.length > 0 ? (
                    <Pressable
                      onPress={() => setStudentSearch('')}
                      accessibilityLabel="Clear student search"
                    >
                      <Ionicons name="close-circle" size={20} color={C.muted} />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.reportFilters}>
                  {([
                    ['all', 'All dates'],
                    ['today', 'Today'],
                    ['7days', 'Last 7 days'],
                    ['30days', 'Last 30 days'],
                  ] as const).map(([value, label]) => (
                    <Pressable
                      key={value}
                      onPress={() => setAttendanceDateFilter(value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: attendanceDateFilter === value }}
                      style={[
                        styles.reportFilterChip,
                        attendanceDateFilter === value && styles.reportFilterChipActive,
                      ]}
                    >
                      <Text style={[
                        styles.reportFilterText,
                        attendanceDateFilter === value && styles.reportFilterTextActive,
                      ]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  style={[
                    styles.exportCsvButton,
                    (exportingCsv || records.length === 0 || !!loadError) &&
                      styles.exportCsvButtonDisabled,
                  ]}
                  onPress={() => { void handleExportCsv(currentEvent, records); }}
                  disabled={exportingCsv || records.length === 0 || !!loadError}
                  accessibilityRole="button"
                  accessibilityLabel={`Export ${records.length} filtered attendance records as CSV`}
                >
                  {exportingCsv ? (
                    <ActivityIndicator size="small" color={C.white} />
                  ) : (
                    <Ionicons name="download-outline" size={18} color={C.white} />
                  )}
                  <Text style={styles.exportCsvButtonText}>
                    {exportingCsv
                      ? 'Preparing CSV...'
                      : `Export CSV (${records.length})`}
                  </Text>
                </Pressable>
                <Text style={styles.exportCsvHint}>
                  Exports only the attendance records matching the search and date filters.
                </Text>

                {loadError ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>
                      {loadError}
                    </Text>
                    <Pressable onPress={handleRefresh}>
                      <Text style={styles.retryText}>Try Again</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Ionicons
                  name="people-outline"
                  size={35}
                  color={C.purple}
                />
                <Text style={styles.emptyText}>
                  {allEventRecords.length === 0
                    ? 'No students have scanned this event yet.'
                    : 'No attendance records match your search or date filter.'}
                </Text>
              </View>
            }
            renderItem={({ item: record }) => (
              <View style={styles.detailStudentCard}>
                <View style={styles.studentAvatar}>
                  <Ionicons
                    name="person-outline"
                    size={19}
                    color={C.purple}
                  />
                </View>
                <View style={styles.studentDetails}>
                  <Text style={styles.studentName}>
                    {record.studentName}
                  </Text>
                  {record.studentNumber ? (
                    <Text style={styles.studentMeta}>
                      Student ID: {record.studentNumber}
                    </Text>
                  ) : null}
                  <Text style={styles.studentMeta}>
                    Scanned: {formatDateTime(record.scannedAt)}
                  </Text>
                </View>
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={C.green}
                />
              </View>
            )}
            ListFooterComponent={
              <Text style={styles.footer}>
                QRR KOP • {isAdmin ? 'Admin' : 'Teacher'} Portal
              </Text>
            }
          />
        </KeyboardAvoidingView>
      );
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <FlatList
        ref={eventsListRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={events}
        keyExtractor={(item) => String(item.event_id)}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <View style={styles.heroDecoration} />

              <View style={styles.heroTopRow}>
                <View style={styles.heroIcon}>
                  <Ionicons
                    name="school-outline"
                    size={27}
                    color={C.white}
                  />
                </View>

                <View style={styles.heroBadge}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={14}
                    color={C.white}
                  />
                  <Text style={styles.heroBadgeText}>
                    {isAdmin ? 'ADMIN' : 'TEACHER'}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroEyebrow}>
                QRR KOP WORKSPACE
              </Text>

              <Text style={styles.heroTitle}>
                {isAdmin
                  ? 'Event Management'
                  : 'Teacher Dashboard'}
              </Text>

              <Text style={styles.heroDescription}>
                Create attendance events, generate QR codes,
                and track student participation.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>
              Overview
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons
                  name="calendar-outline"
                  size={24}
                  color={C.purple}
                />

                <Text style={styles.statNumber}>
                  {events.length}
                </Text>

                <Text style={styles.statLabel}>
                  Total Events
                </Text>
              </View>

              <View style={styles.statCard}>
                <Ionicons
                  name="radio-button-on-outline"
                  size={24}
                  color={C.green}
                />

                <Text style={styles.statNumber}>
                  {activeEvents}
                </Text>

                <Text style={styles.statLabel}>
                  Active Events
                </Text>
              </View>

              <View style={styles.statCard}>
                <Ionicons
                  name="people-outline"
                  size={24}
                  color="#2676C7"
                />

                <Text style={styles.statNumber}>
                  {attendance.length}
                </Text>

                <Text style={styles.statLabel}>
                  Total Scans
                </Text>
              </View>
            </View>

            {!loadError ? (
              <View style={styles.analyticsPanel}>
                <View style={styles.analyticsHeadingRow}>
                  <Ionicons name="stats-chart-outline" size={21} color={C.purple} />
                  <Text style={styles.analyticsTitle}>Attendance Analytics</Text>
                </View>
                <Text style={styles.analyticsDescription}>
                  Your events only • Based on recorded QR scans
                </Text>

                <View style={styles.analyticsMetricRow}>
                  <View style={styles.analyticsMetricCard}>
                    <Text style={styles.analyticsMetricNumber}>{uniqueStudentCount}</Text>
                    <Text style={styles.analyticsMetricLabel}>Unique students</Text>
                  </View>
                  <View style={styles.analyticsMetricCard}>
                    <Text style={styles.analyticsMetricNumber}>{averageScansPerEvent}</Text>
                    <Text style={styles.analyticsMetricLabel}>Avg. scans / event</Text>
                  </View>
                </View>

                <Text style={styles.analyticsChartTitle}>Scans in the last 7 days</Text>
                <View style={styles.analyticsTrendChart}>
                  {dailyScanTrend.map((day) => (
                    <View
                      key={day.key}
                      style={styles.analyticsTrendColumn}
                      accessibilityLabel={`${day.key}: ${day.scans} scans`}
                    >
                      <Text style={styles.analyticsTrendCount}>{day.scans}</Text>
                      <View style={styles.analyticsTrendTrack}>
                        <View
                          style={[
                            styles.analyticsTrendBar,
                            {
                              height: day.scans === 0
                                ? 0
                                : Math.max(8, Math.round(104 * day.scans / maxDailyScans)),
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.analyticsDayLabel}>{day.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.analyticsNote}>
                  Daily counts use your phone's local calendar dates.
                </Text>

                <Text style={styles.analyticsChartTitle}>Events by status</Text>
                {eventStatusBreakdown.map((item) => (
                  <View key={item.label} style={styles.analyticsStatusRow}>
                    <Text style={styles.analyticsStatusLabel}>{item.label}</Text>
                    <View style={styles.analyticsStatusTrack}>
                      <View
                        style={[
                          styles.analyticsStatusBar,
                          {
                            backgroundColor: item.color,
                            width: `${Math.round(100 * item.count / maxStatusCount)}%` as `${number}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.analyticsStatusCount}>{item.count}</Text>
                  </View>
                ))}
                <Text style={styles.analyticsNote}>
                  Cancelled events still contribute their previously recorded scans.
                  A true attendance rate requires an expected student count per event.
                </Text>
              </View>
            ) : null}

            {loadError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {loadError}
                </Text>

                <Pressable onPress={handleRefresh}>
                  <Text style={styles.retryText}>
                    Try Again
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              style={styles.createToggle}
              onPress={() =>
                setShowCreateForm(!showCreateForm)
              }
            >
              <View style={styles.toggleLeft}>
                <Ionicons
                  name="add-circle-outline"
                  size={25}
                  color={C.white}
                />

                <Text style={styles.toggleText}>
                  Create New Event
                </Text>
              </View>

              <Ionicons
                name={
                  showCreateForm
                    ? 'chevron-up'
                    : 'chevron-down'
                }
                size={21}
                color={C.white}
              />
            </Pressable>

            {showCreateForm ? (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>
                  Event Details
                </Text>

                <Text style={styles.formDescription}>
                  Choose your event date and time
                  using the calendar and clock.
                </Text>

                <Text style={styles.label}>
                  Event ID
                </Text>

                <EventInput
                  value={eventId}
                  onChangeText={setEventId}
                  onFocus={() => scrollToInput(eventsListRef, 280)}
                  placeholder="Example: EVENT-001"
                />

                <Text style={styles.label}>
                  Event Title
                </Text>

                <EventInput
                  value={title}
                  onChangeText={setTitle}
                  onFocus={() => scrollToInput(eventsListRef, 330)}
                  placeholder="Example: Database Laboratory"
                />

                <Text style={styles.dateSection}>
                  Start Schedule
                </Text>

                <View style={styles.pickerRow}>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerLabel}>
                      Start Date
                    </Text>

                    <Pressable
                      style={styles.pickerButton}
                      onPress={() =>
                        openPicker('start', 'date')
                      }
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={19}
                        color={C.purple}
                      />

                      <Text style={styles.pickerText}>
                        {formatDate(start)}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerLabel}>
                      Start Time
                    </Text>

                    <Pressable
                      style={styles.pickerButton}
                      onPress={() =>
                        openPicker('start', 'time')
                      }
                    >
                      <Ionicons
                        name="time-outline"
                        size={19}
                        color={C.purple}
                      />

                      <Text style={styles.pickerText}>
                        {formatTime(start)}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.dateSection}>
                  End Schedule
                </Text>

                <View style={styles.pickerRow}>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerLabel}>
                      End Date
                    </Text>

                    <Pressable
                      style={styles.pickerButton}
                      onPress={() =>
                        openPicker('end', 'date')
                      }
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={19}
                        color={C.purple}
                      />

                      <Text style={styles.pickerText}>
                        {formatDate(end)}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerLabel}>
                      End Time
                    </Text>

                    <Pressable
                      style={styles.pickerButton}
                      onPress={() =>
                        openPicker('end', 'time')
                      }
                    >
                      <Ionicons
                        name="time-outline"
                        size={19}
                        color={C.purple}
                      />

                      <Text style={styles.pickerText}>
                        {formatTime(end)}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {Platform.OS === 'ios' &&
                iosPicker ? (
                  <View style={styles.iosPickerBox}>
                    <DateTimePicker
                      value={
                        iosPicker.field === 'start'
                          ? start
                          : end
                      }
                      mode={iosPicker.mode}
                      display="spinner"
                      onValueChange={(_, selectedDate) => {
                        if (selectedDate) {
                          applyPickerValue(
                            iosPicker.field,
                            iosPicker.mode,
                            selectedDate
                          );
                        }
                      }}
                    />

                    <Pressable
                      style={styles.iosDoneButton}
                      onPress={() =>
                        setIosPicker(null)
                      }
                    >
                      <Text style={styles.iosDoneText}>
                        Done
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.scheduleInfo}>
                  <Ionicons
                    name="information-circle-outline"
                    size={19}
                    color={C.purple}
                  />

                  <Text style={styles.scheduleInfoText}>
                    Students can scan the QR code
                    only between the selected
                    start and end times.
                  </Text>
                </View>

                {createError ? (
                  <Text style={styles.errorText}>
                    {createError}
                  </Text>
                ) : null}

                <Pressable
                  disabled={creating}
                  style={[
                    styles.submitButton,
                    creating && styles.disabled,
                  ]}
                  onPress={handleCreateEvent}
                >
                  {creating ? (
                    <ActivityIndicator
                      color={C.white}
                    />
                  ) : (
                    <Ionicons
                      name="add-circle-outline"
                      size={22}
                      color={C.white}
                    />
                  )}

                  <Text style={styles.submitText}>
                    {creating
                      ? 'Creating Event...'
                      : 'Create Event'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                My Events
              </Text>

              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {events.length}
                </Text>
              </View>
            </View>

            {events.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  name="calendar-outline"
                  size={34}
                  color={C.purple}
                />

                <Text style={styles.emptyText}>
                  No events created yet.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const summary = summaries.find(
            (entry) =>
              entry.eventId === item.event_id
          );

          const status = getEventStatus(item);

          const qrPayload = buildQRPayload({
            eventId: item.event_id,
            title: item.title,
            start: item.start_time,
            end: item.end_time,
          });

          const isSelected =
            selectedEventId === item.event_id;

          return (
            <View style={styles.eventCard}>
              <View style={styles.eventTop}>
                <View style={styles.eventIcon}>
                  <Ionicons
                    name="book-outline"
                    size={23}
                    color={C.purple}
                  />
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        status.background,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: status.color },
                    ]}
                  >
                    {status.label}
                  </Text>
                </View>
              </View>

              <Text style={styles.eventTitle}>
                {item.title}
              </Text>

              <Text style={styles.eventId}>
                {item.event_id}
              </Text>

              <Text style={styles.eventDate}>
                <Ionicons
                  name="time-outline"
                  size={15}
                  color={C.muted}
                />
                {'  '}Start:{' '}
                {formatDateTime(item.start_time)}
              </Text>

              <Text style={styles.eventDate}>
                <Ionicons
                  name="flag-outline"
                  size={15}
                  color={C.muted}
                />
                {'  '}End:{' '}
                {formatDateTime(item.end_time)}
              </Text>

              <View style={styles.eventFooter}>
                <View style={styles.attendeeInfo}>
                  <Ionicons
                    name="people-outline"
                    size={19}
                    color={C.purple}
                  />

                  <Text style={styles.attendeeText}>
                    {summary?.attendeeCount ?? 0}
                    {' '}Attendees
                  </Text>
                </View>

                {item.status !== 'cancelled' ? (
                <Pressable
                  style={styles.qrButton}
                  onPress={() =>
                    setSelectedEventId(
                      isSelected
                        ? null
                        : item.event_id
                    )
                  }
                >
                  <Ionicons
                    name="qr-code-outline"
                    size={18}
                    color={C.white}
                  />

                  <Text style={styles.qrButtonText}>
                    {isSelected
                      ? 'Hide QR'
                      : 'Show QR'}
                  </Text>
                </Pressable>
                ) : null}
              </View>

              <Pressable
                style={styles.viewStudentsButton}
                onPress={() => {
                  setSelectedEventId(null);
                  setViewingEventId(item.event_id);
                }}
              >
                <Ionicons
                  name="people-outline"
                  size={19}
                  color={C.white}
                />
                <Text style={styles.viewStudentsText}>
                  View Students
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={C.white}
                />
              </Pressable>

              {item.status !== 'cancelled' ? (
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => confirmCancelEvent(item)}
                  disabled={cancellingEventId !== null || deletingEventId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel ${item.title}`}
                >
                  {cancellingEventId === item.event_id ? (
                    <ActivityIndicator size="small" color={C.red} />
                  ) : (
                    <Ionicons name="close-circle-outline" size={18} color={C.red} />
                  )}
                  <Text style={styles.cancelButtonText}>
                    {cancellingEventId === item.event_id
                      ? 'Cancelling...'
                      : 'Cancel Event (Keep Attendance)'}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                style={styles.deleteButton}
                onPress={() => confirmDeleteEvent(item)}
                disabled={deletingEventId !== null || cancellingEventId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title}`}
              >
                {deletingEventId === item.event_id ? (
                  <ActivityIndicator size="small" color={C.red} />
                ) : (
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={C.red}
                  />
                )}
                <Text style={styles.deleteButtonText}>
                  {deletingEventId === item.event_id
                    ? 'Deleting...'
                    : 'Delete Event'}
                </Text>
              </Pressable>

              {isSelected && item.status !== 'cancelled' ? (
                <View style={styles.qrSection}>
                  <Text style={styles.qrTitle}>
                    Attendance QR Code
                  </Text>

                  <Text style={styles.qrSubtitle}>
                    Students can scan this code
                    using QRR KOP.
                  </Text>

                  <View style={styles.qrBox}>
                    <QRCode
                      value={qrPayload}
                      size={220}
                      backgroundColor="white"
                    />
                  </View>

                  <Text style={styles.qrEventId}>
                    {item.event_id}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        }}
        ListFooterComponent={
          <Text style={styles.footer}>
            QRR KOP • {isAdmin ? 'Admin' : 'Teacher'} Portal
          </Text>
        }
      />
    </KeyboardAvoidingView>
  );
}

type EventInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onFocus?: () => void;
};

function EventInput({
  value,
  onChangeText,
  placeholder,
  onFocus,
}: EventInputProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      placeholder={placeholder}
      placeholderTextColor="#9994AC"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  analyticsPanel: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 24,
  },
  analyticsHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  analyticsTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
  },
  analyticsDescription: {
    color: C.muted,
    fontSize: 12,
    marginTop: 7,
    marginBottom: 15,
  },
  analyticsMetricRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 19,
  },
  analyticsMetricCard: {
    flex: 1,
    backgroundColor: C.lightPurple,
    borderRadius: 13,
    padding: 14,
  },
  analyticsMetricNumber: {
    color: C.darkPurple,
    fontSize: 23,
    fontWeight: '800',
  },
  analyticsMetricLabel: {
    color: C.darkPurple,
    fontSize: 11,
    marginTop: 5,
  },
  analyticsChartTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  analyticsTrendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    marginBottom: 7,
  },
  analyticsTrendColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  analyticsTrendCount: {
    color: C.muted,
    fontSize: 10,
    marginBottom: 5,
  },
  analyticsTrendTrack: {
    height: 104,
    width: '75%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#F6F4FC',
    borderRadius: 7,
    overflow: 'hidden',
  },
  analyticsTrendBar: {
    width: '100%',
    backgroundColor: C.purple,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  analyticsDayLabel: {
    color: C.muted,
    fontSize: 10,
    marginTop: 7,
  },
  analyticsNote: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 18,
  },
  analyticsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  analyticsStatusLabel: {
    color: C.text,
    fontSize: 11,
    width: 67,
  },
  analyticsStatusTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F0EDF7',
    overflow: 'hidden',
  },
  analyticsStatusBar: {
    height: '100%',
    borderRadius: 6,
  },
  analyticsStatusCount: {
    color: C.text,
    fontSize: 11,
    fontWeight: '800',
    width: 26,
    textAlign: 'right',
  },
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  center: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  muted: {
    color: C.muted,
    marginTop: 12,
    textAlign: 'center',
  },
  accessTitle: {
    color: C.text,
    fontSize: 23,
    fontWeight: '800',
    marginTop: 14,
  },
  hero: {
    backgroundColor: C.purple,
    borderRadius: 25,
    padding: 23,
    marginBottom: 25,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: C.darkPurple,
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  heroDecoration: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    right: -85,
    top: -90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 23,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.17)',
  },
  heroBadgeText: {
    color: C.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroEyebrow: {
    color: '#E3D9FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  heroTitle: {
    color: C.white,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 9,
  },
  heroDescription: {
    color: '#EAE4FF',
    fontSize: 13,
    lineHeight: 21,
    maxWidth: 310,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    alignItems: 'center',
  },
  statNumber: {
    color: C.text,
    fontSize: 25,
    fontWeight: '800',
    marginTop: 10,
  },
  statLabel: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 5,
  },
  createToggle: {
    backgroundColor: C.purple,
    borderRadius: 17,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flexShrink: 1,
  },
  toggleText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 24,
  },
  formTitle: {
    color: C.text,
    fontSize: 21,
    fontWeight: '800',
  },
  formDescription: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 15,
  },
  label: {
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 13,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFE',
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: C.text,
    fontSize: 14,
  },
  dateSection: {
    color: C.darkPurple,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 23,
    marginBottom: 12,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerColumn: {
    flex: 1,
    minWidth: 0,
  },
  pickerLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  pickerButton: {
    backgroundColor: '#F9FAFE',
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pickerText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  scheduleInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.lightPurple,
    padding: 13,
    borderRadius: 13,
    marginTop: 22,
    marginBottom: 18,
  },
  scheduleInfoText: {
    color: C.darkPurple,
    fontSize: 12,
    lineHeight: 19,
    flex: 1,
  },
  iosPickerBox: {
    marginTop: 12,
  },
  iosDoneButton: {
    alignSelf: 'flex-end',
    padding: 12,
  },
  iosDoneText: {
    color: C.purple,
    fontWeight: '800',
  },
  submitButton: {
    backgroundColor: C.purple,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  submitText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.6,
  },
  errorBox: {
    backgroundColor: '#FFF0F0',
    borderRadius: 13,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: C.red,
    fontSize: 13,
    fontWeight: '700',
    marginVertical: 12,
  },
  retryText: {
    color: C.purple,
    fontWeight: '800',
    marginTop: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 15,
  },
  countBadge: {
    backgroundColor: C.lightPurple,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  countText: {
    color: C.purple,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  emptyText: {
    color: C.muted,
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  eventCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 13,
  },
  eventTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  eventIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  eventTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  eventId: {
    color: C.purple,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 15,
  },
  eventDate: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 22,
    marginBottom: 6,
  },
  eventFooter: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 12,
    paddingTop: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  attendeeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attendeeText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '700',
  },
  qrButton: {
    backgroundColor: C.purple,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  qrButtonText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
  },
  qrSection: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 18,
    paddingTop: 20,
    alignItems: 'center',
  },
  qrTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '800',
  },
  qrSubtitle: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 17,
  },
  qrBox: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    padding: 15,
  },
  qrEventId: {
    color: C.purple,
    fontWeight: '800',
    fontSize: 14,
    marginTop: 12,
  },
  attendanceToggle: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 17,
    padding: 17,
    marginTop: 14,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attendanceCard: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  attendanceTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '800',
  },
  attendanceCount: {
    color: C.purple,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 8,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingVertical: 13,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.lightPurple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  studentMeta: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 18,
  },
  footer: {
    color: C.muted,
    textAlign: 'center',
    fontSize: 12,
    marginTop: 25,
  },
  viewStudentsButton: {
    backgroundColor: C.purple,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  viewStudentsText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    marginBottom: 12,
  },
  backText: {
    color: C.purple,
    fontSize: 15,
    fontWeight: '800',
  },
  detailCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
  },
  detailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailTitle: {
    color: C.text,
    fontSize: 23,
    fontWeight: '800',
    marginBottom: 8,
  },
  detailQrButton: {
    backgroundColor: C.lightPurple,
    borderRadius: 12,
    marginTop: 15,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  detailQrText: {
    color: C.purple,
    fontWeight: '800',
    fontSize: 13,
    flex: 1,
    textAlign: 'center',
  },
  attendanceHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  attendanceSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 5,
  },
  exportCsvButton: {
    backgroundColor: C.green,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginBottom: 7,
  },
  exportCsvButtonDisabled: {
    opacity: 0.55,
  },
  exportCsvButtonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '800',
  },
  exportCsvHint: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 14,
  },
  reportSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    marginBottom: 12,
  },
  reportSearchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    color: C.text,
    fontSize: 14,
  },
  reportFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  reportFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  reportFilterChipActive: {
    backgroundColor: C.purple,
    borderColor: C.purple,
  },
  reportFilterText: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  reportFilterTextActive: {
    color: C.white,
  },
  cancelButton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    backgroundColor: '#FFF0F0',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#FFDADA',
  },
  cancelButtonText: {
    color: C.red,
    fontSize: 12,
    fontWeight: '800',
  },
  deleteButton: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: '#FFF0F0',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#FFDADA',
  },
  deleteButtonText: {
    color: C.red,
    fontSize: 12,
    fontWeight: '800',
  },
  detailStudentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    padding: 14,
    marginBottom: 10,
  },
});
