import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { isRole } from '@/lib/access';

import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'reviewer' | 'encoder' | 'viewer';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  error: string;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: null,
  isLoading: true,
  error: '',
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const loadingProfileFor = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const request = ++generation.current;
    loadingProfileFor.current = userId;
    setError(''); setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw new Error('Your profile could not be loaded. Retry or contact an administrator.');
      if (!isRole(data?.role)) throw new Error('Your account has no supported LAKAD role.');
      if (data.is_active === false) throw new Error('Your account is deactivated. Contact an administrator.');
      if (request === generation.current) {
        profileRef.current = data as Profile;
        setProfile(data as Profile);
      }
    } catch (error) {
      if (request === generation.current) {
        profileRef.current = null;
        setProfile(null);
        setError(error instanceof Error ? error.message : 'Session unavailable.');
      }
    } finally {
      if (request === generation.current) {
        loadingProfileFor.current = null;
        setIsLoading(false);
      }
    }
  }, []);
  const refreshProfile = useCallback(async () => {
    if (sessionRef.current) await fetchProfile(sessionRef.current.user.id);
  }, [fetchProfile]);

  useEffect(() => {
    let live = true;
    let authEventReceived = false;

    const applySession = (nextSession: Session | null, forceProfileRefresh = false) => {
      const nextUserId = nextSession?.user.id ?? null;
      const currentProfile = profileRef.current;

      sessionRef.current = nextSession;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextUserId) {
        ++generation.current;
        loadingProfileFor.current = null;
        profileRef.current = null;
        setProfile(null);
        setError('');
        setIsLoading(false);
        return;
      }

      if (!forceProfileRefresh && currentProfile?.id === nextUserId) {
        setIsLoading(false);
        return;
      }

      if (!forceProfileRefresh && loadingProfileFor.current === nextUserId) return;

      if (currentProfile?.id !== nextUserId) {
        ++generation.current;
        profileRef.current = null;
        setProfile(null);
      }
      loadingProfileFor.current = nextUserId;
      setIsLoading(true);
      setTimeout(() => {
        if (live && sessionRef.current?.user.id === nextUserId) void fetchProfile(nextUserId);
      }, 0);
    };

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!live || authEventReceived) return;
      applySession(initialSession);
    }).catch(() => { if (live && !authEventReceived) { setError('Unable to check your session.'); setIsLoading(false); } });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventReceived = true;
      // Supabase can emit SIGNED_IN again when a tab regains focus and emits
      // TOKEN_REFRESHED during normal renewal. Keep an already resolved role
      // instead of blanking it and bouncing the router through a loading state.
      applySession(nextSession, event === 'USER_UPDATED');
    });

    // This ref is a request sequence counter, not a DOM element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { live = false; ++generation.current; loadingProfileFor.current = null; subscription.unsubscribe(); };
  }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ session, user, profile, role: profile?.role ?? null, isLoading, error, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
