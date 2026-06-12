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

// Music: warm piano-style chord progression generated as base64 WAV.
// 4 chords (Cmaj7 → Am7 → Fmaj7 → G7sus4) × ~3s each = ~12s seamless loop.
// Each chord is a stack of additive sine voices (5 harmonics) with a piano
// ADSR envelope (sharp attack, exponential decay) — gives a warm, lounge feel.
function buildAmbientDrone(): string {
  const sampleRate = 22050;
  // 4 chords × 3s = 12s
  const chordDurMs = 3000;
  const chords = [
    // Cmaj7  : C3 E3 G3 B3 + low C2
    [130.81, 164.81, 196.00, 246.94, 65.41],
    // Am7    : A2 C3 E3 G3 + low A2
    [110.00, 130.81, 164.81, 196.00, 55.00],
    // Fmaj7  : F2 A2 C3 E3 + low F2
    [87.31, 110.00, 130.81, 164.81, 43.65],
    // G7sus4 : G2 C3 D3 F3 + low G2
    [98.00, 130.81, 146.83, 174.61, 49.00],
  ];
  const totalMs = chordDurMs * chords.length;
  const totalSamples = Math.floor((sampleRate * totalMs) / 1000);

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

  // Piano-ish harmonic series: fundamental + 5 harmonics with decreasing gain
  const harmonics = [
    { mult: 1, gain: 1.0 },
    { mult: 2, gain: 0.55 },
    { mult: 3, gain: 0.30 },
    { mult: 4, gain: 0.18 },
    { mult: 5, gain: 0.10 },
    { mult: 6, gain: 0.05 },
  ];

  const samplesPerChord = Math.floor((sampleRate * chordDurMs) / 1000);

  // Pre-compute a warm "felt-piano" envelope: 30ms attack, slow exp decay (tau=2.4s)
  function envelope(t: number, chordDurSec: number): number {
    const attack = 0.03;
    if (t < attack) return t / attack;
    const decayTau = 2.4;
    // Soft sustain tail with slight tremolo
    const decay = Math.exp(-(t - attack) / decayTau);
    return Math.max(0, decay);
  }

  for (let chordIdx = 0; chordIdx < chords.length; chordIdx++) {
    const notes = chords[chordIdx];
    const startSample = chordIdx * samplesPerChord;
    const endSample = startSample + samplesPerChord;
    // Slight stagger between notes (arpeggio-light feel)
    const noteOffsets = [0, 0.04, 0.08, 0.12, 0.0]; // bass at 0

    for (let i = startSample; i < endSample; i++) {
      const tInChord = (i - startSample) / sampleRate;
      let s = 0;
      for (let n = 0; n < notes.length; n++) {
        const f0 = notes[n];
        const offset = noteOffsets[n] || 0;
        const t = tInChord - offset;
        if (t < 0) continue;
        const env = envelope(t, chordDurMs / 1000);
        // Per-note gain: bass note quieter relative
        const noteGain = (n === notes.length - 1) ? 0.35 : (n === 0 ? 0.32 : 0.30);
        let voice = 0;
        for (const h of harmonics) {
          voice += Math.sin(2 * Math.PI * f0 * h.mult * t) * h.gain;
        }
        // Normalize harmonic stack
        voice /= 2.18;
        s += voice * env * noteGain;
      }
      // Crossfade between chords for seamless transition (last 250ms blend with next chord's first note)
      const xfade = 0.25;
      if (tInChord > (chordDurMs / 1000) - xfade && chordIdx < chords.length - 1) {
        const fadeIn = (tInChord - ((chordDurMs / 1000) - xfade)) / xfade;
        const nextNotes = chords[(chordIdx + 1) % chords.length];
        const tNext = tInChord - (chordDurMs / 1000);
        if (tNext >= 0 - xfade) {
          let next = 0;
          for (let n = 0; n < nextNotes.length; n++) {
            const f0 = nextNotes[n];
            const tn = tNext + xfade;
            if (tn < 0) continue;
            const env = envelope(tn, chordDurMs / 1000);
            const noteGain = (n === nextNotes.length - 1) ? 0.35 : (n === 0 ? 0.32 : 0.30);
            let voice = 0;
            for (const h of harmonics) {
              voice += Math.sin(2 * Math.PI * f0 * h.mult * tn) * h.gain;
            }
            voice /= 2.18;
            next += voice * env * noteGain;
          }
          s = s * (1 - fadeIn) + next * fadeIn;
        }
      }
      // Subtle stereo-less ambient pad: slow LFO on overall volume
      const lfo = 0.92 + 0.08 * Math.sin(2 * Math.PI * 0.10 * (i / sampleRate));
      // Soft clip / saturate slightly for warmth
      let v = Math.tanh(s * 1.5) * 0.42 * lfo;
      // Boundary fades to avoid loop click
      const fadeSamples = sampleRate * 0.25;
      if (i < fadeSamples) v *= i / fadeSamples;
      if (i > totalSamples - fadeSamples) v *= (totalSamples - i) / fadeSamples;
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
    }
  }

  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
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
