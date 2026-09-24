import { supabase } from './supabase';

export type AttendanceRecord = {
  id: number;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};

type EventPayload = {
  v: number;
  event: string;
  title?: string;
  start?: string;
  end?: string;
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
  let payload: EventPayload;

  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return { success: false, message: 'Invalid QR code.' };
  }

  if (payload.v !== 1 || !payload.event) {
    return { success: false, message: 'Not an attendance QR code.' };
  }

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

  const title = payload.title ?? payload.event;

  // Make sure the event exists in Supabase.
  const { error: eventError } = await supabase
    .from('events')
    .upsert({
      event_id: payload.event,
      title,
      start_time: payload.start ?? new Date().toISOString(),
      end_time:
        payload.end ??
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

  if (eventError) {
    return {
      success: false,
      message: eventError.message,
      eventTitle: title,
    };
  }

  // Record attendance.
  const { error: attendanceError } = await supabase
    .from('attendance')
    .insert({
      student_id: studentId,
      event_id: payload.event,
      scanned_at: new Date().toISOString(),
    });

  if (attendanceError) {
    if (attendanceError.code === '23505') {
      return {
        success: false,
        message: 'Already registered for this event.',
        eventTitle: title,
      };
    }

    return {
      success: false,
      message: attendanceError.message,
      eventTitle: title,
    };
  }

  return {
    success: true,
    message: 'Attendance recorded!',
    eventTitle: title,
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
    .order('scanned_at', { ascending: false });

  if (error) {
    console.error('Error loading attendance history:', error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.events?.title ?? row.event_id,
    scannedAt: row.scanned_at,
  }));
}

export async function createEvent(event: Event): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error('You must be signed in to create an event.');
  }

  const { error } = await supabase
    .from('events')
    .insert({
      event_id: event.eventId,
      title: event.title,
      start_time: event.start,
      end_time: event.end,
      created_by: userId,
    });

  if (error) {
    throw new Error(error.message);
  }
}