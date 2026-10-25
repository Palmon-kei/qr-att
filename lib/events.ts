
import { supabase } from './supabase';

export type EventStatus = 'active' | 'cancelled';

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};

export type CloudEvent = {
  event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  created_by: string | null;
  created_at: string;
  status: EventStatus;
};

const EVENT_COLUMNS =
  'event_id, title, start_time, end_time, created_by, created_at, status';

export async function createEvent(event: Event): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error('You must be signed in to create an event.');
  }

  const { error } = await supabase.from('events').insert({
    event_id: event.eventId,
    title: event.title,
    start_time: event.start,
    end_time: event.end,
    created_by: userId,
    status: 'active',
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading teacher events:', error);
    throw new Error('Unable to load teacher events.');
  }

  return (data ?? []) as CloudEvent[];
}

export async function getEventByCode(
  eventCode: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('event_id', eventCode)
    .maybeSingle();

  if (error) {
    console.error('Error loading event:', error);
    throw new Error('Unable to load event details.');
  }

  return data as CloudEvent | null;
}

/**
 * Administrators can edit event schedules.
 * The event ID and creator are never modified.
 */
export async function updateAdminEventSchedule(
  eventId: string,
  start: string,
  end: string
): Promise<void> {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new Error('Event ID is required.');
  }

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error('Please choose valid start and end dates.');
  }

  if (endMs <= startMs) {
    throw new Error('End time must be later than start time.');
  }

  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new Error('You must be signed in to edit an event.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error('Unable to verify administrator access.');
  }

  if (profile?.role !== 'admin') {
    throw new Error(
      'Only administrators can change school event schedules.'
    );
  }

  const { data, error } = await supabase
    .from('events')
    .update({
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
    })
    .eq('event_id', normalizedEventId)
    .select('event_id');

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error(
      'Event not found, or you do not have permission to edit it.'
    );
  }
}

/**
 * Cancel an event without deleting attendance records.
 *
 * Administrators can cancel any event.
 * Teachers can cancel only events they created.
 *
 * Supabase RLS provides the final authorization check.
 */
export async function cancelEvent(
  eventId: string
): Promise<void> {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new Error('Event ID is required.');
  }

  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new Error('You must be signed in to cancel an event.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error('Unable to verify your account role.');
  }

  const role = profile?.role;

  if (role !== 'teacher' && role !== 'admin') {
    throw new Error(
      'Only teachers and administrators can cancel events.'
    );
  }

  let query = supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('event_id', normalizedEventId)
    .eq('status', 'active');

  if (role === 'teacher') {
    query = query.eq('created_by', authData.user.id);
  }

  const { data, error } = await query.select('event_id');

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error(
      'Event not found, already cancelled, or you do not have permission to cancel it.'
    );
  }
}

/**
 * Permanently delete an event owned by the teacher.
 *
 * WARNING:
 * Existing database foreign keys may cascade this deletion
 * to linked attendance records.
 *
 * This function is retained for compatibility with the
 * current application. Prefer cancellation when records
 * must be preserved.
 */
export async function deleteEvent(
  eventId: string
): Promise<void> {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new Error('Event ID is required.');
  }

  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new Error('You must be signed in to delete an event.');
  }

  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('event_id', normalizedEventId)
    .eq('created_by', authData.user.id)
    .select('event_id');

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error(
      'Event not found, or you do not have permission to delete it.'
    );
  }
}
