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
  if (prefs.music !== undefined) {
    musicEnabled = prefs.music;
    if (!musicEnabled) stopMusic();
    else if (_musicStarted) startMusic();
  }
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

// Music: warm piano-style chord progression generated as a base64 WAV.
// 8 chords × 4s = 32s seamless loop. Every note is rendered with a long
// 6s decay tail that OVERLAPS the next chord (and wraps around the end of
// the buffer back to the start), so there is no audible cut between notes
// and the loop point is mathematically seamless.
function buildAmbientDrone(): string {
  const sampleRate = 11025;
  const chordDurSec = 4;
  // Warm lounge progression: Cmaj7 → Am7 → Fmaj7 → G7 → Em7 → Am7 → Dm7 → G7sus4
  // Each chord: 4 voices + a low bass note. Voicings share common tones for
  // smooth transitions.
  const chords: number[][] = [
    [130.81, 164.81, 196.00, 246.94, 65.41],  // Cmaj7   (C3 E3 G3 B3 + C2)
    [110.00, 164.81, 196.00, 261.63, 55.00],  // Am7     (A2 E3 G3 C4 + A1)
    [87.31, 130.81, 174.61, 220.00, 43.65],   // Fmaj7   (F2 C3 F3 A3 + F1)
    [98.00, 146.83, 196.00, 246.94, 49.00],   // G7      (G2 D3 G3 B3 + G1)
    [82.41, 123.47, 164.81, 196.00, 41.20],   // Em7     (E2 B2 E3 G3 + E1)
    [110.00, 130.81, 164.81, 196.00, 55.00],  // Am7     (A2 C3 E3 G3 + A1)
    [73.42, 110.00, 146.83, 174.61, 36.71],   // Dm7     (D2 A2 D3 F3 + D1)
    [98.00, 130.81, 146.83, 174.61, 49.00],   // G7sus4  (G2 C3 D3 F3 + G1)
  ];
  const totalSec = chordDurSec * chords.length; // 32s
  const totalSamples = sampleRate * totalSec;
  const mix = new Float32Array(totalSamples);

  // Piano-ish harmonic stack
  const harmonics = [
    { mult: 1, gain: 1.0 },
    { mult: 2, gain: 0.5 },
    { mult: 3, gain: 0.25 },
    { mult: 4, gain: 0.12 },
    { mult: 5, gain: 0.06 },
  ];
  const harmNorm = 1.93;

  // Render each unique note once (cached), then mix at every onset.
  const tailSec = 6; // long felt-piano tail, overlaps the next chord
  const tailSamples = sampleRate * tailSec;
  const noteCache = new Map<number, Float32Array>();
  const renderNote = (f0: number): Float32Array => {
    const cached = noteCache.get(f0);
    if (cached) return cached;
    const buf = new Float32Array(tailSamples);
    for (let i = 0; i < tailSamples; i++) {
      const t = i / sampleRate;
      // 25ms soft attack, exp decay (tau 2.2s), final 0.5s fade to true zero
      let env = t < 0.025 ? t / 0.025 : Math.exp(-(t - 0.025) / 2.2);
      env *= Math.min(1, (tailSec - t) / 0.5);
      let v = 0;
      for (const h of harmonics) v += Math.sin(2 * Math.PI * f0 * h.mult * t) * h.gain;
      buf[i] = (v / harmNorm) * env;
    }
    noteCache.set(f0, buf);
    return buf;
  };

  for (let chordIdx = 0; chordIdx < chords.length; chordIdx++) {
    const notes = chords[chordIdx];
    // gentle arpeggio-light stagger; bass lands first
    const offsets = [0.0, 0.06, 0.12, 0.18, 0.0];
    const gains = [0.30, 0.28, 0.27, 0.25, 0.34];
    for (let n = 0; n < notes.length; n++) {
      const buf = renderNote(notes[n]);
      const start = Math.floor((chordIdx * chordDurSec + offsets[n]) * sampleRate);
      const gain = gains[n];
      for (let i = 0; i < tailSamples; i++) {
        // Wrap-around: tails that overshoot the loop end feed the loop start,
        // which is what makes the loop join completely click-free.
        mix[(start + i) % totalSamples] += buf[i] * gain;
      }
    }
  }

  // Post-processing: loop-periodic LFO (2 full cycles per loop) + soft clip.
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  const lfoFreq = 2 / totalSec; // periodic over the loop → no seam
  for (let i = 0; i < totalSamples; i++) {
    const lfo = 0.92 + 0.08 * Math.sin(2 * Math.PI * lfoFreq * (i / sampleRate));
    const v = Math.tanh(mix[i] * 1.4) * 0.5 * lfo;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
  }

  // Base64 encode in chunks (fast, avoids per-byte string concat)
  const bytes = new Uint8Array(buffer);
  let bin = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  // @ts-ignore
  const b64 = typeof btoa === 'function' ? btoa(bin) : globalThis.Buffer?.from(bin, 'binary').toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

let _musicPlayer: AudioPlayer | null = null;
let _musicStarted = false; // user intent to play music
let _musicDataUri: string | null = null;

function ensureMusicPlayer(): AudioPlayer | null {
  if (Platform.OS === 'web') return null;
  if (_musicPlayer) return _musicPlayer;
  try {
    if (!_musicDataUri) _musicDataUri = buildAmbientDrone();
    _musicPlayer = createAudioPlayer({ uri: _musicDataUri });
    // Loop seamlessly via expo-audio's loop property if available
    try { (_musicPlayer as any).loop = true; } catch {}
    try { (_musicPlayer as any).volume = 0.55; } catch {}
  } catch {
    return null;
  }
  return _musicPlayer;
}

export function startMusic() {
  _musicStarted = true;
  if (!musicEnabled) return;
  const p = ensureMusicPlayer();
  if (!p) return;
  try { p.play(); } catch {}
}

export function stopMusic() {
  const p = _musicPlayer;
  if (!p) return;
  try { p.pause(); } catch {}
}

export function setMusicPlaying(on: boolean) {
  if (on) startMusic();
  else { _musicStarted = false; stopMusic(); }
}
