import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = false;
let listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((l) => l());
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  notify();
}

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
  };
}

async function ensureProfile(user: User) {
  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        role: 'student',
      },
      {
        onConflict: 'id',
      }
    );

  return error;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { data, error };
  }

  // If Supabase immediately gives us a session,
  // create the profile now.
  if (data.user && data.session) {
    const profileError = await ensureProfile(data.user);

    if (profileError) {
      return {
        data,
        error: profileError,
      };
    }

    setAuth(data.session);
  }

  return { data, error: null };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { data, error };
  }

  if (data.user && data.session) {
    const profileError = await ensureProfile(data.user);

    if (profileError) {
      return {
        data,
        error: profileError,
      };
    }

    setAuth(data.session);
  }

  return { data, error: null };
}

export async function signOut() {
  setAuth(null);
  supabase.auth.signOut().catch(() => {});
  return { error: null };
}