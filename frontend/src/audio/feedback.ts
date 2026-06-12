// Haptics + audio feedback. Audio uses simple synthesized cues via base64 WAV
// data URIs so we don't ship binary assets. expo-audio plays them when enabled.
import * as Haptics from 'expo-haptics';
import { AudioPlayer, createAudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

let soundEnabled = true;
let musicEnabled = true;
let hapticsEnabled = true;

export function setAudioPrefs(prefs: { sound?: boolean; music?: boolean; haptics?: boolean }) {
  if (prefs.sound !== undefined) soundEnabled = prefs.sound;
  if (prefs.music !== undefined) musicEnabled = prefs.music;
  if (prefs.haptics !== undefined) hapticsEnabled = prefs.haptics;
}

// ---- Tiny WAV (PCM 16-bit) synthesizer for short blip cues ----
// Generated once at module load; cached as base64 data URIs.
function buildWav(frequency: number, durationMs: number, fade = true, sweep = 0): string {
  const sampleRate = 22050;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = fade ? Math.max(0, 1 - i / numSamples) : 1;
    const freq = frequency + sweep * t;
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.45;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  // Convert to base64
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa fallback for RN
  // @ts-ignore
  const b64 = typeof btoa === 'function' ? btoa(bin) : globalThis.Buffer?.from(bin, 'binary').toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

const SOUNDS_DATA = {
  tap:     buildWav(720, 70, true, 0),
  connect: buildWav(540, 140, true, 220),
  win:     buildWav(660, 360, true, 360),
  coin:    buildWav(880, 180, true, 240),
  error:   buildWav(220, 160, true, -60),
};

const players: Partial<Record<keyof typeof SOUNDS_DATA, AudioPlayer>> = {};

function getPlayer(key: keyof typeof SOUNDS_DATA): AudioPlayer | null {
  if (Platform.OS === 'web') return null; // expo-audio web support is limited; skip
  if (!players[key]) {
    try {
      players[key] = createAudioPlayer({ uri: SOUNDS_DATA[key] });
    } catch {
      return null;
    }
  }
  return players[key] || null;
}

export function play(key: keyof typeof SOUNDS_DATA) {
  if (!soundEnabled) return;
  const p = getPlayer(key);
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {}
}

// Haptics
export function hapticTap() {
  if (!hapticsEnabled) return;
  Haptics.selectionAsync().catch(() => {});
}
export function hapticLight() {
  if (!hapticsEnabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
export function hapticMedium() {
  if (!hapticsEnabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
export function hapticSuccess() {
  if (!hapticsEnabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
export function hapticError() {
  if (!hapticsEnabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

// Music: no bundled track for V1 — toggle persisted in profile, ready for future.
export function setMusicPlaying(_on: boolean) {
  // Placeholder: a future build can wire an ambient loop via expo-audio.
}
