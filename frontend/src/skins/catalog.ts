// Client-side mirror of backend skin catalog.
// Used to render the active skin's visuals during gameplay without a fetch.
// Must stay in sync with /app/backend/skins.py.

export type BoardSkin = {
  id: string;
  name: string;
  tier: string;
  accent: string;
  bg: string;
  grid_line: string;
};

export type BallSkin = {
  id: string;
  name: string;
  tier: string;
  style: 'solid' | 'halo' | 'pulse' | 'prism' | 'supernova' | 'devcore';
  ring_opacity: number;
  glow: number;
};

export const BOARD_SKINS: Record<string, BoardSkin> = {
  board_obsidian:  { id: 'board_obsidian',  name: 'Obsidienne',     tier: 'common',     accent: '#262626', bg: '#0a0a0a', grid_line: 'rgba(255,255,255,0.06)' },
  board_aurora:    { id: 'board_aurora',    name: 'Voile Aurora',   tier: 'uncommon',   accent: '#32A852', bg: '#06140A', grid_line: 'rgba(50,168,82,0.18)' },
  board_solaris:   { id: 'board_solaris',   name: 'Solaris',        tier: 'rare',       accent: '#F5C851', bg: '#1A1305', grid_line: 'rgba(245,200,81,0.20)' },
  board_nebula:    { id: 'board_nebula',    name: 'Nébuleuse',      tier: 'epic',       accent: '#E91E63', bg: '#1A0710', grid_line: 'rgba(233,30,99,0.22)' },
  board_void:      { id: 'board_void',      name: 'Vide profond',   tier: 'legendary',  accent: '#FF7F50', bg: '#0D0703', grid_line: 'rgba(255,127,80,0.22)' },
  board_devmatrix: { id: 'board_devmatrix', name: 'Matrice Dev',    tier: 'developer',  accent: '#98FF98', bg: '#000000', grid_line: 'rgba(152,255,152,0.30)' },
};

export const BALL_SKINS: Record<string, BallSkin> = {
  ball_classic:   { id: 'ball_classic',   name: 'Classique',  tier: 'common',     style: 'solid',     ring_opacity: 0.25, glow: 0.6 },
  ball_halo:      { id: 'ball_halo',      name: 'Halo',       tier: 'uncommon',   style: 'halo',      ring_opacity: 0.55, glow: 0.85 },
  ball_pulse:     { id: 'ball_pulse',     name: 'Pulse',      tier: 'rare',       style: 'pulse',     ring_opacity: 0.40, glow: 1.0 },
  ball_prism:     { id: 'ball_prism',     name: 'Prisme',     tier: 'epic',       style: 'prism',     ring_opacity: 0.60, glow: 1.0 },
  ball_supernova: { id: 'ball_supernova', name: 'Supernova',  tier: 'legendary',  style: 'supernova', ring_opacity: 0.70, glow: 1.2 },
  ball_devcore:   { id: 'ball_devcore',   name: 'Noyau Dev',  tier: 'developer',  style: 'devcore',   ring_opacity: 0.90, glow: 1.3 },
};

export function resolveBoardSkin(id?: string): BoardSkin {
  return (id && BOARD_SKINS[id]) || BOARD_SKINS.board_obsidian;
}

export function resolveBallSkin(id?: string): BallSkin {
  return (id && BALL_SKINS[id]) || BALL_SKINS.ball_classic;
}
