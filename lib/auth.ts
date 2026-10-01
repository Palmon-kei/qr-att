import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { ensureProfile } from './profiles';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = true;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
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
    const listener = () => {
      forceRender((value) => value + 1);
    };

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

export async function initializeAuth() {
  globalLoading = true;
  notify();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error loading authentication session:', error);
    setAuth(null);
    return;
  }

  if (data.session?.user) {
    await ensureProfile(data.session.user.id);
  }

  setAuth(data.session);
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { data, error };
  }

  if (data.session?.user) {
    await ensureProfile(data.session.user.id);
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

  if (data.session?.user) {
    await ensureProfile(data.session.user.id);
    setAuth(data.session);
  }

  return { data, error: null };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  setAuth(null);

  return { error };
}