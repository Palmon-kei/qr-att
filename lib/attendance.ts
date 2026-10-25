import { supabase } from './supabase';
import { getEventByCode } from './events';
import { parseQRPayload } from './qr';

export type AttendanceRecord = {
  id: number;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

export type TeacherAttendanceRecord = {
  id: number;
  eventId: string;
  eventTitle: string;
  studentId: string;
  studentName: string;
  studentNumber: string | null;
  scannedAt: string;
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);

  if (!parsed.ok) {
    return {
      success: false,
      message: parsed.message,
    };
  }

  const payload = parsed.payload;

  // The QR code identifies the event, but its embedded title and times
  // may be outdated after an administrator changes the event schedule.
  // Always validate against the latest event record in Supabase.
  const event = await getEventByCode(payload.event);

  if (!event) {
    return {
      success: false,
      message: 'Event not found.',
      eventTitle: payload.title ?? payload.event,
    };
  }

  const eventTitle = event.title;

  // Always use the live event status, not information embedded in the QR.
  // Old QR codes for cancelled events must not register attendance.
  if (event.status === 'cancelled') {
    return {
      success: false,
      message: 'This event has been cancelled. Attendance is no longer accepted.',
      eventTitle,
    };
  }

  const now = Date.now();
  const start = new Date(event.start_time).getTime();
  const end = new Date(event.end_time).getTime();

  // Fail closed if the stored schedule is missing or invalid.
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      success: false,
      message: 'Event schedule is invalid. Please contact the event organizer.',
      eventTitle,
    };
  }

  if (now < start) {
    return {
      success: false,
      message: 'Event has not started yet.',
      eventTitle,
    };
  }

  if (now > end) {
    return {
      success: false,
      message: 'Event has already ended.',
      eventTitle,
    };
  }

  const { error } = await supabase
    .from('attendance')
    .insert({
      student_id: studentId,
      event_id: event.event_id,
      scanned_at: new Date().toISOString(),
    });

  if (error) {
    // A teacher might cancel the event after we fetch its status but
    // before the insert. The database trigger is the final authority.
    if (error.message?.toLowerCase().includes('event has been cancelled')) {
      return {
        success: false,
        message: 'This event has been cancelled. Attendance is no longer accepted.',
        eventTitle,
      };
    }

    if (error.code === '23505') {
      return {
        success: false,
        message: 'Already registered for this event.',
        eventTitle,
      };
    }

    return {
      success: false,
      message: error.message,
      eventTitle,
    };
  }

  return {
    success: true,
    message: 'Attendance recorded!',
    eventTitle,
  };
}

// Keep each request below Supabase's common 1,000-row response limit.
// Paging is read-only and does not change stored attendance.
const REPORT_PAGE_SIZE = 500;
const REPORT_ID_BATCH_SIZE = 100;

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const history: AttendanceRecord[] = [];

  for (let offset = 0; ; offset += REPORT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        event_id,
        scanned_at,
        events (
          title
        )
      `)
      .eq('student_id', studentId)
      .order('scanned_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + REPORT_PAGE_SIZE - 1);

    if (error) {
      console.error('Error loading attendance history:', error);
      throw new Error(
        'Unable to load attendance history. Please check your connection and try again.'
      );
    }

    const page = data ?? [];
    history.push(...page.map((row: any) => ({
      id: row.id,
      eventId: row.event_id,
      eventTitle: row.events?.title ?? row.event_id,
      scannedAt: row.scanned_at,
    })));

    if (page.length < REPORT_PAGE_SIZE) break;
  }

  return history;
}

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherAttendanceRecord[]> {
  // Retrieve every event, not just the first page.
  const events: { event_id: string; title: string }[] = [];

  for (let offset = 0; ; offset += REPORT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('events')
      .select('event_id, title')
      .eq('created_by', teacherId)
      .order('event_id', { ascending: true })
      .range(offset, offset + REPORT_PAGE_SIZE - 1);

    if (error) {
      console.error('Error loading teacher events:', error);
      return [];
    }

    const page = data ?? [];
    events.push(...page);
    if (page.length < REPORT_PAGE_SIZE) break;
  }

  if (events.length === 0) return [];

  type AttendanceRow = {
    id: number;
    event_id: string;
    student_id: string;
    scanned_at: string;
  };
  const attendanceRows: AttendanceRow[] = [];
  const eventIds = events.map((event) => event.event_id);

  // Limit .in() filters to small batches and page each batch separately.
  for (let index = 0; index < eventIds.length; index += REPORT_ID_BATCH_SIZE) {
    const eventBatch = eventIds.slice(index, index + REPORT_ID_BATCH_SIZE);

    for (let offset = 0; ; offset += REPORT_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('attendance')
        .select('id, event_id, student_id, scanned_at')
        .in('event_id', eventBatch)
        .order('scanned_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + REPORT_PAGE_SIZE - 1);

      if (error) {
        console.error('Error loading teacher attendance:', error);
        return [];
      }

      const page = (data ?? []) as AttendanceRow[];
      attendanceRows.push(...page);
      if (page.length < REPORT_PAGE_SIZE) break;
    }
  }

  // Restore the same newest-first ordering across all event batches.
  attendanceRows.sort((a, b) =>
    b.scanned_at.localeCompare(a.scanned_at) || b.id - a.id
  );

  const studentIds = [...new Set(attendanceRows.map((row) => row.student_id))];
  const profileById = new Map<
    string,
    { full_name: string | null; student_id: string | null }
  >();

  for (let index = 0; index < studentIds.length; index += REPORT_ID_BATCH_SIZE) {
    const batch = studentIds.slice(index, index + REPORT_ID_BATCH_SIZE);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, student_id')
      .in('id', batch);

    if (error) {
      // Preserve the previous behavior: attendance remains visible even if
      // attendee profile names cannot be loaded.
      console.error('Error loading attendee profiles:', error);
    } else {
      for (const profile of data ?? []) {
        profileById.set(profile.id, {
          full_name: profile.full_name,
          student_id: profile.student_id,
        });
      }
    }
  }

  const eventTitleById = new Map(events.map((event) => [event.event_id, event.title]));

  return attendanceRows.map((row) => {
    const profile = profileById.get(row.student_id);
    return {
      id: row.id,
      eventId: row.event_id,
      eventTitle: eventTitleById.get(row.event_id) ?? row.event_id,
      studentId: row.student_id,
      studentName: profile?.full_name ?? 'Unknown student',
      studentNumber: profile?.student_id ?? null,
      scannedAt: row.scanned_at,
    };
  });
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const events: { event_id: string; title: string }[] = [];

  for (let offset = 0; ; offset += REPORT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('events')
      .select('event_id, title')
      .eq('created_by', teacherId)
      .order('created_at', { ascending: false })
      .order('event_id', { ascending: true })
      .range(offset, offset + REPORT_PAGE_SIZE - 1);

    if (error) {
      console.error('Error loading teacher event summary:', error);
      return [];
    }

    const page = data ?? [];
    events.push(...page);
    if (page.length < REPORT_PAGE_SIZE) break;
  }

  if (events.length === 0) return [];

  const eventIds = events.map((event) => event.event_id);
  const counts: Record<string, number> = {};

  for (let index = 0; index < eventIds.length; index += REPORT_ID_BATCH_SIZE) {
    const eventBatch = eventIds.slice(index, index + REPORT_ID_BATCH_SIZE);

    for (let offset = 0; ; offset += REPORT_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('attendance')
        .select('id, event_id')
        .in('event_id', eventBatch)
        .order('id', { ascending: true })
        .range(offset, offset + REPORT_PAGE_SIZE - 1);

      if (error) {
        console.error('Error loading attendance counts:', error);
        return [];
      }

      const page = data ?? [];
      page.forEach((row) => {
        counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
      });

      if (page.length < REPORT_PAGE_SIZE) break;
    }
  }

  return events.map((event) => ({
    eventId: event.event_id,
    eventCode: event.event_id,
    title: event.title,
    attendeeCount: counts[event.event_id] ?? 0,
  }));
}

/**
 * Administrator-only read of attendees for any event.
 * Database RLS remains the authoritative access-control boundary.
 * This function does not create, update, or delete attendance records.
 */
export async function getAdminEventAttendance(
  eventId: string
): Promise<TeacherAttendanceRecord[]> {
  const trimmedEventId = eventId.trim();
  if (!trimmedEventId) {
    throw new Error('An Event ID is required.');
  }

  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new Error('You must be signed in.');
  }

  const { data: currentProfile, error: roleError } =
    await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single();

  if (roleError || currentProfile?.role !== 'admin') {
    throw new Error('Administrator access is required.');
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('event_id, title')
    .eq('event_id', trimmedEventId)
    .single();

  if (eventError || !event) {
    throw new Error(eventError?.message ?? 'Event not found.');
  }

  // Fetch in pages so events with over 1,000 attendees are not truncated.
  type AttendanceRow = {
    id: number;
    event_id: string;
    student_id: string;
    scanned_at: string;
  };
  const attendanceRows: AttendanceRow[] = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('attendance')
      .select('id, event_id, student_id, scanned_at')
      .eq('event_id', trimmedEventId)
      .order('scanned_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Unable to load event attendance: ${error.message}`);
    }

    const page = (data ?? []) as AttendanceRow[];
    attendanceRows.push(...page);
    if (page.length < pageSize) break;
  }

  if (attendanceRows.length === 0) return [];

  const studentIds = [...new Set(attendanceRows.map((row) => row.student_id))];
  const profileById = new Map<
    string,
    { full_name: string | null; student_id: string | null }
  >();

  for (let index = 0; index < studentIds.length; index += 100) {
    const chunk = studentIds.slice(index, index + 100);
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, student_id')
      .in('id', chunk);

    if (error) {
      throw new Error(`Unable to load attendee names: ${error.message}`);
    }

    for (const profile of profiles ?? []) {
      profileById.set(profile.id, {
        full_name: profile.full_name,
        student_id: profile.student_id,
      });
    }
  }

  return attendanceRows.map((row) => {
    const profile = profileById.get(row.student_id);
    return {
      id: row.id,
      eventId: row.event_id,
      eventTitle: event.title,
      studentId: row.student_id,
      studentName: profile?.full_name ?? 'Unknown student',
      studentNumber: profile?.student_id ?? null,
      scannedAt: row.scanned_at,
    };
  });
}
