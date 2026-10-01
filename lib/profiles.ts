import { supabase } from './supabase';

export type Role = 'student' | 'teacher';

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  student_id: string | null;
  created_at: string;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, student_id, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error loading profile:', error);
    return null;
  }

  return data as Profile | null;
}

export async function updateProfile(
  userId: string,
  updates: {
    full_name?: string | null;
    student_id?: string | null;
  }
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, full_name, role, student_id, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile;
}

export async function ensureProfile(userId: string): Promise<Profile | null> {
  const existing = await getProfile(userId);

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      role: 'student',
    })
    .select('id, full_name, role, student_id, created_at')
    .single();

  if (error) {
    console.error('Error creating profile:', error);
    return null;
  }

  return data as Profile;
}