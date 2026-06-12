// Dot Link - Design tokens (based on /app/design_guidelines.json)
export const colors = {
  // Surfaces
  surface: '#050505',
  onSurface: '#F2F2F2',
  surfaceSecondary: '#141414',
  onSurfaceSecondary: '#D4D4D4',
  surfaceTertiary: '#262626',
  onSurfaceTertiary: '#A3A3A3',
  surfaceInverse: '#F0F0F0',
  onSurfaceInverse: '#050505',

  // Brand: Starlight gold
  brand: '#F5C851',
  brandPrimary: '#F5C851',
  onBrandPrimary: '#140F00',
  brandSecondary: '#32A852',
  onBrandSecondary: '#FFFFFF',
  brandTertiary: '#2E250A',
  onBrandTertiary: '#F5C851',

  success: '#2D8A46',
  warning: '#D99021',
  error: '#C93B3B',

  border: '#262626',
  borderStrong: '#404040',
  divider: '#1F1F1F',

  // Glass tints
  glass: 'rgba(20,20,20,0.72)',
  glassStrong: 'rgba(10,10,10,0.85)',
  glassLight: 'rgba(255,255,255,0.06)',

  // Puzzle palette (NO blue/purple)
  puzzle: {
    emerald: '#32A852',
    coral: '#FF7F50',
    amber: '#FFC107',
    rose: '#E91E63',
    mint: '#98FF98',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xl2: 32,
  xl3: 48,
};

export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const typography = {
  display: 'serif' as const,        // fallback if Fraunces not loaded
  text: 'System' as const,
  sizes: { sm: 12, base: 14, lg: 16, xl: 20, xl2: 24, xl3: 32, xl4: 48 },
  weights: { regular: '400' as const, medium: '500' as const, semibold: '600' as const, bold: '700' as const },
};

// Per-world theming
export const WORLD_THEMES: Record<string, { name: string; tagline: string; accent: string; glow: string }> = {
  lumina: {
    name: 'Lumina',
    tagline: 'L\'aube cosmique',
    accent: '#98FF98',
    glow: 'rgba(152,255,152,0.35)',
  },
  aurora: {
    name: 'Aurora',
    tagline: 'Le voile boréal',
    accent: '#32A852',
    glow: 'rgba(50,168,82,0.35)',
  },
  zenith: {
    name: 'Zenith',
    tagline: 'Le pic solaire',
    accent: '#FFC107',
    glow: 'rgba(255,193,7,0.35)',
  },
  eclipse: {
    name: 'Eclipse',
    tagline: 'L\'ombre dévorante',
    accent: '#FF7F50',
    glow: 'rgba(255,127,80,0.40)',
  },
  void: {
    name: 'Void',
    tagline: 'L\'abîme étoilé',
    accent: '#E91E63',
    glow: 'rgba(233,30,99,0.40)',
  },
};

export const WORLD_ORDER = ['lumina', 'aurora', 'zenith', 'eclipse', 'void'] as const;
export type WorldKey = typeof WORLD_ORDER[number];
