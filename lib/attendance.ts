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

  const now = Date.now();

  const start = payload.start
    ? new Date(payload.start).getTime()
    : null;

  const end = payload.end
    ? new Date(payload.end).getTime()
    : null;

  if (start && now < start) {
    return {
      success: false,
      message: 'Event has not started yet.',
    };
  }

  if (end && now > end) {
    return {
      success: false,
      message: 'Event has already ended.',
    };
  }

  const event = await getEventByCode(payload.event);

  if (!event) {
    return {
      success: false,
      message: 'Event not found.',
      eventTitle: payload.title ?? payload.event,
    };
  }

  const eventTitle = event.title;

  const { error } = await supabase
    .from('attendance')
    .insert({
      student_id: studentId,
      event_id: event.event_id,
      scanned_at: new Date().toISOString(),
    });

  if (error) {
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

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
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
    .order('scanned_at', {
      ascending: false,
    });

  if (error) {
    console.error(
      'Error loading attendance history:',
      error
    );

    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.events?.title ?? row.event_id,
    scannedAt: row.scanned_at,
  }));
}

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherAttendanceRecord[]> {
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('event_id, title')
    .eq('created_by', teacherId);

  if (eventsError) {
    console.error(
      'Error loading teacher events:',
      eventsError
    );

    return [];
  }

  if (!events || events.length === 0) {
    return [];
  }

  const eventIds = events.map((event) => event.event_id);

  const { data: attendanceRows, error: attendanceError } =
    await supabase
      .from('attendance')
      .select(`
        id,
        event_id,
        student_id,
        scanned_at
      `)
      .in('event_id', eventIds)
      .order('scanned_at', {
        ascending: false,
      });

  if (attendanceError) {
    console.error(
      'Error loading teacher attendance:',
      attendanceError
    );

    return [];
  }

  const studentIds = [
    ...new Set(
      (attendanceRows ?? []).map((row) => row.student_id)
    ),
  ];

  let profiles: any[] = [];

  if (studentIds.length > 0) {
    const { data: profileRows, error: profileError } =
      await supabase
        .from('profiles')
        .select('id, full_name, student_id')
        .in('id', studentIds);

    if (profileError) {
      console.error(
        'Error loading attendee profiles:',
        profileError
      );
    } else {
      profiles = profileRows ?? [];
    }
  }

  return (attendanceRows ?? []).map((row: any) => {
    const event = events.find(
      (item) => item.event_id === row.event_id
    );

    const profile = profiles.find(
      (item) => item.id === row.student_id
    );

    return {
      id: row.id,
      eventId: row.event_id,
      eventTitle: event?.title ?? row.event_id,
      studentId: row.student_id,
      studentName:
        profile?.full_name ?? 'Unknown student',
      studentNumber: profile?.student_id ?? null,
      scannedAt: row.scanned_at,
    };
  });
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('event_id, title')
    .eq('created_by', teacherId)
    .order('created_at', {
      ascending: false,
    });

  if (eventsError) {
    console.error(
      'Error loading teacher event summary:',
      eventsError
    );

    return [];
  }

  if (!events || events.length === 0) {
    return [];
  }

  const eventIds = events.map((event) => event.event_id);

  const { data: attendanceRows, error: attendanceError } =
    await supabase
      .from('attendance')
      .select('event_id')
      .in('event_id', eventIds);

  if (attendanceError) {
    console.error(
      'Error loading attendance counts:',
      attendanceError
    );

    return [];
  }

  const counts: Record<string, number> = {};

  (attendanceRows ?? []).forEach((row: any) => {
    counts[row.event_id] =
      (counts[row.event_id] ?? 0) + 1;
  });

  return events.map((event) => ({
    eventId: event.event_id,
    eventCode: event.event_id,
    title: event.title,
    attendeeCount: counts[event.event_id] ?? 0,
  }));
}