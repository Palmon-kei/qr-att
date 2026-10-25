import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from './supabase';
import { ensureProfile } from './profiles';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  setSession: (session: Session | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const setSession = (newSession: Session | null) => {
    setSessionState(newSession);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) {
          return;
        }

        if (error) {
          console.error(
            'Error loading authentication session:',
            error
          );

          setSessionState(null);
          setLoading(false);
          return;
        }

        if (data.session?.user) {
          await ensureProfile(data.session.user.id);
        }

        if (!active) {
          return;
        }

        setSessionState(data.session);
        setLoading(false);
      } catch (error) {
        console.error(
          'Unexpected authentication initialization error:',
          error
        );

        if (active) {
          setSessionState(null);
          setLoading(false);
        }
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (active) {
          setSessionState(newSession);
          setLoading(false);
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        setSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used inside AuthProvider'
    );
  }

  return {
    session: context.session,
    user: context.user,
    loading: context.loading,
  };
}

export async function initializeAuth() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error(
      'Error loading authentication session:',
      error
    );
  }

  return data.session;
}

// Optional student details are saved as signup metadata so they remain
// available while email confirmation is pending. The database must
// validate these values and assign the Student role independently.
export async function signUp(
  email: string,
  password: string,
  studentDetails?: {
    full_name: string;
    student_id: string;
  }
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    ...(studentDetails
      ? {
          options: {
            data: {
              full_name: studentDetails.full_name,
              student_id: studentDetails.student_id,
            },
          },
        }
      : {}),
  });

  if (error) {
    return { data, error };
  }

  if (data.session?.user) {
    await ensureProfile(data.session.user.id);
  }

  return { data, error: null };
}

export async function signIn(email: string, password: string) {
  const { data, error } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (error) {
    return { data, error };
  }

  if (data.session?.user) {
    await ensureProfile(data.session.user.id);
  }

  return { data, error: null };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  return { error };
}
