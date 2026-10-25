
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { supabase } from '@/lib/supabase';
import {
  cancelEvent,
  updateAdminEventSchedule,
} from '@/lib/events';
import {
  getAdminEventAttendance,
  type TeacherAttendanceRecord,
} from '@/lib/attendance';
import { useUserRole } from '@/lib/useUserRole';

type SchoolEvent = {
  event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  created_by: string | null;
  created_at: string;
  status: 'active' | 'cancelled';
};

type EventWithCreator = SchoolEvent & {
  creatorName: string;
  creatorRole: string;
};

const EVENTS_PAGE_SIZE = 25;
const USERS_PAGE_SIZE = 25;
const FETCH_PAGE_SIZE = 200;
const PROFILE_BATCH_SIZE = 100;
const ANALYTICS_PAGE_SIZE = 500;

type ManagedProfile = {
  id: string;
  full_name: string | null;
  student_id: string | null;
  role: 'student' | 'teacher';
};

type ProfileRoleFilter =
  | 'all'
  | 'student'
  | 'teacher';

type EventStatusFilter =
  | 'all'
  | 'upcoming'
  | 'active'
  | 'ended'
  | 'cancelled';

type SchedulePicker = {
  field: 'start' | 'end';
  mode: 'date' | 'time';
} | null;

function formatPickerDate(value: Date): string {
  return value.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPickerTime(value: Date): string {
  return value.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Preserve the time when changing a date,
// and preserve the date when changing a time.
function mergePickedDateTime(
  current: Date,
  picked: Date,
  mode: 'date' | 'time'
): Date {
  const next = new Date(current.getTime());

  if (mode === 'date') {
    next.setFullYear(
      picked.getFullYear(),
      picked.getMonth(),
      picked.getDate()
    );
  } else {
    next.setHours(
      picked.getHours(),
      picked.getMinutes(),
      0,
      0
    );
  }

  return next;
}

function formatEventDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getEventStatus(event: SchoolEvent) {
  if (event.status === 'cancelled') {
    return {
      label: 'Cancelled',
      color: '#C0392B',
      bg: '#FDECEA',
    };
  }

  const now = Date.now();
  const start = new Date(event.start_time).getTime();
  const end = new Date(event.end_time).getTime();

  if (now < start) {
    return {
      label: 'Upcoming',
      color: '#936014',
      bg: '#FFF3DC',
    };
  }

  if (now > end) {
    return {
      label: 'Ended',
      color: '#687386',
      bg: '#EDF0F5',
    };
  }

  return {
    label: 'Active',
    color: '#16815A',
    bg: '#E3F7EC',
  };
}

type DashboardStats = {
  students: number;
  teachers: number;
  events: number;
  attendance: number;
};

// QRR KOP purple-and-white palette
const COLORS = {
  purple: '#6444E8',
  background: '#F8F7FC',
  white: '#FFFFFF',
  text: '#191535',
  muted: '#77718D',
  border: '#ECEAF5',
  red: '#D64545',
};

// Protect CSV exports from spreadsheet formula injection.
function csvField(
  value: string | number | null | undefined
): string {
  const raw = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw)
    ? `'${raw}`
    : raw;

  return `"${safe.replace(/"/g, '""')}"`;
}

function makeAdminAttendanceCsv(
  event: EventWithCreator,
  records: TeacherAttendanceRecord[]
): string {
  const header = [
    'Event ID',
    'Event Title',
    'Event Status',
    'Event Creator',
    'Student Name',
    'Student ID',
    'Scanned At (Local)',
    'Scanned At (ISO)',
  ];

  const rows = records.map((record) => [
    event.event_id,
    event.title,
    event.status,
    event.creatorName,
    record.studentName,
    record.studentNumber ?? '',
    formatEventDate(record.scannedAt),
    record.scannedAt,
  ]);

  return '\uFEFF' + [header, ...rows]
    .map((row) => row.map(csvField).join(','))
    .join('\r\n');
}

// School-wide attendance analytics.
type DailyScanPoint = {
  key: string;
  label: string;
  scans: number;
};

type SchoolAnalytics = {
  uniqueStudents: number;
  dailyTrend: DailyScanPoint[];
};

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');
  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function makeSevenDayTrend(
  now: Date
): DailyScanPoint[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (6 - index)
    );

    return {
      key: localDayKey(date),
      label: date.toLocaleDateString('en-PH', {
        weekday: 'short',
      }),
      scans: 0,
    };
  });
}

export default function AdminScreen() {
  const {
    user,
    isAdmin,
    roleLoading,
  } = useUserRole();

  const [stats, setStats] = useState<DashboardStats>({
    students: 0,
    teachers: 0,
    events: 0,
    attendance: 0,
  });

  const [schoolEvents, setSchoolEvents] =
    useState<EventWithCreator[]>([]);

  // Administrator account management
  const [managedProfiles, setManagedProfiles] =
    useState<ManagedProfile[]>([]);

  const [profilesLoading, setProfilesLoading] =
    useState(false);

  const [profilesError, setProfilesError] =
    useState<string | null>(null);

  const [profileSearch, setProfileSearch] =
    useState('');

  const [profileRoleFilter, setProfileRoleFilter] =
    useState<ProfileRoleFilter>('all');

  const [visibleProfileCount, setVisibleProfileCount] =
    useState(USERS_PAGE_SIZE);

  const [changingProfileId, setChangingProfileId] =
    useState<string | null>(null);

  // Attendance analytics
  const [analytics, setAnalytics] =
    useState<SchoolAnalytics | null>(null);

  const [analyticsLoading, setAnalyticsLoading] =
    useState(false);

  const [analyticsError, setAnalyticsError] =
    useState<string | null>(null);

  // Event management
  const [eventsLoading, setEventsLoading] =
    useState(false);

  const [eventsError, setEventsError] =
    useState<string | null>(null);

  const [eventSearch, setEventSearch] =
    useState('');

  const [eventStatusFilter, setEventStatusFilter] =
    useState<EventStatusFilter>('all');

  const [visibleEventCount, setVisibleEventCount] =
    useState(EVENTS_PAGE_SIZE);

  const [cancellingEventId, setCancellingEventId] =
    useState<string | null>(null);

  // Event title editing
  const [editingEvent, setEditingEvent] =
    useState<EventWithCreator | null>(null);

  const [editedTitle, setEditedTitle] =
    useState('');

  const [editSaving, setEditSaving] =
    useState(false);

  const [editError, setEditError] =
    useState<string | null>(null);

  // Event schedule editing
  const [scheduleEvent, setScheduleEvent] =
    useState<EventWithCreator | null>(null);

  const [scheduleStart, setScheduleStart] =
    useState<Date>(new Date());

  const [scheduleEnd, setScheduleEnd] =
    useState<Date>(new Date());

  const [schedulePicker, setSchedulePicker] =
    useState<SchedulePicker>(null);

  const [scheduleSaving, setScheduleSaving] =
    useState(false);

  const [scheduleError, setScheduleError] =
    useState<string | null>(null);

  // Attendance records and CSV exports
  const [selectedEvent, setSelectedEvent] =
    useState<EventWithCreator | null>(null);

  const [eventAttendance, setEventAttendance] =
    useState<TeacherAttendanceRecord[]>([]);

  const [attendanceLoading, setAttendanceLoading] =
    useState(false);

  const [attendanceError, setAttendanceError] =
    useState<string | null>(null);

  const [exportingAttendanceCsv, setExportingAttendanceCsv] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [lastUpdated, setLastUpdated] =
    useState<string | null>(null);

  // Load real school statistics from Supabase.
  const loadDashboard = useCallback(async () => {
    if (!user?.id || !isAdmin) {
      return;
    }

    try {
      setError(null);

      const [
        studentsResult,
        teachersResult,
        eventsResult,
        attendanceResult,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'student'),

        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'teacher'),

        supabase
          .from('events')
          .select('*', { count: 'exact', head: true }),

        supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true }),
      ]);

      const queryError =
        studentsResult.error ||
        teachersResult.error ||
        eventsResult.error ||
        attendanceResult.error;

      if (queryError) {
        throw new Error(queryError.message);
      }

      setStats({
        students: studentsResult.count ?? 0,
        teachers: teachersResult.count ?? 0,
        events: eventsResult.count ?? 0,
        attendance: attendanceResult.count ?? 0,
      });

      setLastUpdated(
        new Date().toLocaleTimeString()
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to load dashboard statistics.';

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAdmin]);



  // Load school-wide attendance analytics.
  const loadSchoolAnalytics = useCallback(async () => {
    if (!user?.id || !isAdmin) return;

    setAnalyticsLoading(true);
    setAnalyticsError(null);

    try {
      const now = new Date();
      const points = makeSevenDayTrend(now);
      const byDay = new Map(
        points.map((point) => [point.key, point])
      );

      const uniqueStudents = new Set<string>();
      let offset = 0;

      while (true) {
        const { data, error: queryError } = await supabase
          .from('attendance')
          .select('id, student_id, scanned_at')
          .order('id', { ascending: true })
          .range(
            offset,
            offset + ANALYTICS_PAGE_SIZE - 1
          );

        if (queryError) {
          throw new Error(queryError.message);
        }

        const rows = data ?? [];

        for (const record of rows) {
          if (record.student_id) {
            uniqueStudents.add(record.student_id);
          }

          const scanDate = new Date(record.scanned_at);

          if (
            !Number.isFinite(scanDate.getTime()) ||
            scanDate.getTime() > now.getTime()
          ) {
            continue;
          }

          const day = byDay.get(localDayKey(scanDate));

          if (day) {
            day.scans += 1;
          }
        }

        if (rows.length < ANALYTICS_PAGE_SIZE) {
          break;
        }

        offset += ANALYTICS_PAGE_SIZE;
      }

      setAnalytics({
        uniqueStudents: uniqueStudents.size,
        dailyTrend: points,
      });
    } catch (err) {
      setAnalytics(null);
      setAnalyticsError(
        err instanceof Error
          ? err.message
          : 'Unable to load attendance analytics.'
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }, [user?.id, isAdmin]);

  // Load all school events with pagination.
  const loadSchoolEvents = useCallback(async () => {
    if (!user?.id || !isAdmin) return;

    setEventsLoading(true);
    setEventsError(null);

    try {
      const allRows: SchoolEvent[] = [];
      let offset = 0;

      while (true) {
        const { data, error: queryError } = await supabase
          .from('events')
          .select(
            'event_id, title, start_time, end_time, created_by, created_at, status'
          )
          .order('created_at', { ascending: false })
          .order('event_id', { ascending: false })
          .range(
            offset,
            offset + FETCH_PAGE_SIZE - 1
          );

        if (queryError) {
          throw new Error(queryError.message);
        }

        const rows = (data ?? []) as SchoolEvent[];

        allRows.push(...rows);

        if (rows.length < FETCH_PAGE_SIZE) {
          break;
        }

        offset += FETCH_PAGE_SIZE;
      }

      const creatorIds = Array.from(
        new Set(
          allRows
            .map((event) => event.created_by)
            .filter((id): id is string => !!id)
        )
      );

      const creatorMap = new Map<
        string,
        {
          full_name: string | null;
          role: string | null;
        }
      >();

      for (
        let index = 0;
        index < creatorIds.length;
        index += PROFILE_BATCH_SIZE
      ) {
        const batch = creatorIds.slice(
          index,
          index + PROFILE_BATCH_SIZE
        );

        const {
          data: creators,
          error: profilesError,
        } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('id', batch);

        if (profilesError) {
          throw new Error(profilesError.message);
        }

        for (const creator of creators ?? []) {
          creatorMap.set(creator.id, {
            full_name: creator.full_name,
            role: creator.role,
          });
        }
      }

      const eventsWithCreators: EventWithCreator[] =
        allRows.map((event) => {
          const creator = event.created_by
            ? creatorMap.get(event.created_by)
            : undefined;

          return {
            ...event,
            creatorName:
              creator?.full_name?.trim() ||
              'Unknown creator',
            creatorRole:
              creator?.role || 'unknown',
          };
        });

      setSchoolEvents(eventsWithCreators);
      setVisibleEventCount(EVENTS_PAGE_SIZE);
    } catch (err) {
      setEventsError(
        err instanceof Error
          ? err.message
          : 'Unable to load school events.'
      );
    } finally {
      setEventsLoading(false);
    }
  }, [user?.id, isAdmin]);

  // Load student and teacher accounts.
  const loadManagedProfiles = useCallback(async () => {
    if (!user?.id || !isAdmin) return;

    setProfilesLoading(true);
    setProfilesError(null);

    try {
      const allProfiles: ManagedProfile[] = [];
      let offset = 0;

      while (true) {
        const { data, error: queryError } = await supabase
          .from('profiles')
          .select('id, full_name, student_id, role')
          .in('role', ['student', 'teacher'])
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(
            offset,
            offset + FETCH_PAGE_SIZE - 1
          );

        if (queryError) {
          throw new Error(queryError.message);
        }

        const rows = (data ?? []) as ManagedProfile[];

        allProfiles.push(...rows);

        if (rows.length < FETCH_PAGE_SIZE) {
          break;
        }

        offset += FETCH_PAGE_SIZE;
      }

      setManagedProfiles(allProfiles);
      setVisibleProfileCount(USERS_PAGE_SIZE);
    } catch (err) {
      setProfilesError(
        err instanceof Error
          ? err.message
          : 'Unable to load user accounts.'
      );
    } finally {
      setProfilesLoading(false);
    }
  }, [user?.id, isAdmin]);

  // Change a user's role using the secured admin RPC.
  const handleSetTeacherRole = async (
    profile: ManagedProfile,
    makeTeacher: boolean
  ) => {
    if (
      !user?.id ||
      !isAdmin ||
      changingProfileId !== null ||
      profilesLoading
    ) {
      return;
    }

    if (profile.id === user.id) return;

    if (
      (profile.role === 'teacher') === makeTeacher
    ) {
      return;
    }

    setChangingProfileId(profile.id);

    try {
      const { error: rpcError } = await supabase.rpc(
        'admin_set_teacher_role',
        {
          p_user_id: profile.id,
          p_make_teacher: makeTeacher,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const {
        data: saved,
        error: verifyError,
      } = await supabase
        .from('profiles')
        .select('id, full_name, student_id, role')
        .eq('id', profile.id)
        .single();

      if (
        verifyError ||
        !saved ||
        saved.role !==
          (makeTeacher ? 'teacher' : 'student')
      ) {
        throw new Error(
          'Role update could not be verified. Refresh accounts before trying again.'
        );
      }

      const verified = saved as ManagedProfile;

      setManagedProfiles((current) =>
        current.map((item) =>
          item.id === verified.id
            ? verified
            : item
        )
      );

      setSchoolEvents((current) =>
        current.map((event) =>
          event.created_by === verified.id
            ? {
                ...event,
                creatorRole: verified.role,
              }
            : event
        )
      );

      await loadDashboard();

      Alert.alert(
        makeTeacher
          ? 'Teacher approved'
          : 'Teacher access removed',
        makeTeacher
          ? 'This account now has the Teacher role. The user may need to sign in again to refresh their tabs.'
          : 'This account is now a Student. Existing events and attendance records were kept. The user may need to sign in again.'
      );
    } catch (err) {
      Alert.alert(
        'Unable to change role',
        err instanceof Error
          ? err.message
          : 'Please try again.'
      );

      void loadManagedProfiles();
      void loadDashboard();
    } finally {
      setChangingProfileId(null);
    }
  };

  const confirmSetTeacherRole = (
    profile: ManagedProfile
  ) => {
    if (
      !isAdmin ||
      !user?.id ||
      profile.id === user.id ||
      changingProfileId !== null ||
      profilesLoading
    ) {
      return;
    }

    const makeTeacher = profile.role === 'student';

    const displayName =
      profile.full_name?.trim() ||
      profile.student_id ||
      'this account';

    Alert.alert(
      makeTeacher
        ? 'Approve Teacher account?'
        : 'Remove Teacher access?',
      makeTeacher
        ? `Grant Teacher privileges to ${displayName}? This will allow the account to create and manage attendance events.`
        : `Return ${displayName} to Student status? Their existing events and attendance records will remain saved, but Teacher tools will no longer be available.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: makeTeacher
            ? 'Approve Teacher'
            : 'Remove Access',
          style: makeTeacher
            ? 'default'
            : 'destructive',
          onPress: () => {
            void handleSetTeacherRole(
              profile,
              makeTeacher
            );
          },
        },
      ]
    );
  };

  // Load all dashboard sections for administrators.
  useEffect(() => {
    if (!roleLoading && isAdmin) {
      setLoading(true);

      void loadDashboard();
      void loadSchoolEvents();
      void loadSchoolAnalytics();
      void loadManagedProfiles();
    }
  }, [
    roleLoading,
    isAdmin,
    loadDashboard,
    loadSchoolEvents,
    loadSchoolAnalytics,
    loadManagedProfiles,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        loadDashboard(),
        loadSchoolEvents(),
        loadSchoolAnalytics(),
        loadManagedProfiles(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // Event status analytics.
  const statusBreakdown = (
    [
      {
        label: 'Upcoming',
        color: '#C88B28',
      },
      {
        label: 'Active',
        color: '#16815A',
      },
      {
        label: 'Ended',
        color: '#8792A7',
      },
      {
        label: 'Cancelled',
        color: COLORS.red,
      },
    ] as const
  ).map((status) => ({
    ...status,
    count: schoolEvents.filter(
      (event) =>
        getEventStatus(event).label === status.label
    ).length,
  }));

  const maxStatusCount = Math.max(
    1,
    ...statusBreakdown.map((item) => item.count)
  );

  const maxDailyScans = Math.max(
    1,
    ...(analytics?.dailyTrend ?? []).map(
      (day) => day.scans
    )
  );

  const averageScansPerEvent =
    stats.events > 0
      ? (stats.attendance / stats.events).toFixed(1)
      : '0.0';

  // Filter student and teacher accounts.
  const normalizedProfileSearch =
    profileSearch.trim().toLocaleLowerCase();

  const filteredProfiles = managedProfiles.filter(
    (profile) => {
      if (
        profileRoleFilter !== 'all' &&
        profile.role !== profileRoleFilter
      ) {
        return false;
      }

      return (
        !normalizedProfileSearch ||
        [
          profile.full_name ?? '',
          profile.student_id ?? '',
          profile.id,
        ].some((value) =>
          value
            .toLocaleLowerCase()
            .includes(normalizedProfileSearch)
        )
      );
    }
  );

  const visibleProfiles = filteredProfiles.slice(
    0,
    visibleProfileCount
  );

  const hasMoreProfiles =
    visibleProfileCount < filteredProfiles.length;

  // Filter school events.
  const normalizedSearch =
    eventSearch.trim().toLocaleLowerCase();

  const filteredEvents = schoolEvents.filter(
    (event) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          event.title,
          event.event_id,
          event.creatorName,
          event.creatorRole,
        ].some((value) =>
          value
            .toLocaleLowerCase()
            .includes(normalizedSearch)
        );

      if (!matchesSearch) return false;

      if (eventStatusFilter === 'all') {
        return true;
      }

      return (
        getEventStatus(event)
          .label.toLocaleLowerCase() ===
        eventStatusFilter
      );
    }
  );

  const visibleEvents = filteredEvents.slice(
    0,
    visibleEventCount
  );

  const hasMoreFilteredEvents =
    visibleEventCount < filteredEvents.length;

  const updateSearch = (value: string) => {
    setEventSearch(value);
    setVisibleEventCount(EVENTS_PAGE_SIZE);
  };

  const updateStatusFilter = (
    value: EventStatusFilter
  ) => {
    setEventStatusFilter(value);
    setVisibleEventCount(EVENTS_PAGE_SIZE);
  };

  // Load attendance for a selected event.
  const loadSelectedAttendance = async (
    eventId: string
  ) => {
    if (!user?.id || !isAdmin) return;

    setAttendanceLoading(true);
    setAttendanceError(null);

    try {
      const rows = await getAdminEventAttendance(
        eventId
      );

      setEventAttendance(rows);
    } catch (err) {
      setAttendanceError(
        err instanceof Error
          ? err.message
          : 'Unable to load event attendance.'
      );

      setEventAttendance([]);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const openEventAttendance = (
    event: EventWithCreator
  ) => {
    setSelectedEvent(event);
    setEventAttendance([]);

    void loadSelectedAttendance(event.event_id);
  };

  // Export attendance records as CSV.
  const exportAdminAttendanceCsv = async () => {
    if (
      !isAdmin ||
      !selectedEvent ||
      attendanceLoading ||
      attendanceError ||
      exportingAttendanceCsv
    ) {
      return;
    }

    if (eventAttendance.length === 0) {
      Alert.alert(
        'Nothing to export',
        'This event has no attendance records yet.'
      );
      return;
    }

    setExportingAttendanceCsv(true);

    try {
      const available =
        await Sharing.isAvailableAsync();

      if (!available) {
        Alert.alert(
          'Sharing unavailable',
          'File sharing is not supported on this device.'
        );
        return;
      }

      const directory =
        FileSystem.cacheDirectory ??
        FileSystem.documentDirectory;

      if (!directory) {
        throw new Error('App storage is unavailable.');
      }

      const safeEventId =
        selectedEvent.event_id
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 50) || 'event';

      const fileUri =
        `${directory}QRR-KOP-Admin-Attendance-` +
        `${safeEventId}-${Date.now()}.csv`;

      const csv = makeAdminAttendanceCsv(
        selectedEvent,
        eventAttendance
      );

      await FileSystem.writeAsStringAsync(
        fileUri,
        csv,
        {
          encoding: FileSystem.EncodingType.UTF8,
        }
      );

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle:
          `Export attendance - ${selectedEvent.title}`,
        UTI: 'public.comma-separated-values-text',
      });
    } catch (err) {
      console.error(
        'Administrator CSV export failed:',
        err
      );

      Alert.alert(
        'Export failed',
        err instanceof Error
          ? err.message
          : 'Unable to export attendance. Please try again.'
      );
    } finally {
      setExportingAttendanceCsv(false);
    }
  };

  const closeEventAttendance = () => {
    setSelectedEvent(null);
    setEventAttendance([]);
    setAttendanceError(null);
  };

  // Cancel events while preserving attendance.
  const handleCancelEvent = async (
    event: EventWithCreator
  ) => {
    if (
      !user?.id ||
      !isAdmin ||
      cancellingEventId ||
      editSaving ||
      scheduleSaving
    ) {
      return;
    }

    setCancellingEventId(event.event_id);

    try {
      await cancelEvent(event.event_id);

      setSchoolEvents((current) =>
        current.map((item) =>
          item.event_id === event.event_id
            ? {
                ...item,
                status: 'cancelled',
              }
            : item
        )
      );

      setSelectedEvent((current) =>
        current?.event_id === event.event_id
          ? {
              ...current,
              status: 'cancelled',
            }
          : current
      );

      Alert.alert(
        'Event cancelled',
        'New QR attendance is blocked. Existing attendance records are preserved.'
      );

      void loadDashboard();
    } catch (err) {
      Alert.alert(
        'Unable to cancel event',
        err instanceof Error
          ? err.message
          : 'Please try again.'
      );
    } finally {
      setCancellingEventId(null);
    }
  };

  const confirmCancelEvent = (
    event: EventWithCreator
  ) => {
    if (
      !isAdmin ||
      event.status === 'cancelled' ||
      cancellingEventId ||
      editSaving ||
      scheduleSaving
    ) {
      return;
    }

    Alert.alert(
      'Cancel event?',
      `Cancel "${event.title}"? Students cannot scan after cancellation, but all recorded attendance will be kept.`,
      [
        {
          text: 'Keep Event',
          style: 'cancel',
        },
        {
          text: 'Cancel Event',
          style: 'destructive',
          onPress: () => {
            void handleCancelEvent(event);
          },
        },
      ]
    );
  };

  // Open event title editor.
  const openEditEvent = (
    event: EventWithCreator
  ) => {
    if (!isAdmin) return;

    setEditingEvent(event);
    setEditedTitle(event.title);
    setEditError(null);
  };

  const closeEditEvent = () => {
    if (editSaving) return;

    setEditingEvent(null);
    setEditedTitle('');
    setEditError(null);
  };

  const saveEditedEvent = async () => {
    if (
      !editingEvent ||
      !user?.id ||
      !isAdmin ||
      editSaving
    ) {
      return;
    }

    const title = editedTitle.trim();

    if (!title) {
      setEditError('Event title cannot be empty.');
      return;
    }

    if (title.length > 150) {
      setEditError(
        'Event title must be 150 characters or fewer.'
      );
      return;
    }

    if (title === editingEvent.title) {
      closeEditEvent();
      return;
    }

    setEditSaving(true);
    setEditError(null);

    try {
      const {
        data,
        error: updateError,
      } = await supabase
        .from('events')
        .update({ title })
        .eq('event_id', editingEvent.event_id)
        .select('event_id, title')
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (
        !data ||
        data.event_id !== editingEvent.event_id
      ) {
        throw new Error(
          'The event could not be updated. Refresh and try again.'
        );
      }

      setSchoolEvents((current) =>
        current.map((event) =>
          event.event_id === editingEvent.event_id
            ? {
                ...event,
                title: data.title,
              }
            : event
        )
      );

      setSelectedEvent((current) =>
        current?.event_id === editingEvent.event_id
          ? {
              ...current,
              title: data.title,
            }
          : current
      );

      setEditingEvent(null);
      setEditedTitle('');

      Alert.alert(
        'Event updated',
        'The event title was saved successfully.'
      );
    } catch (err) {
      setEditError(
        err instanceof Error
          ? err.message
          : 'Unable to update the event.'
      );
    } finally {
      setEditSaving(false);
    }
  };

  const confirmSaveEditedEvent = () => {
    if (!editingEvent || editSaving) return;

    const title = editedTitle.trim();

    if (!title || title.length > 150) {
      setEditError(
        !title
          ? 'Event title cannot be empty.'
          : 'Event title must be 150 characters or fewer.'
      );
      return;
    }

    if (title === editingEvent.title) {
      closeEditEvent();
      return;
    }

    Alert.alert(
      'Confirm event title change',
      `Change the title of event ${editingEvent.event_id}? Existing attendance records will be preserved.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Save Title',
          onPress: () => {
            void saveEditedEvent();
          },
        },
      ]
    );
  };

  // Open event schedule editor.
  const openScheduleEditor = (
    event: EventWithCreator
  ) => {
    if (!isAdmin) return;

    const start = new Date(event.start_time);
    const end = new Date(event.end_time);

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime())
    ) {
      Alert.alert(
        'Invalid event schedule',
        'This event has invalid dates. Please refresh.'
      );
      return;
    }

    setScheduleEvent(event);
    setScheduleStart(start);
    setScheduleEnd(end);
    setSchedulePicker(null);
    setScheduleError(null);
  };

  const closeScheduleEditor = () => {
    if (scheduleSaving) return;

    setSchedulePicker(null);
    setScheduleEvent(null);
    setScheduleError(null);
  };

  const onSchedulePickerChange = (
    event: DateTimePickerEvent,
    picked?: Date
  ) => {
    const target = schedulePicker;

    setSchedulePicker(null);

    if (
      !target ||
      event.type !== 'set' ||
      !picked
    ) {
      return;
    }

    if (target.field === 'start') {
      setScheduleStart((current) =>
        mergePickedDateTime(
          current,
          picked,
          target.mode
        )
      );
    } else {
      setScheduleEnd((current) =>
        mergePickedDateTime(
          current,
          picked,
          target.mode
        )
      );
    }

    setScheduleError(null);
  };

  // Save updated event schedule.
  const saveSchedule = async () => {
    if (
      !scheduleEvent ||
      !user?.id ||
      !isAdmin ||
      scheduleSaving
    ) {
      return;
    }

    const startMs = scheduleStart.getTime();
    const endMs = scheduleEnd.getTime();

    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs)
    ) {
      setScheduleError(
        'Choose valid start and end dates.'
      );
      return;
    }

    if (endMs <= startMs) {
      setScheduleError(
        'End time must be later than start time.'
      );
      return;
    }

    if (
      startMs === Date.parse(scheduleEvent.start_time) &&
      endMs === Date.parse(scheduleEvent.end_time)
    ) {
      closeScheduleEditor();
      return;
    }

    setScheduleSaving(true);
    setScheduleError(null);

    try {
      await updateAdminEventSchedule(
        scheduleEvent.event_id,
        scheduleStart.toISOString(),
        scheduleEnd.toISOString()
      );

      const {
        data: saved,
        error: readError,
      } = await supabase
        .from('events')
        .select('event_id, start_time, end_time')
        .eq('event_id', scheduleEvent.event_id)
        .single();

      if (readError || !saved) {
        throw new Error(
          'Schedule saved, but could not verify it. Refresh the dashboard.'
        );
      }

      setSchoolEvents((current) =>
        current.map((item) =>
          item.event_id === scheduleEvent.event_id
            ? {
                ...item,
                start_time: saved.start_time,
                end_time: saved.end_time,
              }
            : item
        )
      );

      setSelectedEvent((current) =>
        current?.event_id === scheduleEvent.event_id
          ? {
              ...current,
              start_time: saved.start_time,
              end_time: saved.end_time,
            }
          : current
      );

      setScheduleEvent(null);
      setSchedulePicker(null);

      Alert.alert(
        'Schedule updated',
        'The new event schedule was saved. Existing attendance records were preserved.'
      );
    } catch (err) {
      setScheduleError(
        err instanceof Error
          ? err.message
          : 'Unable to update the event schedule.'
      );
    } finally {
      setScheduleSaving(false);
    }
  };

  const confirmSaveSchedule = () => {
    if (!scheduleEvent || scheduleSaving) return;

    if (
      !Number.isFinite(scheduleStart.getTime()) ||
      !Number.isFinite(scheduleEnd.getTime())
    ) {
      setScheduleError(
        'Choose valid start and end dates.'
      );
      return;
    }

    if (
      scheduleEnd.getTime() <= scheduleStart.getTime()
    ) {
      setScheduleError(
        'End time must be later than start time.'
      );
      return;
    }

    if (
      scheduleStart.getTime() ===
        Date.parse(scheduleEvent.start_time) &&
      scheduleEnd.getTime() ===
        Date.parse(scheduleEvent.end_time)
    ) {
      closeScheduleEditor();
      return;
    }

    Alert.alert(
      'Confirm schedule change',
      `Update ${scheduleEvent.event_id}?\n\nStart: ${formatEventDate(
        scheduleStart.toISOString()
      )}\nEnd: ${formatEventDate(
        scheduleEnd.toISOString()
      )}\n\nStudents will be able to scan only during the new schedule. Existing attendance will remain.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Save Schedule',
          onPress: () => {
            void saveSchedule();
          },
        },
      ]
    );
  };


  if (roleLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={COLORS.purple}
        />
        <Text style={styles.helperText}>
          Checking administrator access...
        </Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="lock-closed-outline"
          size={48}
          color={COLORS.red}
        />
        <Text style={styles.accessDenied}>
          Access denied
        </Text>
        <Text style={styles.helperText}>
          This screen is available to administrators only.
        </Text>
      </View>
    );
  }

  // Event schedule editor
  if (scheduleEvent) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <TouchableOpacity
          style={styles.attendanceBackButton}
          onPress={closeScheduleEditor}
          disabled={scheduleSaving}
          accessibilityRole="button"
        >
          <Ionicons
            name="arrow-back"
            size={21}
            color={COLORS.purple}
          />
          <Text style={styles.attendanceBackText}>
            All School Events
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Edit Event Schedule
        </Text>
        <Text
          style={[
            styles.eventsSubtitle,
            { marginBottom: 20, marginTop: 5 },
          ]}
        >
          Set the new start and end date and time
          for this school event.
        </Text>

        <View style={styles.schoolEventCard}>
          <Text style={styles.editFieldLabel}>
            Event ID (protected)
          </Text>
          <Text style={styles.schoolEventId}>
            {scheduleEvent.event_id}
          </Text>

          <Text style={styles.editFieldLabel}>
            Event title (unchanged)
          </Text>
          <Text style={styles.editReadonlyValue}>
            {scheduleEvent.title}
          </Text>

          <Text style={styles.editFieldLabel}>
            Original creator (protected)
          </Text>
          <Text style={styles.editReadonlyValue}>
            {scheduleEvent.creatorName} ({scheduleEvent.creatorRole})
          </Text>

          <Text style={styles.scheduleGroupLabel}>
            Start
          </Text>

          <View style={styles.schedulePickerRow}>
            <TouchableOpacity
              style={styles.schedulePickerButton}
              onPress={() =>
                setSchedulePicker({
                  field: 'start',
                  mode: 'date',
                })
              }
              disabled={scheduleSaving}
              accessibilityRole="button"
              accessibilityLabel="Choose event start date"
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={COLORS.purple}
              />
              <Text style={styles.schedulePickerButtonText}>
                {formatPickerDate(scheduleStart)}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.schedulePickerButton}
              onPress={() =>
                setSchedulePicker({
                  field: 'start',
                  mode: 'time',
                })
              }
              disabled={scheduleSaving}
              accessibilityRole="button"
              accessibilityLabel="Choose event start time"
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={COLORS.purple}
              />
              <Text style={styles.schedulePickerButtonText}>
                {formatPickerTime(scheduleStart)}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.scheduleGroupLabel}>
            End
          </Text>

          <View style={styles.schedulePickerRow}>
            <TouchableOpacity
              style={styles.schedulePickerButton}
              onPress={() =>
                setSchedulePicker({
                  field: 'end',
                  mode: 'date',
                })
              }
              disabled={scheduleSaving}
              accessibilityRole="button"
              accessibilityLabel="Choose event end date"
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={COLORS.purple}
              />
              <Text style={styles.schedulePickerButtonText}>
                {formatPickerDate(scheduleEnd)}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.schedulePickerButton}
              onPress={() =>
                setSchedulePicker({
                  field: 'end',
                  mode: 'time',
                })
              }
              disabled={scheduleSaving}
              accessibilityRole="button"
              accessibilityLabel="Choose event end time"
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={COLORS.purple}
              />
              <Text style={styles.schedulePickerButtonText}>
                {formatPickerTime(scheduleEnd)}
              </Text>
            </TouchableOpacity>
          </View>

          {schedulePicker ? (
            <DateTimePicker
              value={
                schedulePicker.field === 'start'
                  ? scheduleStart
                  : scheduleEnd
              }
              mode={schedulePicker.mode}
              display="default"
              is24Hour={false}
              onChange={onSchedulePickerChange}
            />
          ) : null}

          <View style={styles.editNotice}>
            <Ionicons
              name="shield-checkmark-outline"
              size={19}
              color={COLORS.purple}
            />
            <Text style={styles.editNoticeText}>
              This updates only the event schedule.
              The event ID, creator, title, and saved
              attendance records are preserved.
              QR scans follow the latest schedule
              saved in Supabase.
            </Text>
          </View>
        </View>

        {scheduleError ? (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color={COLORS.red}
            />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Unable to save schedule
              </Text>
              <Text style={styles.errorMessage}>
                {scheduleError}
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.editSaveButton,
            scheduleSaving && styles.editDisabledButton,
          ]}
          onPress={confirmSaveSchedule}
          disabled={scheduleSaving}
          accessibilityRole="button"
          accessibilityLabel="Save event schedule"
        >
          {scheduleSaving ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons
                name="save-outline"
                size={18}
                color={COLORS.white}
              />
              <Text style={styles.viewAttendanceText}>
                Save Schedule
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editCancelButton}
          onPress={closeScheduleEditor}
          disabled={scheduleSaving}
          accessibilityRole="button"
        >
          <Text style={styles.loadMoreText}>
            Cancel
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Event title editor
  if (editingEvent) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.attendanceBackButton}
          onPress={closeEditEvent}
          disabled={editSaving}
          accessibilityRole="button"
          accessibilityLabel="Back to all school events"
        >
          <Ionicons
            name="arrow-back"
            size={21}
            color={COLORS.purple}
          />
          <Text style={styles.attendanceBackText}>
            All School Events
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Edit School Event
        </Text>

        <Text
          style={[
            styles.eventsSubtitle,
            { marginBottom: 20, marginTop: 5 },
          ]}
        >
          Administrators can update titles of
          teacher-created and admin-created events.
        </Text>

        <View style={styles.schoolEventCard}>
          <Text style={styles.editFieldLabel}>
            Event ID (protected)
          </Text>
          <Text style={styles.schoolEventId}>
            {editingEvent.event_id}
          </Text>

          <Text style={styles.editFieldLabel}>
            Original creator (protected)
          </Text>
          <Text style={styles.editReadonlyValue}>
            {editingEvent.creatorName} ({editingEvent.creatorRole})
          </Text>

          <Text style={styles.editFieldLabel}>
            Event title
          </Text>
          <TextInput
            style={styles.editTitleInput}
            value={editedTitle}
            onChangeText={(value) => {
              setEditedTitle(value);
              if (editError) setEditError(null);
            }}
            placeholder="Enter event title"
            placeholderTextColor={COLORS.muted}
            maxLength={150}
            editable={!editSaving}
            autoCapitalize="sentences"
            accessibilityLabel="Edit event title"
          />

          <Text style={styles.editHint}>
            {editedTitle.trim().length}/150 characters
          </Text>

          <Text style={styles.editFieldLabel}>
            Start (unchanged)
          </Text>
          <Text style={styles.editReadonlyValue}>
            {formatEventDate(editingEvent.start_time)}
          </Text>

          <Text style={styles.editFieldLabel}>
            End (unchanged)
          </Text>
          <Text style={styles.editReadonlyValue}>
            {formatEventDate(editingEvent.end_time)}
          </Text>

          <View style={styles.editNotice}>
            <Ionicons
              name="shield-checkmark-outline"
              size={19}
              color={COLORS.purple}
            />
            <Text style={styles.editNoticeText}>
              This update changes only the event
              title. The event ID, creator, schedule,
              QR timing, and existing attendance
              records stay unchanged.
            </Text>
          </View>
        </View>

        {editError ? (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color={COLORS.red}
            />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Unable to save event
              </Text>
              <Text style={styles.errorMessage}>
                {editError}
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.editSaveButton,
            editSaving && styles.editDisabledButton,
          ]}
          onPress={confirmSaveEditedEvent}
          disabled={editSaving}
          accessibilityRole="button"
          accessibilityLabel="Save event title"
        >
          {editSaving ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons
                name="save-outline"
                size={18}
                color={COLORS.white}
              />
              <Text style={styles.viewAttendanceText}>
                Save Event Title
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editCancelButton}
          onPress={closeEditEvent}
          disabled={editSaving}
          accessibilityRole="button"
        >
          <Text style={styles.loadMoreText}>
            Cancel
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Event attendance details
  if (selectedEvent) {
    const status = getEventStatus(selectedEvent);

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <TouchableOpacity
          style={styles.attendanceBackButton}
          onPress={closeEventAttendance}
          accessibilityRole="button"
          accessibilityLabel="Back to Admin Dashboard"
        >
          <Ionicons
            name="arrow-back"
            size={21}
            color={COLORS.purple}
          />
          <Text style={styles.attendanceBackText}>
            All School Events
          </Text>
        </TouchableOpacity>

        <View style={styles.schoolEventCard}>
          <View style={styles.schoolEventTop}>
            <Text style={styles.schoolEventTitle}>
              {selectedEvent.title}
            </Text>
            <View
              style={[
                styles.eventStatus,
                { backgroundColor: status.bg },
              ]}
            >
              <Text
                style={[
                  styles.eventStatusText,
                  { color: status.color },
                ]}
              >
                {status.label}
              </Text>
            </View>
          </View>

          <Text style={styles.schoolEventId}>
            {selectedEvent.event_id}
          </Text>

          <Text style={styles.eventInfoText}>
            Created by: {selectedEvent.creatorName} ({selectedEvent.creatorRole})
          </Text>
          <Text style={styles.eventInfoText}>
            Start: {formatEventDate(selectedEvent.start_time)}
          </Text>
          <Text style={styles.eventInfoText}>
            End: {formatEventDate(selectedEvent.end_time)}
          </Text>

          {selectedEvent.status !== 'cancelled' ? (
            <TouchableOpacity
              style={styles.cancelEventButton}
              onPress={() =>
                confirmCancelEvent(selectedEvent)
              }
              disabled={cancellingEventId !== null}
              accessibilityRole="button"
              accessibilityLabel={`Cancel ${selectedEvent.title} and preserve attendance`}
            >
              {cancellingEventId === selectedEvent.event_id ? (
                <ActivityIndicator
                  size="small"
                  color={COLORS.red}
                />
              ) : (
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color={COLORS.red}
                />
              )}
              <Text style={styles.cancelEventButtonText}>
                {cancellingEventId === selectedEvent.event_id
                  ? 'Cancelling...'
                  : 'Cancel Event (Keep Attendance)'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.attendanceHeading}>
          <View style={styles.eventsHeading}>
            <Text style={styles.sectionTitle}>
              Students Attended
            </Text>
            <Text style={styles.eventsSubtitle}>
              School-wide event attendance • View only
            </Text>
          </View>

          {!attendanceLoading && !attendanceError ? (
            <Text style={styles.attendanceCount}>
              {eventAttendance.length}
            </Text>
          ) : null}
        </View>

        {attendanceLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator
              size="large"
              color={COLORS.purple}
            />
            <Text style={styles.helperText}>
              Loading attendance...
            </Text>
          </View>
        ) : null}

        {attendanceError ? (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color={COLORS.red}
            />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Unable to load attendance
              </Text>
              <Text style={styles.errorMessage}>
                {attendanceError}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  void loadSelectedAttendance(
                    selectedEvent.event_id
                  )
                }
              >
                <Text style={styles.retryText}>
                  Try Again
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {!attendanceLoading &&
        !attendanceError &&
        eventAttendance.length > 0 ? (
          <TouchableOpacity
            style={[
              styles.exportCsvButton,
              exportingAttendanceCsv &&
                styles.exportCsvDisabled,
            ]}
            onPress={() => {
              void exportAdminAttendanceCsv();
            }}
            disabled={exportingAttendanceCsv}
            accessibilityRole="button"
            accessibilityLabel={`Export ${eventAttendance.length} attendance records as CSV`}
          >
            {exportingAttendanceCsv ? (
              <ActivityIndicator
                size="small"
                color={COLORS.white}
              />
            ) : (
              <Ionicons
                name="download-outline"
                size={19}
                color={COLORS.white}
              />
            )}
            <Text style={styles.exportCsvText}>
              {exportingAttendanceCsv
                ? 'Preparing CSV...'
                : `Export CSV (${eventAttendance.length})`}
            </Text>
          </TouchableOpacity>
        ) : null}

        {!attendanceLoading &&
        !attendanceError &&
        eventAttendance.length === 0 ? (
          <View style={styles.emptyEvents}>
            <Ionicons
              name="people-outline"
              size={32}
              color={COLORS.purple}
            />
            <Text style={styles.helperText}>
              No students have attended this event yet.
            </Text>
          </View>
        ) : null}

        {!attendanceLoading &&
        !attendanceError &&
        eventAttendance.map((record) => (
          <View
            key={record.id}
            style={styles.attendeeCard}
          >
            <View style={styles.attendeeIcon}>
              <Ionicons
                name="person-outline"
                size={20}
                color={COLORS.purple}
              />
            </View>
            <View style={styles.attendeeDetails}>
              <Text style={styles.attendeeName}>
                {record.studentName}
              </Text>
              <Text style={styles.attendeeMeta}>
                Student ID: {record.studentNumber || 'Not provided'}
              </Text>
              <Text style={styles.attendeeMeta}>
                Scanned: {formatEventDate(record.scannedAt)}
              </Text>
            </View>
            <Ionicons
              name="checkmark-circle"
              size={22}
              color="#16815A"
            />
          </View>
        ))}

        <TouchableOpacity
          style={styles.attendanceRefreshButton}
          disabled={attendanceLoading}
          onPress={() =>
            void loadSelectedAttendance(
              selectedEvent.event_id
            )
          }
          accessibilityRole="button"
        >
          <Ionicons
            name="refresh-outline"
            size={18}
            color={COLORS.purple}
          />
          <Text style={styles.loadMoreText}>
            Refresh Attendance
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Main Admin Dashboard
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={COLORS.purple}
          colors={[COLORS.purple]}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerDecoration} />

        <View style={styles.headerTopRow}>
          <View style={styles.headerIcon}>
            <Ionicons
              name="shield-checkmark"
              size={27}
              color={COLORS.white}
            />
          </View>

          <View style={styles.adminBadge}>
            <Ionicons
              name="shield-checkmark-outline"
              size={14}
              color={COLORS.white}
            />
            <Text style={styles.adminBadgeText}>
              ADMINISTRATOR
            </Text>
          </View>
        </View>

        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>
            QRR KOP WORKSPACE
          </Text>
          <Text style={styles.title}>
            Admin Dashboard
          </Text>
          <Text style={styles.subtitle}>
            Manage school attendance, events,
            users, and reports in one place.
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          School Statistics
        </Text>

        <TouchableOpacity
          onPress={handleRefresh}
          disabled={refreshing || loading}
          style={styles.refreshButton}
        >
          <Ionicons
            name="refresh"
            size={17}
            color={COLORS.purple}
          />
          <Text style={styles.refreshText}>
            Refresh
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator
            size="large"
            color={COLORS.purple}
          />
          <Text style={styles.helperText}>
            Loading school statistics...
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          <StatCard
            title="Total Students"
            value={stats.students}
            icon="people-outline"
          />
          <StatCard
            title="Total Teachers"
            value={stats.teachers}
            icon="school-outline"
          />
          <StatCard
            title="Total Events"
            value={stats.events}
            icon="calendar-outline"
          />
          <StatCard
            title="Attendance Records"
            value={stats.attendance}
            icon="checkmark-done-outline"
          />
        </View>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons
            name="alert-circle-outline"
            size={21}
            color={COLORS.red}
          />
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>
              Unable to load statistics
            </Text>
            <Text style={styles.errorMessage}>
              {error}
            </Text>
          </View>
        </View>
      ) : null}

      {lastUpdated && !error ? (
        <Text style={styles.updatedText}>
          Last updated: {lastUpdated}
        </Text>
      ) : null}

    
      {/* School Attendance Analytics */}
      <View style={styles.analyticsPanel}>
        <View style={styles.analyticsHeadingRow}>
          <Ionicons
            name="stats-chart-outline"
            size={21}
            color={COLORS.purple}
          />
          <Text style={styles.analyticsTitle}>
            School Attendance Analytics
          </Text>
        </View>

        <Text style={styles.analyticsDescription}>
          School-wide • Based on recorded QR attendance scans
        </Text>

        {analyticsLoading ? (
          <View style={styles.analyticsLoadingRow}>
            <ActivityIndicator
              size="small"
              color={COLORS.purple}
            />
            <Text style={styles.helperText}>
              Loading attendance analytics...
            </Text>
          </View>
        ) : null}

        {analyticsError ? (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color={COLORS.red}
            />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Unable to load attendance analytics
              </Text>
              <Text style={styles.errorMessage}>
                {analyticsError}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  void loadSchoolAnalytics();
                }}
              >
                <Text style={styles.retryText}>
                  Try Again
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {!analyticsLoading &&
        !analyticsError &&
        analytics ? (
          <>
            <View style={styles.analyticsMetricRow}>
              <View style={styles.analyticsMetricCard}>
                <Text style={styles.analyticsMetricNumber}>
                  {analytics.uniqueStudents.toLocaleString()}
                </Text>
                <Text style={styles.analyticsMetricLabel}>
                  Unique students with scans
                </Text>
              </View>

              {!loading && !error ? (
                <View style={styles.analyticsMetricCard}>
                  <Text style={styles.analyticsMetricNumber}>
                    {averageScansPerEvent}
                  </Text>
                  <Text style={styles.analyticsMetricLabel}>
                    Avg. scans / event
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.analyticsChartTitle}>
              Scans in the last 7 days
            </Text>

            <View style={styles.analyticsTrendChart}>
              {analytics.dailyTrend.map((day) => (
                <View
                  key={day.key}
                  style={styles.analyticsTrendColumn}
                  accessibilityLabel={`${day.key}: ${day.scans} scans`}
                >
                  <Text style={styles.analyticsTrendCount}>
                    {day.scans}
                  </Text>

                  <View style={styles.analyticsTrendTrack}>
                    <View
                      style={[
                        styles.analyticsTrendBar,
                        {
                          height:
                            day.scans === 0
                              ? 0
                              : Math.max(
                                  8,
                                  Math.round(
                                    (104 * day.scans) /
                                      maxDailyScans
                                  )
                                ),
                        },
                      ]}
                    />
                  </View>

                  <Text style={styles.analyticsDayLabel}>
                    {day.label}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.analyticsNote}>
              Daily scan counts use your phone's local calendar dates.
            </Text>
          </>
        ) : null}

        {!eventsLoading && !eventsError ? (
          <>
            <Text style={styles.analyticsChartTitle}>
              Events by status
            </Text>

            {statusBreakdown.map((item) => (
              <View
                key={item.label}
                style={styles.analyticsStatusRow}
              >
                <Text style={styles.analyticsStatusLabel}>
                  {item.label}
                </Text>

                <View style={styles.analyticsStatusTrack}>
                  <View
                    style={[
                      styles.analyticsStatusBar,
                      {
                        backgroundColor: item.color,
                        width: `${Math.round(
                          (100 * item.count) /
                            maxStatusCount
                        )}%` as `${number}%`,
                      },
                    ]}
                  />
                </View>

                <Text style={styles.analyticsStatusCount}>
                  {item.count}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.analyticsNote}>
          Cancelled events retain their earlier attendance
          records. A true attendance percentage requires
          the expected number of students for each event.
        </Text>
      </View>

      {/* Teacher Account Management */}
      <View style={styles.manageUsersPanel}>
        <View style={styles.sectionHeader}>
          <View style={styles.eventsHeading}>
            <Text style={styles.sectionTitle}>
              Manage Teachers
            </Text>
            <Text style={styles.eventsSubtitle}>
              Approve Student accounts as Teachers or
              remove Teacher access
            </Text>
          </View>

          <Ionicons
            name="shield-checkmark-outline"
            size={23}
            color={COLORS.purple}
          />
        </View>

        <View style={styles.eventSearchBox}>
          <Ionicons
            name="search-outline"
            size={20}
            color={COLORS.muted}
          />

          <TextInput
            style={styles.eventSearchInput}
            value={profileSearch}
            onChangeText={(value) => {
              setProfileSearch(value);
              setVisibleProfileCount(USERS_PAGE_SIZE);
            }}
            placeholder="Search name, student ID, or account ID"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search Student and Teacher accounts"
          />

          {profileSearch.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setProfileSearch('');
                setVisibleProfileCount(USERS_PAGE_SIZE);
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear account search"
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={COLORS.muted}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.eventFilterRow}
        >
          {(
            [
              ['all', 'All Accounts'],
              ['student', 'Students'],
              ['teacher', 'Teachers'],
            ] as const
          ).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              onPress={() => {
                setProfileRoleFilter(value);
                setVisibleProfileCount(USERS_PAGE_SIZE);
              }}
              style={[
                styles.eventFilterChip,
                profileRoleFilter === value &&
                  styles.eventFilterChipSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{
                selected: profileRoleFilter === value,
              }}
            >
              <Text
                style={[
                  styles.eventFilterText,
                  profileRoleFilter === value &&
                    styles.eventFilterTextSelected,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {profilesLoading ? (
          <View style={styles.analyticsLoadingRow}>
            <ActivityIndicator
              size="small"
              color={COLORS.purple}
            />
            <Text style={styles.helperText}>
              Loading accounts...
            </Text>
          </View>
        ) : null}

        {profilesError ? (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color={COLORS.red}
            />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Unable to load accounts
              </Text>
              <Text style={styles.errorMessage}>
                {profilesError}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  void loadManagedProfiles();
                }}
              >
                <Text style={styles.retryText}>
                  Try Again
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {!profilesLoading && !profilesError ? (
          <Text style={styles.filterResultText}>
            {filteredProfiles.length} matching account
            {filteredProfiles.length === 1 ? '' : 's'}
          </Text>
        ) : null}

        {!profilesLoading &&
        !profilesError &&
        filteredProfiles.length === 0 ? (
          <View style={styles.emptyEvents}>
            <Ionicons
              name="people-outline"
              size={30}
              color={COLORS.purple}
            />
            <Text style={styles.helperText}>
              No matching Student or Teacher accounts.
            </Text>
          </View>
        ) : null}

        {!profilesLoading &&
        !profilesError &&
        visibleProfiles.map((profile) => {
          const isTeacherAccount =
            profile.role === 'teacher';

          const isChanging =
            changingProfileId === profile.id;

          const actionDisabled =
            changingProfileId !== null ||
            profile.id === user?.id;

          return (
            <View
              key={profile.id}
              style={styles.managedUserCard}
            >
              <View style={styles.managedUserHeading}>
                <View style={styles.managedUserDetails}>
                  <Text
                    style={styles.managedUserName}
                    numberOfLines={2}
                  >
                    {profile.full_name?.trim() ||
                      'Unnamed account'}
                  </Text>

                  <Text style={styles.managedUserMeta}>
                    Student ID: {profile.student_id ||
                      'Not provided'}
                  </Text>

                  <Text
                    style={styles.managedUserMeta}
                    numberOfLines={1}
                  >
                    Account: ...{profile.id.slice(-8)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.managedRolePill,
                    isTeacherAccount
                      ? styles.managedTeacherPill
                      : styles.managedStudentPill,
                  ]}
                >
                  <Text
                    style={[
                      styles.managedRoleText,
                      isTeacherAccount
                        ? styles.managedTeacherText
                        : styles.managedStudentText,
                    ]}
                  >
                    {isTeacherAccount
                      ? 'Teacher'
                      : 'Student'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.managedActionButton,
                  isTeacherAccount
                    ? styles.managedRemoveButton
                    : styles.managedApproveButton,
                  actionDisabled &&
                    styles.editDisabledButton,
                ]}
                disabled={actionDisabled}
                onPress={() =>
                  confirmSetTeacherRole(profile)
                }
                accessibilityRole="button"
                accessibilityLabel={
                  isTeacherAccount
                    ? `Remove Teacher access for ${profile.full_name || profile.id}`
                    : `Approve Teacher access for ${profile.full_name || profile.id}`
                }
              >
                {isChanging ? (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.white}
                  />
                ) : (
                  <Ionicons
                    name={
                      isTeacherAccount
                        ? 'person-remove-outline'
                        : 'person-add-outline'
                    }
                    size={18}
                    color={COLORS.white}
                  />
                )}

                <Text style={styles.managedActionText}>
                  {isChanging
                    ? 'Saving...'
                    : isTeacherAccount
                      ? 'Remove Teacher Access'
                      : 'Approve as Teacher'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {hasMoreProfiles &&
        !profilesLoading &&
        !profilesError ? (
          <TouchableOpacity
            style={styles.loadMoreButton}
            onPress={() =>
              setVisibleProfileCount(
                (count) => count + USERS_PAGE_SIZE
              )
            }
            accessibilityRole="button"
          >
            <Text style={styles.loadMoreText}>
              Load More Accounts
            </Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.managedUsersNote}>
          Only Administrators can approve Teachers.
          Changes are checked by Supabase. Existing
          events and attendance records are not deleted
          when a role changes.
        </Text>
      </View>

      
      {/* All School Events */}
      <View style={styles.eventsSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.eventsHeading}>
            <Text style={styles.sectionTitle}>
              All School Events
            </Text>
            <Text style={styles.eventsSubtitle}>
              Events created by teachers and administrators
            </Text>
          </View>

          <View style={styles.readOnlyPill}>
            <Ionicons
              name="eye-outline"
              size={14}
              color={COLORS.purple}
            />
            <Text style={styles.readOnlyText}>
              Admin management
            </Text>
          </View>
        </View>

        <View style={styles.eventSearchBox}>
          <Ionicons
            name="search-outline"
            size={20}
            color={COLORS.muted}
          />

          <TextInput
            style={styles.eventSearchInput}
            value={eventSearch}
            onChangeText={updateSearch}
            placeholder="Search title, event ID, or creator"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search all school events"
          />

          {eventSearch.length > 0 ? (
            <TouchableOpacity
              onPress={() => updateSearch('')}
              accessibilityRole="button"
              accessibilityLabel="Clear event search"
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={COLORS.muted}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.eventFilterRow}
        >
          {(
            [
              ['all', 'All'],
              ['upcoming', 'Upcoming'],
              ['active', 'Active'],
              ['ended', 'Ended'],
              ['cancelled', 'Cancelled'],
            ] as const
          ).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              onPress={() => updateStatusFilter(value)}
              style={[
                styles.eventFilterChip,
                eventStatusFilter === value &&
                  styles.eventFilterChipSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{
                selected: eventStatusFilter === value,
              }}
            >
              <Text
                style={[
                  styles.eventFilterText,
                  eventStatusFilter === value &&
                    styles.eventFilterTextSelected,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!eventsLoading && !eventsError ? (
          <Text style={styles.filterResultText}>
            {filteredEvents.length} matching event
            {filteredEvents.length === 1 ? '' : 's'}
            {eventSearch.trim() ||
            eventStatusFilter !== 'all'
              ? ' (filtered)'
              : ''}
          </Text>
        ) : null}

        {eventsError ? (
          <View style={styles.errorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color={COLORS.red}
            />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Unable to load school events
              </Text>
              <Text style={styles.errorMessage}>
                {eventsError}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  void loadSchoolEvents();
                }}
              >
                <Text style={styles.retryText}>
                  Try Again
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {eventsLoading &&
        schoolEvents.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator
              size="large"
              color={COLORS.purple}
            />
            <Text style={styles.helperText}>
              Loading school events...
            </Text>
          </View>
        ) : null}

        {!eventsLoading &&
        !eventsError &&
        filteredEvents.length === 0 ? (
          <View style={styles.emptyEvents}>
            <Ionicons
              name="calendar-outline"
              size={30}
              color={COLORS.purple}
            />
            <Text style={styles.helperText}>
              {schoolEvents.length === 0
                ? 'No school events found.'
                : 'No events match your search or status filter.'}
            </Text>
          </View>
        ) : null}

        {!eventsLoading &&
        !eventsError &&
        visibleEvents.map((event) => {
          const status = getEventStatus(event);

          return (
            <View
              key={event.event_id}
              style={styles.schoolEventCard}
            >
              <View style={styles.schoolEventTop}>
                <Text
                  style={styles.schoolEventTitle}
                  numberOfLines={2}
                >
                  {event.title}
                </Text>

                <View
                  style={[
                    styles.eventStatus,
                    {
                      backgroundColor: status.bg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.eventStatusText,
                      { color: status.color },
                    ]}
                  >
                    {status.label}
                  </Text>
                </View>
              </View>

              <Text style={styles.schoolEventId}>
                {event.event_id}
              </Text>

              <View style={styles.eventInfoRow}>
                <Ionicons
                  name="person-outline"
                  size={16}
                  color={COLORS.purple}
                />
                <Text style={styles.eventInfoText}>
                  Created by: {event.creatorName} ({event.creatorRole})
                </Text>
              </View>

              <View style={styles.eventInfoRow}>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={COLORS.muted}
                />
                <Text style={styles.eventInfoText}>
                  Start: {formatEventDate(event.start_time)}
                </Text>
              </View>

              <View style={styles.eventInfoRow}>
                <Ionicons
                  name="flag-outline"
                  size={16}
                  color={COLORS.muted}
                />
                <Text style={styles.eventInfoText}>
                  End: {formatEventDate(event.end_time)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.editEventButton}
                onPress={() => openEditEvent(event)}
                accessibilityRole="button"
                accessibilityLabel={`Edit event ${event.title}`}
              >
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={COLORS.purple}
                />
                <Text style={styles.editEventButtonText}>
                  Edit Event Title
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.editEventButton}
                onPress={() =>
                  openScheduleEditor(event)
                }
                accessibilityRole="button"
                accessibilityLabel={`Edit schedule for ${event.title}`}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={COLORS.purple}
                />
                <Text style={styles.editEventButtonText}>
                  Edit Schedule
                </Text>
              </TouchableOpacity>

              {event.status !== 'cancelled' ? (
                <TouchableOpacity
                  style={styles.cancelEventButton}
                  onPress={() =>
                    confirmCancelEvent(event)
                  }
                  disabled={
                    cancellingEventId !== null
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel ${event.title} and preserve attendance`}
                >
                  {cancellingEventId ===
                  event.event_id ? (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.red}
                    />
                  ) : (
                    <Ionicons
                      name="close-circle-outline"
                      size={18}
                      color={COLORS.red}
                    />
                  )}

                  <Text style={styles.cancelEventButtonText}>
                    {cancellingEventId ===
                    event.event_id
                      ? 'Cancelling...'
                      : 'Cancel Event (Keep Attendance)'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.viewAttendanceButton}
                onPress={() =>
                  openEventAttendance(event)
                }
                accessibilityRole="button"
                accessibilityLabel={`View attendance for ${event.title}`}
              >
                <Ionicons
                  name="people-outline"
                  size={18}
                  color={COLORS.white}
                />
                <Text style={styles.viewAttendanceText}>
                  View Attendance
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.white}
                />
              </TouchableOpacity>
            </View>
          );
        })}

        {hasMoreFilteredEvents &&
        !eventsLoading &&
        !eventsError ? (
          <TouchableOpacity
            style={styles.loadMoreButton}
            onPress={() =>
              setVisibleEventCount(
                (count) =>
                  count + EVENTS_PAGE_SIZE
              )
            }
            accessibilityRole="button"
          >
            <Text style={styles.loadMoreText}>
              Load More Events
            </Text>
          </TouchableOpacity>
        ) : null}

        {!eventsLoading &&
        !eventsError &&
        schoolEvents.length > 0 ? (
          <Text style={styles.eventListCount}>
            Showing {visibleEvents.length} of{' '}
            {filteredEvents.length} matching events
            {' • '}
            {schoolEvents.length} total school events
          </Text>
        ) : null}
      </View>

      {/* Administrator information */}
      <View style={styles.infoCard}>
        <Ionicons
          name="information-circle-outline"
          size={24}
          color={COLORS.purple}
        />

        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>
            Administrator Overview
          </Text>

          <Text style={styles.infoDescription}>
            View school-wide events here. To create QR
            codes and manage your own events, use the
            Events tab. Administrators can edit
            school-wide event titles and schedules
            here. Event IDs and creators are protected.
            Cross-owner deletion is not enabled yet.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// Reusable school statistics card
type StatCardProps = {
  title: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
};

function StatCard({
  title,
  value,
  icon,
}: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Ionicons
          name={icon}
          size={24}
          color={COLORS.purple}
        />
      </View>

      <Text style={styles.statValue}>
        {value.toLocaleString()}
      </Text>

      <Text style={styles.statTitle}>
        {title}
      </Text>
    </View>
  );
}


const styles = StyleSheet.create({
  manageUsersPanel: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 24,
  },
  managedUserCard: {
    backgroundColor: '#FBFAFF',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 11,
  },
  managedUserHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 9,
    marginBottom: 12,
  },
  managedUserDetails: {
    flex: 1,
    minWidth: 0,
  },
  managedUserName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 5,
  },
  managedUserMeta: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  managedRolePill: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  managedTeacherPill: {
    backgroundColor: '#E5F6EE',
  },
  managedStudentPill: {
    backgroundColor: '#EEE9FF',
  },
  managedRoleText: {
    fontSize: 11,
    fontWeight: '800',
  },
  managedTeacherText: {
    color: '#16815A',
  },
  managedStudentText: {
    color: COLORS.purple,
  },
  managedActionButton: {
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  managedApproveButton: {
    backgroundColor: '#16815A',
  },
  managedRemoveButton: {
    backgroundColor: COLORS.red,
  },
  managedActionText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  managedUsersNote: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 14,
  },

  // Analytics dashboard
  analyticsPanel: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginTop: 24,
    marginBottom: 24,
  },
  analyticsHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  analyticsTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    flexShrink: 1,
  },
  analyticsDescription: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 7,
    marginBottom: 15,
  },
  analyticsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  analyticsMetricRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 19,
  },
  analyticsMetricCard: {
    flex: 1,
    backgroundColor: '#EEE9FF',
    borderRadius: 13,
    padding: 14,
  },
  analyticsMetricNumber: {
    color: '#352080',
    fontSize: 23,
    fontWeight: '800',
  },
  analyticsMetricLabel: {
    color: '#352080',
    fontSize: 11,
    marginTop: 5,
  },
  analyticsChartTitle: {
    color: COLORS.text,
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
    color: COLORS.muted,
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
    backgroundColor: COLORS.purple,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  analyticsDayLabel: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 7,
  },
  analyticsNote: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 12,
  },
  analyticsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  analyticsStatusLabel: {
    color: COLORS.text,
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
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '800',
    width: 26,
    textAlign: 'right',
  },

  // Screen layout
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },

  // QRR KOP purple hero header
  header: {
    backgroundColor: COLORS.purple,
    borderRadius: 25,
    padding: 23,
    marginBottom: 28,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#352080',
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
  },
  headerDecoration: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: -100,
    top: -95,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#E3D9FF',
    marginBottom: 9,
  },
  title: {
    fontSize: 27,
    fontWeight: '900',
    color: COLORS.white,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 21,
    color: '#EAE4FF',
    marginTop: 8,
    maxWidth: 310,
  },
  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.17)',
  },
  adminBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  // Statistics
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: 7,
  },
  refreshText: {
    color: COLORS.purple,
    fontSize: 13,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  statCard: {
    width: '48%',
    minHeight: 155,
    backgroundColor: COLORS.white,
    borderRadius: 21,
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 1,
    shadowColor: '#352080',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },
  statIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: '#F0EBFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  statValue: {
    fontSize: 27,
    fontWeight: '800',
    color: COLORS.text,
  },
  statTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    marginTop: 5,
  },

  // Loading, errors and information
  loadingBox: {
    padding: 45,
    alignItems: 'center',
  },
  helperText: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 12,
  },
  accessDenied: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.red,
    marginTop: 15,
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF0F0',
    borderRadius: 14,
    padding: 15,
    marginTop: 18,
    gap: 10,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontWeight: '800',
    color: COLORS.red,
    marginBottom: 4,
  },
  errorMessage: {
    color: COLORS.red,
    fontSize: 12,
  },
  updatedText: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 16,
    textAlign: 'right',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EDE8FF',
    borderRadius: 18,
    padding: 17,
    marginTop: 25,
    gap: 12,
  },

 
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  infoDescription: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 20,
  },

  // School events section
  eventsSection: {
    marginTop: 28,
  },
  eventsHeading: {
    flex: 1,
    paddingRight: 10,
  },
  eventsSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 5,
  },
  readOnlyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EDE8FF',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  readOnlyText: {
    color: COLORS.purple,
    fontWeight: '700',
    fontSize: 11,
  },
  eventSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 13,
    minHeight: 49,
    marginBottom: 12,
    gap: 8,
  },
  eventSearchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 10,
  },
  eventFilterRow: {
    gap: 9,
    paddingBottom: 8,
  },
  eventFilterChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  eventFilterChipSelected: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  eventFilterText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  eventFilterTextSelected: {
    color: COLORS.white,
  },
  filterResultText: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 12,
  },

  // Event cards
  schoolEventCard: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 17,
    padding: 16,
    marginBottom: 12,
  },
  schoolEventTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  schoolEventTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  schoolEventId: {
    color: COLORS.purple,
    fontWeight: '700',
    fontSize: 12,
    marginTop: 5,
    marginBottom: 13,
  },
  eventStatus: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  eventStatusText: {
    fontWeight: '800',
    fontSize: 11,
  },
  eventInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 7,
  },
  eventInfoText: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
  },

  // Pagination and empty states
  loadMoreButton: {
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#EDE8FF',
    borderRadius: 13,
    marginTop: 5,
  },
  loadMoreText: {
    color: COLORS.purple,
    fontWeight: '800',
  },
  eventListCount: {
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 12,
    marginTop: 12,
  },
  emptyEvents: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },

  // Event editing
  editEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: COLORS.purple,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 15,
  },
  editEventButtonText: {
    color: COLORS.purple,
    fontSize: 13,
    fontWeight: '800',
  },
  scheduleGroupLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 23,
    marginBottom: 10,
  },
  schedulePickerRow: {
    flexDirection: 'row',
    gap: 9,
  },
  schedulePickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 8,
  },
  schedulePickerButtonText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  editFieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.muted,
    marginBottom: 6,
    marginTop: 13,
  },
  editReadonlyValue: {
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 4,
  },
  editTitleInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  editHint: {
    textAlign: 'right',
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 5,
  },
  editNotice: {
    flexDirection: 'row',
    gap: 9,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EDE8FF',
    marginTop: 20,
  },
  editNoticeText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 19,
  },
  editSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 12,
    backgroundColor: COLORS.purple,
    padding: 15,
    marginTop: 16,
  },
  editDisabledButton: {
    opacity: 0.6,
  },
  editCancelButton: {
    alignItems: 'center',
    padding: 15,
    marginTop: 8,
  },

  // Event cancellation
  cancelEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#F6C6C1',
    backgroundColor: '#FDECEA',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  cancelEventButtonText: {
    color: COLORS.red,
    fontSize: 13,
    fontWeight: '800',
  },

  // Attendance viewing
  viewAttendanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.purple,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 15,
  },
  viewAttendanceText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  attendanceBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    marginBottom: 14,
  },
  attendanceBackText: {
    color: COLORS.purple,
    fontWeight: '800',
    fontSize: 15,
  },
  attendanceHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 16,
  },
  attendanceCount: {
    color: COLORS.purple,
    fontWeight: '800',
    backgroundColor: '#EDE8FF',
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  attendeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    marginBottom: 10,
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 15,
  },
  attendeeIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#EDE8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeDetails: {
    flex: 1,
  },
  attendeeName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  attendeeMeta: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
  },

  // CSV export
  exportCsvButton: {
    backgroundColor: '#16815A',
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
  },
  exportCsvDisabled: {
    opacity: 0.6,
  },
  exportCsvText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  attendanceRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    padding: 14,
    backgroundColor: '#EDE8FF',
    borderRadius: 13,
  },
  retryText: {
    color: COLORS.purple,
    fontWeight: '800',
    marginTop: 10,
  },
});

