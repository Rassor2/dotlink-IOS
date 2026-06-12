// Reusable visual components for board / ball skins.
// All visuals are pure RN primitives + LinearGradient (no images, battery-light).
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BOARD_SKINS, BALL_SKINS, type BoardSkin, type BallSkin } from './catalog';

// ----------------- Board motifs -----------------
// Each board skin maps to a planetary/cosmic motif rendered behind the grid.

export function BoardMotif({ skinId, size }: { skinId: string; size: number }) {
  const skin = BOARD_SKINS[skinId] || BOARD_SKINS.board_obsidian;
  // Render motif based on id (each is distinct)
  switch (skin.id) {
    case 'board_obsidian':   return <ObsidianMotif size={size} accent={skin.accent} />;
    case 'board_aurora':     return <AuroraMotif size={size} accent={skin.accent} />;
    case 'board_solaris':    return <SolarisMotif size={size} accent={skin.accent} />;
    case 'board_nebula':     return <NebulaMotif size={size} accent={skin.accent} />;
    case 'board_void':       return <VoidMotif size={size} accent={skin.accent} />;
    case 'board_devmatrix':  return <DevMatrixMotif size={size} accent={skin.accent} />;
    default:                 return null;
  }
}

function ObsidianMotif({ size, accent }: { size: number; accent: string }) {
  // Dark vortex: 3 concentric radial-ish rings using overlapping borders
  const radii = [0.85, 0.55, 0.28];
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
      {radii.map((r, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: size * r,
            height: size * r,
            borderRadius: (size * r) / 2,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.04)',
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: (size * 0.18) / 2,
          backgroundColor: 'rgba(255,255,255,0.025)',
        }}
      />
    </View>
  );
}

function AuroraMotif({ size, accent }: { size: number; accent: string }) {
  // Northern lights wisps: diagonal gradient + 3 translucent green arcs
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['transparent', accent + '12', 'transparent', accent + '08']}
        locations={[0, 0.35, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {[0.2, 0.5, 0.8].map((y, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: size * y,
            left: -size * 0.2,
            right: -size * 0.2,
            height: size * 0.08,
            backgroundColor: accent,
            opacity: 0.06 + i * 0.02,
            transform: [{ rotate: '-12deg' }],
            borderRadius: size,
          }}
        />
      ))}
    </View>
  );
}

function SolarisMotif({ size, accent }: { size: number; accent: string }) {
  // Sunburst rays from center, with a small sun core
  const rays = 10;
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(245,200,81,0.10)', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 1, y: 1 }}
      />
      {Array.from({ length: rays }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: 1,
            height: size * 0.9,
            backgroundColor: accent,
            opacity: 0.10,
            transform: [{ rotate: `${(360 / rays) * i}deg` }],
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          width: size * 0.16,
          height: size * 0.16,
          borderRadius: (size * 0.16) / 2,
          backgroundColor: accent,
          opacity: 0.18,
          shadowColor: accent,
          shadowOpacity: 0.8,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  );
}

function NebulaMotif({ size, accent }: { size: number; accent: string }) {
  // Pink cloud puffs in 3 corners + radial gradient
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[accent + '18', 'transparent', accent + '0c']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {[{ top: 0.05, left: 0.55, w: 0.5 }, { top: 0.65, left: 0.05, w: 0.4 }, { top: 0.4, left: 0.4, w: 0.3 }].map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: size * p.top,
            left: size * p.left,
            width: size * p.w,
            height: size * p.w,
            borderRadius: (size * p.w) / 2,
            backgroundColor: accent,
            opacity: 0.08,
          }}
        />
      ))}
    </View>
  );
}

function VoidMotif({ size, accent }: { size: number; accent: string }) {
  // Deep cosmic abyss with scattered tiny stars
  const stars = [
    { x: 0.10, y: 0.20, s: 1.5 }, { x: 0.85, y: 0.15, s: 2 }, { x: 0.45, y: 0.30, s: 1 },
    { x: 0.25, y: 0.55, s: 1.5 }, { x: 0.65, y: 0.50, s: 1 }, { x: 0.90, y: 0.65, s: 2 },
    { x: 0.10, y: 0.80, s: 1.5 }, { x: 0.50, y: 0.85, s: 1 }, { x: 0.75, y: 0.92, s: 1.5 },
    { x: 0.30, y: 0.10, s: 1 }, { x: 0.95, y: 0.40, s: 1.5 }, { x: 0.05, y: 0.45, s: 1 },
  ];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['transparent', accent + '14']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {stars.map((st, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: size * st.x,
            top: size * st.y,
            width: st.s * 2,
            height: st.s * 2,
            borderRadius: st.s,
            backgroundColor: '#FFFFFF',
            opacity: 0.55,
            shadowColor: '#FFFFFF',
            shadowOpacity: 0.6,
            shadowRadius: 3,
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.05,
          right: size * 0.05,
          width: size * 0.22,
          height: size * 0.22,
          borderRadius: (size * 0.22) / 2,
          backgroundColor: accent,
          opacity: 0.10,
        }}
      />
    </View>
  );
}

function DevMatrixMotif({ size, accent }: { size: number; accent: string }) {
  // Hexagonal grid pattern with subtle scanlines
  const cell = size / 8;
  const lines = [];
  for (let i = 1; i < 8; i++) {
    lines.push(
      <View
        key={`h${i}`}
        style={{
          position: 'absolute',
          top: cell * i,
          left: 0, right: 0,
          height: 0.5,
          backgroundColor: accent,
          opacity: 0.08,
        }}
      />,
    );
    lines.push(
      <View
        key={`v${i}`}
        style={{
          position: 'absolute',
          left: cell * i,
          top: 0, bottom: 0,
          width: 0.5,
          backgroundColor: accent,
          opacity: 0.08,
        }}
      />,
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines}
      {[0.2, 0.5, 0.8].map((p, i) => (
        <View
          key={`hex${i}`}
          style={{
            position: 'absolute',
            top: size * p - size * 0.06,
            left: size * (i === 1 ? 0.55 : i === 0 ? 0.2 : 0.75) - size * 0.06,
            width: size * 0.12,
            height: size * 0.12,
            borderWidth: 1,
            borderColor: accent,
            opacity: 0.30,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
    </View>
  );
}

// ----------------- Ball / Dot visuals -----------------
// Renders a "puzzle dot" in a given color with the requested skin style.
// `inline` = render as a contained square (for previews). Otherwise absolute fills.

export function BallVisual({
  color, size, skinId, animated = false,
}: { color: string; size: number; skinId: string; animated?: boolean }) {
  const skin = BALL_SKINS[skinId] || BALL_SKINS.ball_classic;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <DotBody color={color} size={size} skin={skin} />
    </View>
  );
}

function DotBody({ color, size, skin }: { color: string; size: number; skin: BallSkin }) {
  const dot = size * 0.62;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer effect layer (per style) */}
      {skin.style === 'halo' ? (
        <View
          style={{
            position: 'absolute',
            width: size * 0.92, height: size * 0.92,
            borderRadius: (size * 0.92) / 2,
            borderWidth: 2,
            borderColor: color,
            opacity: skin.ring_opacity,
          }}
        />
      ) : null}

      {skin.style === 'pulse' ? (
        <>
          <View
            style={{
              position: 'absolute',
              width: size * 0.95, height: size * 0.95,
              borderRadius: (size * 0.95) / 2,
              borderWidth: 1.5, borderColor: color, opacity: skin.ring_opacity * 0.6,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: size * 0.78, height: size * 0.78,
              borderRadius: (size * 0.78) / 2,
              borderWidth: 1.5, borderColor: color, opacity: skin.ring_opacity,
            }}
          />
        </>
      ) : null}

      {skin.style === 'prism' ? (
        <>
          {[0, 90, 45, -45].map((rot, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: size * 0.82, height: size * 0.82,
                borderWidth: 1, borderColor: color, opacity: 0.35,
                transform: [{ rotate: `${rot}deg` }],
              }}
            />
          ))}
        </>
      ) : null}

      {skin.style === 'supernova' ? (
        <>
          {Array.from({ length: 8 }).map((_, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: 2, height: size * 0.95,
                backgroundColor: color, opacity: 0.55,
                transform: [{ rotate: `${i * 22.5}deg` }],
                borderRadius: 1,
              }}
            />
          ))}
          <View
            style={{
              position: 'absolute',
              width: size * 0.94, height: size * 0.94,
              borderRadius: (size * 0.94) / 2,
              borderWidth: 1, borderColor: color, opacity: skin.ring_opacity * 0.6,
            }}
          />
        </>
      ) : null}

      {skin.style === 'devcore' ? (
        <>
          {/* Hex frame: 6 rotated bars */}
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: size * 0.88, height: 1.5,
                backgroundColor: color, opacity: 0.55,
                transform: [{ rotate: `${i * 30}deg` }],
              }}
            />
          ))}
          {/* Outer hex ring */}
          <View
            style={{
              position: 'absolute',
              width: size * 0.88, height: size * 0.88,
              borderWidth: 1.5, borderColor: color, opacity: skin.ring_opacity,
              transform: [{ rotate: '30deg' }],
            }}
          />
        </>
      ) : null}

      {/* Core dot */}
      <View
        style={{
          width: dot, height: dot, borderRadius: dot / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.85 * skin.glow,
          shadowRadius: 12 * skin.glow,
          shadowOffset: { width: 0, height: 0 },
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.30)',
        }}
      />
      {/* Inner highlight for depth */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.27,
          left: size * 0.32,
          width: dot * 0.32,
          height: dot * 0.32,
          borderRadius: (dot * 0.32) / 2,
          backgroundColor: 'rgba(255,255,255,0.45)',
        }}
      />
    </View>
  );
}
