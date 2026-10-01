import { supabase } from './supabase';

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
};

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

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'event_id, title, start_time, end_time, created_by, created_at'
    )
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading teacher events:', error);
    return [];
  }

  return (data ?? []) as CloudEvent[];
}

export async function getEventByCode(
  eventCode: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'event_id, title, start_time, end_time, created_by, created_at'
    )
    .eq('event_id', eventCode)
    .maybeSingle();

  if (error) {
    console.error('Error loading event:', error);
    return null;
  }

  return data as CloudEvent | null;
}