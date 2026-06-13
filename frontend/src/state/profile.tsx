import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { storage } from '@/src/utils/storage';
import { api, getDeviceId, type Profile } from '@/src/api/client';

const LOCAL_KEY = 'dotlink_profile_v1';
const DELTA_KEY = 'dotlink_coin_delta_v1';

type ProfileState = Profile;

type Ctx = {
  profile: ProfileState | null;
  loading: boolean;
  addCoins: (amount: number) => Promise<void>;
  spendCoins: (amount: number) => Promise<boolean>;
  setServerCoins: (serverTotal: number) => void;
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
    coins: 100,
    completed: {},
    settings: { sound: true, music: true, haptics: true },
  };
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Coins earned/spent locally that the server hasn't applied yet.
  // The server is the source of truth; we only ever send deltas.
  const deltaRef = useRef(0);
  const profileRef = useRef<Profile | null>(null);
  profileRef.current = profile;

  const persistLocal = useCallback(async (p: Profile) => {
    await storage.setItem(LOCAL_KEY, JSON.stringify(p));
  }, []);

  const persistDelta = useCallback(async () => {
    await storage.setItem(DELTA_KEY, deltaRef.current);
  }, []);

  const doSync = useCallback(async () => {
    const p = profileRef.current;
    if (!p) return;
    const sentDelta = deltaRef.current;
    try {
      const merged = await api.syncProfile({
        device_id: p.device_id,
        coin_delta: sentDelta,
        completed: p.completed,
        settings: p.settings,
      });
      deltaRef.current -= sentDelta;
      await persistDelta();
      const next = { ...merged, coins: Math.max(0, (merged.coins ?? 0) + deltaRef.current) };
      setProfile(next);
      await persistLocal(next);
    } catch (e) {
      // offline – local stays source of truth meanwhile, delta is preserved
    }
  }, [persistLocal, persistDelta]);

  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(doSync, 1200);
  }, [doSync]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      // Load local first for instant UI
      const [raw, storedDelta] = await Promise.all([
        storage.getItem(LOCAL_KEY, ''),
        storage.getItem(DELTA_KEY, 0),
      ]);
      deltaRef.current = typeof storedDelta === 'number' ? storedDelta : 0;
      let localProfile: Profile | null = null;
      if (raw) {
        try { localProfile = JSON.parse(raw); } catch {}
      }
      if (localProfile && localProfile.device_id === deviceId) {
        setProfile(localProfile);
      }
      try {
        // Server is authoritative for coins (+ any unsynced local delta)
        const remote = await api.initProfile(deviceId);
        const merged: Profile = {
          ...remote,
          coins: Math.max(0, (remote.coins ?? 0) + deltaRef.current),
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
        // Push delta + progress back to server best-effort
        scheduleSync();
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
      scheduleSync();
      return next;
    });
  }, [persistLocal, scheduleSync]);

  const addCoins = useCallback(async (amount: number) => {
    deltaRef.current += amount;
    persistDelta();
    await update((p) => ({ ...p, coins: Math.max(0, p.coins + amount) }));
  }, [update, persistDelta]);

  const spendCoins = useCallback(async (amount: number) => {
    let ok = false;
    setProfile((cur) => {
      if (!cur) return cur;
      if (cur.coins < amount) return cur;
      ok = true;
      deltaRef.current -= amount;
      persistDelta();
      const next = { ...cur, coins: cur.coins - amount };
      persistLocal(next);
      scheduleSync();
      return next;
    });
    return ok;
  }, [persistLocal, persistDelta, scheduleSync]);

  // Use after a server endpoint already credited/debited coins (ads reward,
  // skin purchase, rename...). serverTotal is authoritative; we only add the
  // still-unsynced local delta on top.
  const setServerCoins = useCallback((serverTotal: number) => {
    setProfile((cur) => {
      if (!cur) return cur;
      const next = { ...cur, coins: Math.max(0, serverTotal + deltaRef.current) };
      persistLocal(next);
      return next;
    });
  }, [persistLocal]);

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
    if (syncTimer.current) clearTimeout(syncTimer.current);
    await doSync();
  }, [doSync]);

  return (
    <ProfileContext.Provider value={{
      profile,
      loading,
      addCoins,
      spendCoins,
      setServerCoins,
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
