import { storage } from '@/src/utils/storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "https://dotlink-ios.onrender.com";
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
  let id: string = (await storage.getItem<string>(DEVICE_KEY, '')) || '';
  if (!id) {
    id = uuid();
    await storage.setItem(DEVICE_KEY, id);
  }
  cachedDeviceId = id;
  return id;
}

// Switch the active profile key after login: the account's canonical
// profile_device_id becomes this device's identity.
export async function setDeviceId(id: string): Promise<void> {
  cachedDeviceId = id;
  await storage.setItem(DEVICE_KEY, id);
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
  owned_skins?: string[];
  active_skins?: { board?: string; ball?: string };
  friend_code?: string;
  friends?: string[];
  tutorial_done?: boolean;
  name_changes?: number;
};

export type AuthUser = {
  user_id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  provider: 'local' | 'google' | 'admin';
  profile_device_id?: string | null;
  is_admin?: boolean;
};

export type AuthResponse = { session_token: string; user: AuthUser };

export type AdminEntry = {
  rank: number;
  device_id: string;
  name: string;
  friend_code?: string;
  stars: number;
  completed: number;
  coins: number;
  has_account: boolean;
  updated_at?: string;
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
    coin_delta: number;
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
  rename: (device_id: string, name: string) =>
    req<{ profile: Profile; cost: number; free: boolean }>('/profile/rename', {
      method: 'POST',
      body: JSON.stringify({ device_id, name }),
    }),
  renameCost: (device_id: string) =>
    req<{ changes: number; cost: number; free_used: boolean }>(`/profile/rename-cost/${device_id}`),
  tutorialComplete: (device_id: string) =>
    req<{ already_done: boolean; reward: number; coins: number }>('/profile/tutorial-complete', {
      method: 'POST',
      body: JSON.stringify({ device_id }),
    }),
  leaderboard: (device_id?: string, limit = 100, scope: 'global' | 'friends' = 'global') =>
    req<{
      top: { rank: number; device_id: string; name: string; friend_code?: string; stars: number; completed: number; coins: number }[];
      me: null | { rank: number; device_id: string; name: string; friend_code?: string; stars: number; completed: number; coins: number };
    }>(`/leaderboard?limit=${limit}&scope=${scope}${device_id ? `&device_id=${device_id}` : ''}`),
  friends: (device_id: string) =>
    req<{ friends: { friend_code: string; name: string; stars: number; completed: number; coins: number }[]; friend_code?: string }>(
      `/friends/${device_id}`,
    ),
  addFriend: (device_id: string, friend_code: string) =>
    req<{ already: boolean; added?: string; friends: string[] }>('/friends/add', {
      method: 'POST',
      body: JSON.stringify({ device_id, friend_code }),
    }),
  removeFriend: (device_id: string, friend_code: string) =>
    req<{ friends: string[] }>('/friends/remove', {
      method: 'POST',
      body: JSON.stringify({ device_id, friend_code }),
    }),
  skins: (device_id?: string) =>
    req<{ catalog: { board: any[]; ball: any[] }; owned: string[]; active: { board?: string; ball?: string } }>(
      `/skins${device_id ? `?device_id=${device_id}` : ''}`,
    ),
  buySkin: (device_id: string, skin_id: string) =>
    req<{ ok: boolean; coins: number; owned: string[] }>('/skins/buy', {
      method: 'POST',
      body: JSON.stringify({ device_id, skin_id }),
    }),
  activateSkin: (device_id: string, skin_id: string) =>
    req<{ ok: boolean; active: { board?: string; ball?: string } }>('/skins/activate', {
      method: 'POST',
      body: JSON.stringify({ device_id, skin_id }),
    }),
  skinCheckout: (device_id: string, skin_id: string, origin_url: string) =>
    req<{ url: string; session_id: string }>('/skins/checkout', {
      method: 'POST',
      body: JSON.stringify({ device_id, skin_id, origin_url }),
    }),
  // ---- Auth ----
  authRegister: (email: string, password: string, name: string | undefined, device_id: string) =>
    req<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, device_id }),
    }),
  authLogin: (email: string, password: string, device_id: string) =>
    req<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, device_id }),
    }),
  authGoogleSession: (session_id: string, device_id: string) =>
    req<AuthResponse>('/auth/google/session', {
      method: 'POST',
      body: JSON.stringify({ session_id, device_id }),
    }),
  authMe: (token: string) =>
    req<{ user: AuthUser }>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  authLogout: (token: string) =>
    req<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),
  // ---- Admin (RBAC, all require admin Bearer token) ----
  authAdminLogin: (username: string, password: string) =>
    req<AuthResponse>('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  adminLeaderboard: (token: string, search?: string, limit = 200) =>
    req<{ entries: AdminEntry[]; admin_name?: string }>(
      `/admin/leaderboard?limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
  adminDeleteProfile: (token: string, device_id: string) =>
    req<{ ok: boolean; deleted: string }>(`/admin/profile/${encodeURIComponent(device_id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }),
  adminUpdateProfile: (
    token: string,
    device_id: string,
    patch: { name?: string; coins?: number; reset_progress?: boolean },
  ) =>
    req<{ ok: boolean; profile: any; changes: any }>(
      `/admin/profile/${encodeURIComponent(device_id)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      },
    ),
  adminAudit: (token: string, limit = 50) =>
    req<{ entries: any[] }>(`/admin/audit?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
};
