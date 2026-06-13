import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

import { api, type LevelData } from '@/src/api/client';
import {
  GameState,
  beginAt,
  extendTo,
  endStroke,
  createState,
  filledRatio,
  isColorConnected,
  computeStars,
} from '@/src/game/engine';
import { colors, spacing, radii, WORLD_THEMES } from '@/src/theme';
import { useProfile } from '@/src/state/profile';
import {
  hapticLight,
  hapticMedium,
  hapticSuccess,
  hapticError,
  play,
} from '@/src/audio/feedback';
import { showRewardedAd } from '@/src/ads/admob';
import { resolveBoardSkin, resolveBallSkin } from '@/src/skins/catalog';
import { BoardMotif } from '@/src/skins/visuals';
import Svg, { Polyline } from 'react-native-svg';

const HINT_COST = 40;
const SCREEN_W = Dimensions.get('window').width;

// Per-world reward multiplier × star count
// 1⭐ = 2 base, 2⭐ = 5 base, 3⭐ = 10 base
// Multipliers: lumina 0.5, aurora 1, zenith 1.5, eclipse 2, void 3
//   ⇒ 3⭐ Lumina 5, Aurora 10, Zenith 15, Eclipse 20, Void 30
const STAR_BASE: Record<number, number> = { 1: 2, 2: 5, 3: 10 };
const WORLD_MULT: Record<string, number> = {
  lumina: 0.5, aurora: 1, zenith: 1.5, eclipse: 2, void: 3,
};
function coinReward(difficulty: string, stars: number): number {
  if (stars <= 0) return 0;
  const base = STAR_BASE[stars] || 0;
  const mult = WORLD_MULT[difficulty] ?? 1;
  return Math.max(1, Math.round(base * mult));
}

export default function GameScreen() {
  const params = useLocalSearchParams<{ difficulty: string; level: string }>();
  const difficulty = params.difficulty || 'lumina';
  const levelIdx = parseInt(params.level || '1', 10);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, addCoins, spendCoins, setServerCoins, markLevel } = useProfile();

  const theme = WORLD_THEMES[difficulty] || WORLD_THEMES.lumina;

  const boardSkin = resolveBoardSkin(profile?.active_skins?.board);
  const ballSkin = resolveBallSkin(profile?.active_skins?.ball);

  const [levelData, setLevelData] = useState<LevelData | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [moves, setMoves] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [stars, setStars] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAd, setShowAd] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  const loadLevel = useCallback(async () => {
    setLoading(true);
    setMoves(0);
    setCompleted(false);
    setStars(0);
    solutionRef.current = null;
    startTimeRef.current = Date.now();
    try {
      const data = await api.level(difficulty, levelIdx);
      setLevelData(data);
      setState(createState(data));
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [difficulty, levelIdx]);

  useEffect(() => { loadLevel(); }, [loadLevel]);

  const onReset = useCallback(() => {
    if (!levelData) return;
    hapticLight();
    setState(createState(levelData));
    setMoves(0);
  }, [levelData]);

  // Cell size: fit grid within available width with padding
  const gridSize = useMemo(() => {
    if (!levelData) return 280;
    const maxW = Math.min(SCREEN_W - spacing.lg * 2, 380);
    return maxW;
  }, [levelData]);
  const cellSize = useMemo(() => {
    if (!levelData) return 60;
    return gridSize / levelData.size;
  }, [gridSize, levelData]);

  const handleCellTouch = useCallback((r: number, c: number, isStart: boolean) => {
    if (!state) return;
    if (isStart) {
      const newState = beginAt(state, { r, c });
      if (newState.drawing) {
        hapticLight();
        play('tap');
      }
      setState({ ...newState });
    } else {
      const res = extendTo(state, { r, c });
      if (res.completed) {
        setCompleted(true);
        const optimal = levelData?.size ? levelData.size * levelData.size : 16;
        // Optimal moves: equals number of colors (one stroke per color is perfect)
        const colorCount = levelData?.dots.length || 1;
        const s = computeStars(moves + 1, colorCount + 2, true);
        setStars(s);
        hapticSuccess();
        play('win');
      } else if (res.state !== state) {
        // path extended or truncated
        if (state.drawing) {
          const newPathLen = res.state.paths[state.drawing.color]?.length || 0;
          const oldPathLen = state.paths[state.drawing.color]?.length || 0;
          if (newPathLen > oldPathLen) {
            // Check if color just connected
            if (isColorConnected(res.state, state.drawing.color)) {
              hapticMedium();
              play('connect');
            } else {
              hapticLight();
            }
          }
        }
      }
      setState({ ...res.state });
    }
  }, [state, levelData, moves]);

  const lastCellRef = useRef<{ r: number; c: number } | null>(null);

  const incrementMoves = useCallback(() => {
    setMoves((m) => m + 1);
    setState((cur) => cur ? { ...cur, drawing: null } : cur);
  }, []);

  const panGesture = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      const r = Math.floor(e.y / cellSize);
      const c = Math.floor(e.x / cellSize);
      if (!levelData || r < 0 || c < 0 || r >= levelData.size || c >= levelData.size) return;
      lastCellRef.current = { r, c };
      runOnJS(handleCellTouch)(r, c, true);
    })
    .onUpdate((e) => {
      const r = Math.floor(e.y / cellSize);
      const c = Math.floor(e.x / cellSize);
      if (!levelData || r < 0 || c < 0 || r >= levelData.size || c >= levelData.size) return;
      const last = lastCellRef.current;
      if (last && last.r === r && last.c === c) return;
      lastCellRef.current = { r, c };
      runOnJS(handleCellTouch)(r, c, false);
    })
    .onEnd(() => {
      runOnJS(incrementMoves)();
    }),
  [cellSize, levelData, handleCellTouch, incrementMoves],
  );

  // Persist on completion
  useEffect(() => {
    if (completed && levelData) {
      const time_ms = Date.now() - startTimeRef.current;
      markLevel(levelData.id, { stars, moves, time_ms });
      // World-scaled reward
      const reward = coinReward(difficulty, stars);
      if (reward > 0) addCoins(reward);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  const goNext = () => {
    router.replace(`/game/${difficulty}/${Math.min(levelIdx + 1, 999)}`);
  };

  const solutionRef = useRef<{ color: string; path: [number, number][] }[] | null>(null);

  const onHint = async () => {
    if (!profile || !state || !levelData || completed) return;
    if (profile.coins < HINT_COST) {
      hapticError();
      play('error');
      return;
    }
    // Each press solves ONE full color pair: the first not-yet-connected one.
    // Because the hint fully connects that color, the next press automatically
    // targets a different pair.
    const target = levelData.dots.find((d) => !isColorConnected(state, d.color));
    if (!target) return;
    try {
      if (!solutionRef.current) {
        const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/level/${difficulty}/${levelIdx}?include_solution=true`);
        const data = await res.json();
        solutionRef.current = data.solution || [];
      }
      const sol = solutionRef.current?.find((s) => s.color === target.color);
      if (!sol || sol.path.length < 2) return;
      const ok = await spendCoins(HINT_COST);
      if (!ok) return;
      hapticMedium();
      // Draw the complete correct path between the two dots of this color
      let newState = beginAt({ ...state }, { r: sol.path[0][0], c: sol.path[0][1] });
      let nowCompleted = false;
      for (let i = 1; i < sol.path.length; i++) {
        const res2 = extendTo({ ...newState }, { r: sol.path[i][0], c: sol.path[i][1] });
        newState = res2.state;
        if (res2.completed) nowCompleted = true;
      }
      setState({ ...newState, drawing: null });
      setMoves((m) => m + 1);
      if (nowCompleted) {
        setCompleted(true);
        const colorCount = levelData.dots.length || 1;
        const s = computeStars(moves + 1, colorCount + 2, true);
        setStars(s);
        hapticSuccess();
        play('win');
      } else {
        play('connect');
      }
    } catch {}
  };

  const onReward = async () => {
    setShowAd(true);
    try {
      const result = await showRewardedAd();
      if (result.rewarded) {
        // Server credits the reward; only fall back to a local credit offline.
        try {
          if (profile) {
            const r = await api.reward(profile.device_id, 50);
            setServerCoins(r.coins);
          } else {
            await addCoins(50);
          }
        } catch {
          await addCoins(50);
        }
        play('coin');
        hapticSuccess();
      }
    } finally {
      setShowAd(false);
    }
  };

  if (loading || !state || !levelData) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root} testID="game-screen">
      <LinearGradient
        colors={[theme.accent + '14', '#050505']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={['top']} style={{ width: '100%' }}>
        <View style={styles.header}>
          <TouchableOpacity
            testID="game-back"
            style={styles.iconBtn}
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerKicker}>{theme.name.toUpperCase()}</Text>
            <Text style={styles.headerTitle}>Niveau {levelData.index}</Text>
          </View>
          <View style={styles.coinChip} testID="game-coins">
            <Ionicons name="ellipse" size={9} color={colors.brand} />
            <Text style={styles.coinText}>{profile?.coins ?? 0}</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <Stat icon="move" value={String(moves)} label="coups" />
          <Stat icon="apps" value={`${Math.round(filledRatio(state) * 100)}%`} label="rempli" />
          <Stat icon="layers" value={String(levelData.dots.length)} label="couleurs" />
        </View>
      </SafeAreaView>

      {/* Grid */}
      <View style={styles.gridWrap}>
        <View style={[styles.gridShadow, { width: gridSize + 14, height: gridSize + 14, borderRadius: radii.lg + 4 }]}>
          <LinearGradient
            colors={[theme.accent + '40', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <GestureDetector gesture={panGesture}>
          <View
            style={[styles.grid, {
              width: gridSize, height: gridSize,
              backgroundColor: boardSkin.bg,
              shadowColor: boardSkin.accent,
            }]}
            testID="game-grid"
          >
            <BoardMotif skinId={boardSkin.id} size={gridSize} />
            <PathsOverlay state={state} cellSize={cellSize} gridSize={gridSize} />
            {Array.from({ length: levelData.size }).map((_, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {Array.from({ length: levelData.size }).map((__, c) => (
                  <GridCell
                    key={`${r}-${c}`}
                    state={state}
                    r={r}
                    c={c}
                    size={cellSize}
                    boardSkin={boardSkin}
                    ballSkin={ballSkin}
                  />
                ))}
              </View>
            ))}
          </View>
        </GestureDetector>
      </View>

      {/* Bottom CTA bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          testID="reward-ad"
          style={styles.rewardCard}
          onPress={onReward}
          activeOpacity={0.85}
          disabled={showAd}
        >
          <View style={styles.adBadge}><Text style={styles.adBadgeText}>PUB</Text></View>
          <Ionicons name="play-circle" size={20} color={colors.brand} />
          <Text style={styles.rewardText}>{showAd ? 'Vidéo en cours…' : 'Regarder · +50 pièces'}</Text>
        </TouchableOpacity>
        <View style={styles.actionRow}>
          <ActionBtn icon="refresh" label="Reset" testID="reset-btn" onPress={onReset} />
          <ActionBtn icon="bulb-outline" label={`Indice (${HINT_COST})`} testID="hint-btn" onPress={onHint} />
        </View>
      </View>

      {/* Victory overlay */}
      {completed ? (
        <VictoryOverlay
          stars={stars}
          moves={moves}
          coinsEarned={coinReward(difficulty, stars)}
          theme={theme}
          onNext={goNext}
          onReplay={onReset}
          onHome={() => router.replace(`/levels/${difficulty}`)}
        />
      ) : null}
    </GestureHandlerRootView>
  );
}

function Stat({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={statStyles.wrap}>
      <Ionicons name={icon} size={14} color={colors.onSurfaceTertiary} />
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

function ActionBtn({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID: string }) {
  return (
    <TouchableOpacity testID={testID} style={actionStyles.btn} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={16} color={colors.onSurface} />
      <Text style={actionStyles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

// Draws every color path as a single rounded line (Flow-style). Thin strokes
// with round caps/joins guarantee that two parallel segments of the same
// color never visually merge into blocks or squares.
function PathsOverlay({ state, cellSize, gridSize }: {
  state: GameState; cellSize: number; gridSize: number;
}) {
  const center = (v: number) => v * cellSize + cellSize / 2;
  const entries = Object.entries(state.paths).filter(([, path]) => path && path.length > 1);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={gridSize} height={gridSize}>
        {entries.map(([color, path]) => {
          const points = path.map((p) => `${center(p.c)},${center(p.r)}`).join(' ');
          return (
            <React.Fragment key={color}>
              {/* soft glow under the line */}
              <Polyline
                points={points}
                fill="none"
                stroke={color}
                strokeOpacity={0.18}
                strokeWidth={cellSize * 0.52}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={cellSize * 0.26}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

function GridCell({ state, r, c, size, boardSkin, ballSkin }: {
  state: GameState; r: number; c: number; size: number;
  boardSkin: { bg: string; grid_line: string; accent: string };
  ballSkin: { style: string; ring_opacity: number; glow: number };
}) {
  const cell = state.grid[r][c];
  const border = boardSkin.grid_line;

  let dotColor: string | null = null;
  let coveredColor: string | null = null;
  if (cell.type === 'dot') {
    dotColor = cell.color;
    const path = state.paths[cell.color];
    if (path && path.some((p) => p.r === r && p.c === c)) coveredColor = cell.color;
  } else if (cell.type === 'path') {
    coveredColor = cell.color;
  }

  return (
    <View
      style={{
        width: size, height: size,
        borderWidth: 0.5,
        borderColor: border,
        // Subtle tint shows board coverage progress (100% fill win condition)
        backgroundColor: coveredColor ? coveredColor + '14' : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Dot */}
      {dotColor ? (
        <>
          {ballSkin.style !== 'solid' ? (
            <View
              style={{
                position: 'absolute',
                width: size * 0.78, height: size * 0.78,
                borderRadius: (size * 0.78) / 2,
                borderWidth: 2,
                borderColor: dotColor,
                opacity: ballSkin.ring_opacity,
              }}
            />
          ) : null}
          {ballSkin.style === 'devcore' ? (
            <View
              style={{
                position: 'absolute',
                width: size * 0.85, height: size * 0.85,
                borderWidth: 1.5,
                borderColor: dotColor,
                opacity: 0.45,
                transform: [{ rotate: '45deg' }],
              }}
            />
          ) : null}
          {ballSkin.style === 'supernova' ? (
            <View
              style={{
                position: 'absolute',
                width: size * 0.92, height: size * 0.92,
                borderRadius: (size * 0.92) / 2,
                borderWidth: 1,
                borderColor: dotColor,
                opacity: 0.35,
              }}
            />
          ) : null}
          <View
            style={{
              width: size * 0.62, height: size * 0.62,
              borderRadius: (size * 0.62) / 2,
              backgroundColor: dotColor,
              shadowColor: dotColor,
              shadowOpacity: 0.85 * ballSkin.glow,
              shadowRadius: 10 * ballSkin.glow,
              shadowOffset: { width: 0, height: 0 },
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.30)',
            }}
          />
        </>
      ) : null}
    </View>
  );
}

function VictoryOverlay({ stars, moves, coinsEarned, theme, onNext, onReplay, onHome }: {
  stars: number; moves: number; coinsEarned: number; theme: any;
  onNext: () => void; onReplay: () => void; onHome: () => void;
}) {
  const scale = useSharedValue(0.6);
  const rotate = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 160 }),
    );
    rotate.value = withRepeat(withTiming(360, { duration: 18000, easing: Easing.linear }), -1);
  }, [scale, rotate]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const haloStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));

  return (
    <View style={overStyles.overlay} testID="victory-overlay">
      <View style={overStyles.scrim} />
      <Animated.View style={[overStyles.halo, haloStyle, { borderColor: theme.accent + '40' }]} />
      <Animated.View style={[overStyles.card, cardStyle, { borderColor: theme.accent + '55' }]}>
        <Text style={overStyles.title}>Niveau Résolu</Text>
        <Text style={overStyles.subtitle}>Constellation complète</Text>
        <View style={overStyles.starsRow}>
          {[1, 2, 3].map((i) => (
            <StarAnim key={i} active={i <= stars} delay={i * 200} color={theme.accent} />
          ))}
        </View>
        <View style={overStyles.statsRow}>
          <View style={overStyles.statBox}>
            <Text style={overStyles.statNum}>{moves}</Text>
            <Text style={overStyles.statLabel}>Coups</Text>
          </View>
          <View style={overStyles.statBox}>
            <Text style={[overStyles.statNum, { color: colors.brand }]}>+{coinsEarned}</Text>
            <Text style={overStyles.statLabel}>Pièces</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
          <TouchableOpacity testID="victory-home" style={overStyles.secondaryBtn} onPress={onHome}>
            <Ionicons name="home-outline" size={16} color={colors.onSurface} />
            <Text style={overStyles.secondaryLabel}>Mondes</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="victory-replay" style={overStyles.secondaryBtn} onPress={onReplay}>
            <Ionicons name="refresh" size={16} color={colors.onSurface} />
            <Text style={overStyles.secondaryLabel}>Rejouer</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="victory-next" style={[overStyles.primaryBtn, { backgroundColor: theme.accent }]} onPress={onNext}>
            <Text style={[overStyles.primaryLabel, { color: '#0a0a0a' }]}>Suivant</Text>
            <Ionicons name="chevron-forward" size={16} color="#0a0a0a" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

function StarAnim({ active, delay, color }: { active: boolean; delay: number; color: string }) {
  const scale = useSharedValue(0.2);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (active) {
      scale.value = withDelay(delay, withSequence(
        withTiming(1.3, { duration: 200, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 160 }),
      ));
      opacity.value = withDelay(delay, withTiming(1, { duration: 220 }));
    } else {
      scale.value = withDelay(delay, withTiming(1, { duration: 220 }));
      opacity.value = withDelay(delay, withTiming(0.4, { duration: 220 }));
    }
  }, [active, delay, scale, opacity]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <Animated.View style={[style, { marginHorizontal: 6 }]}>
      <Ionicons name={active ? 'star' : 'star-outline'} size={48} color={active ? color : colors.onSurfaceTertiary} />
    </Animated.View>
  );
}

const statStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(20,20,20,0.7)',
    borderRadius: radii.pill,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  value: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },
  label: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, marginLeft: 2 },
});

const actionStyles = StyleSheet.create({
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  label: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
});

const overStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.78)' },
  halo: {
    position: 'absolute', width: 460, height: 460, borderRadius: 230,
    borderWidth: 1,
  },
  card: {
    width: '86%', maxWidth: 360,
    backgroundColor: 'rgba(15,15,15,0.96)',
    borderRadius: radii.lg, borderWidth: 1,
    padding: 24, alignItems: 'center',
  },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: colors.onSurfaceTertiary, marginTop: 4, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  starsRow: { flexDirection: 'row', marginTop: 24, marginBottom: 6 },
  statsRow: { flexDirection: 'row', gap: 24, marginTop: 18 },
  statBox: { alignItems: 'center' },
  statNum: { color: colors.onSurface, fontSize: 22, fontWeight: '700' },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2, letterSpacing: 1.5, textTransform: 'uppercase' },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  secondaryLabel: { color: colors.onSurface, fontSize: 12, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 18,
    borderRadius: radii.md,
  },
  primaryLabel: { fontSize: 13, fontWeight: '700' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerKicker: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 3, fontWeight: '600' },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '700', marginTop: 2 },
  coinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(245,200,81,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.25)',
  },
  coinText: { color: colors.brand, fontSize: 12, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 8,
    marginTop: 8, marginBottom: 12,
  },

  gridWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  gridShadow: {
    position: 'absolute',
    opacity: 0.5,
  },
  grid: {
    backgroundColor: 'rgba(8,8,10,0.97)',
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#F5C851',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },

  bottomBar: {
    paddingHorizontal: spacing.lg, paddingTop: 8, gap: 10,
    backgroundColor: 'rgba(5,5,5,0.0)',
  },
  rewardCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: 'rgba(245,200,81,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.28)',
  },
  rewardText: { color: colors.onSurface, fontSize: 13, fontWeight: '600', flex: 1 },
  adBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, backgroundColor: 'rgba(245,200,81,0.25)',
  },
  adBadgeText: { color: colors.brand, fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  actionRow: { flexDirection: 'row', gap: 10 },
});
