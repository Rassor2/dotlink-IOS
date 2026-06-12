import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { storage } from '@/src/utils/storage';
import { api, getDeviceId, type Profile } from '@/src/api/client';

const LOCAL_KEY = 'dotlink_profile_v1';

type ProfileState = Profile;

type Ctx = {
  profile: ProfileState | null;
  loading: boolean;
  addCoins: (amount: number) => Promise<void>;
  spendCoins: (amount: number) => Promise<boolean>;
  markLevel: (
    levelId: string,
    info: { stars: number; moves: number; time_ms: number },
  ) => Promise<void>;
  updateSettings: (patch: Partial<Profile['settings']>) => Promise<void>;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const ProfileContext = createContext<Ctx | null>(null);

function defaultProfile(deviceId: string): Profile {
  return {
    id: deviceId,
    device_id: deviceId,
    name: 'Joueur',
    coins: 250,
    completed: {},
    settings: { sound: true, music: true, haptics: true },
  };
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistLocal = useCallback(async (p: Profile) => {
    await storage.setItem(LOCAL_KEY, JSON.stringify(p));
  }, []);

  const scheduleSync = useCallback((p: Profile) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        const merged = await api.syncProfile({
          device_id: p.device_id,
          coins: p.coins,
          completed: p.completed,
          settings: p.settings,
        });
        setProfile(merged);
        await persistLocal(merged);
      } catch (e) {
        // offline – it's fine, local is source of truth meanwhile
      }
    }, 1200);
  }, [persistLocal]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      // Load local first for instant UI
      const raw = await storage.getItem(LOCAL_KEY);
      let localProfile: Profile | null = null;
      if (raw) {
        try { localProfile = JSON.parse(raw); } catch {}
      }
      if (localProfile && localProfile.device_id === deviceId) {
        setProfile(localProfile);
      }
      try {
        // Hydrate from server (server-side may have higher coins/progress)
        const remote = await api.initProfile(deviceId);
        // Merge with local: take MAX
        const merged: Profile = {
          ...remote,
          coins: Math.max(remote.coins ?? 0, localProfile?.coins ?? 0),
          completed: { ...(remote.completed || {}), ...(localProfile?.completed || {}) },
          settings: { ...(remote.settings || {}), ...(localProfile?.settings || {}) },
        };
        // For each level, keep best stars
        if (localProfile?.completed) {
          for (const id of Object.keys(localProfile.completed)) {
            const a = remote.completed?.[id];
            const b = localProfile.completed[id];
            const best = (a?.stars || 0) >= (b?.stars || 0) ? a : b;
            if (best) merged.completed[id] = best;
          }
        }
        setProfile(merged);
        await persistLocal(merged);
        // Push merged back to server best-effort
        scheduleSync(merged);
      } catch {
        if (!localProfile) {
          setProfile(defaultProfile(deviceId));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [persistLocal, scheduleSync]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (mut: (p: Profile) => Profile) => {
    setProfile((cur) => {
      if (!cur) return cur;
      const next = mut(cur);
      persistLocal(next);
      scheduleSync(next);
      return next;
    });
  }, [persistLocal, scheduleSync]);

  const addCoins = useCallback(async (amount: number) => {
    await update((p) => ({ ...p, coins: Math.max(0, p.coins + amount) }));
  }, [update]);

  const spendCoins = useCallback(async (amount: number) => {
    let ok = false;
    setProfile((cur) => {
      if (!cur) return cur;
      if (cur.coins < amount) return cur;
      ok = true;
      const next = { ...cur, coins: cur.coins - amount };
      persistLocal(next);
      scheduleSync(next);
      return next;
    });
    // Small wait for state mutation observation - return after setProfile resolves synchronously
    return ok;
  }, [persistLocal, scheduleSync]);

  const markLevel = useCallback(async (
    levelId: string,
    info: { stars: number; moves: number; time_ms: number },
  ) => {
    await update((p) => {
      const prev = p.completed?.[levelId];
      const nextEntry = {
        level_id: levelId,
        stars: Math.max(prev?.stars || 0, info.stars),
        moves: prev?.moves ? Math.min(prev.moves, info.moves) : info.moves,
        time_ms: prev?.time_ms ? Math.min(prev.time_ms, info.time_ms) : info.time_ms,
      };
      return { ...p, completed: { ...p.completed, [levelId]: nextEntry } };
    });
  }, [update]);

  const updateSettings = useCallback(async (patch: Partial<Profile['settings']>) => {
    await update((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  }, [update]);

  const syncNow = useCallback(async () => {
    if (!profile) return;
    try {
      const merged = await api.syncProfile({
        device_id: profile.device_id,
        coins: profile.coins,
        completed: profile.completed,
        settings: profile.settings,
      });
      setProfile(merged);
      await persistLocal(merged);
    } catch {}
  }, [profile, persistLocal]);

  return (
    <ProfileContext.Provider value={{
      profile,
      loading,
      addCoins,
      spendCoins,
      markLevel,
      updateSettings,
      refresh,
      syncNow,
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
