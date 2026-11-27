import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile as updateFirebaseProfile,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { Profile } from '../types/platform';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: Profile | null;
  unreadNotifications: number;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (fullName: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  apiFetch: <T>(url: string, options?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchBackendProfile = useCallback(async (user: User) => {
    try {
      const token = await user.getIdToken();
      const resp = await fetch('/api/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        setProfile(null);
        return;
      }
      const data = await resp.json();
      setProfile(data.profile ?? null);
      setUnreadNotifications(Number(data.unreadNotifications || 0));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchBackendProfile(user);
      } else {
        setProfile(null);
        setUnreadNotifications(0);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [fetchBackendProfile]);

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) {
      await fetchBackendProfile(auth.currentUser);
    }
  }, [fetchBackendProfile]);

  const apiFetch = useCallback(async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    }
    const resp = await fetch(url, { ...options, headers });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `Erreur serveur (${resp.status})`);
    }
    return data as T;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    await fetchBackendProfile(cred.user);
  }, [fetchBackendProfile]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await fetchBackendProfile(cred.user);
    },
    [fetchBackendProfile]
  );

  const registerWithEmail = useCallback(
    async (fullName: string, email: string, password: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (fullName.trim()) {
        await updateFirebaseProfile(cred.user, { displayName: fullName.trim() });
      }
      await fetchBackendProfile(cred.user);
    },
    [fetchBackendProfile]
  );

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setProfile(null);
    setUnreadNotifications(0);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        unreadNotifications,
        loading,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        resetPassword,
        signOut,
        refreshProfile,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
