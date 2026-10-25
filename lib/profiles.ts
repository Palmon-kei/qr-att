
import { supabase } from './supabase';

// QRR KOP supports three user roles.
export type Role = 'student' | 'teacher' | 'admin';

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  student_id: string | null;
  created_at: string;
};

// Load a user's profile from Supabase.
export async function getProfile(
  userId: string
): Promise<Profile | null> {
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

// Get the user's assigned role.
export async function getUserRole(
  userId: string
): Promise<Role | null> {
  const profile = await getProfile(userId);

  if (!profile) {
    return null;
  }

  return profile.role;
}

// Check whether a user is a Teacher.
export async function isTeacher(
  userId: string
): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'teacher';
}

// Check whether a user is an Admin.
export async function isAdmin(
  userId: string
): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'admin';
}

// Update editable profile information.
// Role changes are intentionally not allowed here.
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

// Ensure a user has a profile.
// New profiles default to Student.
// Existing Admin and Teacher roles are preserved.
export async function ensureProfile(
  userId: string
): Promise<Profile | null> {
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
