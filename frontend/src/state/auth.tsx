// Auth state: one session layer for email/password and Emergent Google auth.
// Token stored in SecureStore (native) / localStorage (web) via storage.secure*.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { storage } from '@/src/utils/storage';
import { api, getDeviceId, setDeviceId, type AuthUser, type AuthResponse } from '@/src/api/client';
import { useProfile } from '@/src/state/profile';

const TOKEN_KEY = 'dotlink_session_token';
const AUTH_BASE = 'https://auth.emergentagent.com/';

type Ctx = {
  user: AuthUser | null;
  authLoading: boolean;
  register: (email: string, password: string, name?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

function parseSessionId(url: string): string | null {
  const m = url.match(/[#?&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { refresh } = useProfile();

  const applyAuth = useCallback(async (res: AuthResponse) => {
    await storage.secureSet(TOKEN_KEY, res.session_token);
    setUser(res.user);
    const canonical = res.user.profile_device_id;
    if (canonical) {
      const current = await getDeviceId();
      if (current !== canonical) await setDeviceId(canonical);
    }
    await refresh();
  }, [refresh]);

  const handleSessionId = useCallback(async (sessionId: string) => {
    const deviceId = await getDeviceId();
    const res = await api.authGoogleSession(sessionId, deviceId);
    await applyAuth(res);
  }, [applyAuth]);

  // Boot: process Google redirect (web), else restore stored session.
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const sid = parseSessionId(window.location.hash || '') || parseSessionId(window.location.search || '');
          if (sid) {
            await handleSessionId(sid);
            window.history.replaceState(null, '', window.location.pathname);
            return;
          }
        } else {
          // Cold-start deep link fallback (mobile)
          const initial = await Linking.getInitialURL();
          const sid = initial ? parseSessionId(initial) : null;
          if (sid) {
            await handleSessionId(sid);
            return;
          }
        }
        const token = await storage.secureGet<string>(TOKEN_KEY, '');
        if (token) {
          try {
            const me = await api.authMe(token);
            setUser(me.user);
          } catch {
            await storage.secureRemove(TOKEN_KEY);
          }
        }
      } catch {
        // stay logged out
      } finally {
        setAuthLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const deviceId = await getDeviceId();
    const res = await api.authRegister(email, password, name, deviceId);
    await applyAuth(res);
  }, [applyAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const deviceId = await getDeviceId();
    const res = await api.authLogin(email, password, deviceId);
    await applyAuth(res);
  }, [applyAuth]);

  const loginWithGoogle = useCallback(async () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const redirect = window.location.origin + '/';
        window.location.href = `${AUTH_BASE}?redirect=${encodeURIComponent(redirect)}`;
      }
      return;
    }
    const redirectUrl = Linking.createURL('auth');
    const authUrl = `${AUTH_BASE}?redirect=${encodeURIComponent(redirectUrl)}`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === 'success' && result.url) {
      const sid = parseSessionId(result.url);
      if (sid) await handleSessionId(sid);
    }
  }, [handleSessionId]);

  const logout = useCallback(async () => {
    const token = await storage.secureGet<string>(TOKEN_KEY, '');
    if (token) {
      try { await api.authLogout(token); } catch {}
    }
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, authLoading, register, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
