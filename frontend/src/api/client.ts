import { storage } from '@/src/utils/storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEVICE_KEY = 'dotlink_device_id';

function uuid(): string {
  // RFC4122-ish; sufficient for device identifier
  const s = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return s.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id = await storage.getItem(DEVICE_KEY);
  if (!id) {
    id = uuid();
    await storage.setItem(DEVICE_KEY, id);
  }
  cachedDeviceId = id;
  return id;
}

async function req<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

export type DifficultyMeta = {
  key: string;
  label: string;
  order: number;
  size: number;
  count: number;
};

export type Dot = { color: string; a: [number, number]; b: [number, number] };
export type LevelData = {
  id: string;
  index: number;
  size: number;
  dots: Dot[];
};

export type Pack = {
  id: string;
  name: string;
  coins: number;
  amount: number;
  bonus: number;
  total: number;
};

export type Profile = {
  id: string;
  device_id: string;
  name: string;
  coins: number;
  completed: Record<string, { level_id: string; stars: number; moves: number; time_ms: number }>;
  settings: { sound: boolean; music: boolean; haptics: boolean };
};

export const api = {
  difficulties: () => req<{ difficulties: DifficultyMeta[] }>('/difficulties'),
  levels: (difficulty: string) =>
    req<{ difficulty: string; label: string; size: number; count: number; levels: LevelData[] }>(
      `/levels/${difficulty}`,
    ),
  level: (difficulty: string, index: number) =>
    req<LevelData>(`/level/${difficulty}/${index}`),
  initProfile: (device_id: string, name = 'Joueur') =>
    req<Profile>('/profile/init', { method: 'POST', body: JSON.stringify({ device_id, name }) }),
  getProfile: (device_id: string) => req<Profile>(`/profile/${device_id}`),
  syncProfile: (payload: {
    device_id: string;
    coins: number;
    completed: Record<string, any>;
    settings: any;
  }) =>
    req<Profile>('/profile/sync', { method: 'POST', body: JSON.stringify(payload) }),
  packs: () => req<{ packs: Pack[] }>('/shop/packs'),
  checkoutCreate: (device_id: string, pack_id: string, origin_url: string) =>
    req<{ url: string; session_id: string }>('/checkout/create', {
      method: 'POST',
      body: JSON.stringify({ device_id, pack_id, origin_url }),
    }),
  checkoutStatus: (session_id: string) =>
    req<{
      session_id: string;
      status: string;
      payment_status: string;
      credited: boolean;
      coins_added: number;
    }>(`/checkout/status/${session_id}`),
  reward: (device_id: string, amount: number) =>
    req<{ coins: number; added: number }>('/ads/reward', {
      method: 'POST',
      body: JSON.stringify({ device_id, amount }),
    }),
};
