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

const HINT_COST = 25;
const SCREEN_W = Dimensions.get('window').width;

export default function GameScreen() {
  const params = useLocalSearchParams<{ difficulty: string; level: string }>();
  const difficulty = params.difficulty || 'lumina';
  const levelIdx = parseInt(params.level || '1', 10);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, addCoins, spendCoins, markLevel } = useProfile();

  const theme = WORLD_THEMES[difficulty] || WORLD_THEMES.lumina;

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
      // Bonus coins: 10 * stars
      if (stars > 0) addCoins(10 * stars);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  const goNext = () => {
    router.replace(`/game/${difficulty}/${Math.min(levelIdx + 1, 999)}`);
  };

  const onHint = async () => {
    if (!profile || !state || !levelData) return;
    if (profile.coins < HINT_COST) {
      hapticError();
      return;
    }
    const ok = await spendCoins(HINT_COST);
    if (!ok) return;
    hapticMedium();
    // Find an unconnected color and reveal first 2 steps from one endpoint
    const target = levelData.dots.find((d) => !isColorConnected(state, d.color));
    if (!target) return;
    try {
      const full = await api.level(difficulty, levelIdx);
      // Need solution -- ask backend
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/level/${difficulty}/${levelIdx}?include_solution=true`);
      const data = await res.json();
      const sol = data.solution?.find((s: any) => s.color === target.color);
      if (!sol) return;
      // Pick 3 cells from the start
      const reveal = sol.path.slice(0, Math.min(3, sol.path.length - 1));
      // Apply via begin + extend
      let newState = state;
      newState = beginAt({ ...newState }, { r: reveal[0][0], c: reveal[0][1] });
      for (let i = 1; i < reveal.length; i++) {
        const res2 = extendTo({ ...newState }, { r: reveal[i][0], c: reveal[i][1] });
        newState = res2.state;
      }
      setState({ ...newState, drawing: null });
    } catch {}
  };

  const onReward = async () => {
    setShowAd(true);
    // mock 2-second 'ad'
    setTimeout(async () => {
      try {
        if (profile) {
          const res = await api.reward(profile.device_id, 50);
          await addCoins(0); // trigger profile re-pull via refresh? sync next time
        }
        await addCoins(50); // local immediate
        play('coin');
        hapticSuccess();
      } catch {
        await addCoins(50);
      }
      setShowAd(false);
    }, 2200);
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
            style={[styles.grid, { width: gridSize, height: gridSize }]}
            testID="game-grid"
          >
            {Array.from({ length: levelData.size }).map((_, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {Array.from({ length: levelData.size }).map((__, c) => (
                  <GridCell
                    key={`${r}-${c}`}
                    state={state}
                    r={r}
                    c={c}
                    size={cellSize}
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
          coinsEarned={10 * stars}
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

function GridCell({ state, r, c, size }: { state: GameState; r: number; c: number; size: number }) {
  const cell = state.grid[r][c];
  const bg = 'rgba(255,255,255,0.03)';
  const border = 'rgba(255,255,255,0.06)';

  let dotColor: string | null = null;
  let pathColor: string | null = null;
  if (cell.type === 'dot') dotColor = cell.color;
  else if (cell.type === 'path') pathColor = cell.color;

  // Determine which neighbors share the path color (for line connectors)
  const neighbours: Array<{ dx: number; dy: number; key: 'up' | 'down' | 'left' | 'right' }> = [
    { dx: -1, dy: 0, key: 'up' },
    { dx: 1, dy: 0, key: 'down' },
    { dx: 0, dy: -1, key: 'left' },
    { dx: 0, dy: 1, key: 'right' },
  ];
  const hasSameColor = (nr: number, nc: number, color: string) => {
    if (nr < 0 || nc < 0 || nr >= state.size || nc >= state.size) return false;
    const nc2 = state.grid[nr][nc];
    if (nc2.type === 'path' && nc2.color === color) return true;
    if (nc2.type === 'dot' && nc2.color === color) {
      // Only connect if dot is part of an active path containing this cell
      const path = state.paths[color];
      if (!path) return false;
      const idxThis = path.findIndex((p) => p.r === r && p.c === c);
      const idxNeigh = path.findIndex((p) => p.r === nr && p.c === nc);
      if (idxThis < 0 || idxNeigh < 0) return false;
      return Math.abs(idxThis - idxNeigh) === 1;
    }
    return false;
  };

  let connColor: string | null = null;
  let conns: Record<string, boolean> = { up: false, down: false, left: false, right: false };
  if (cell.type === 'path') {
    connColor = cell.color;
    for (const n of neighbours) {
      conns[n.key] = hasSameColor(r + n.dx, c + n.dy, cell.color);
    }
  } else if (cell.type === 'dot') {
    // Dot cell can also show short stub connection to neighbouring same-color path
    const dotColor2 = cell.color;
    const path = state.paths[dotColor2];
    if (path && path.length > 0) {
      const idxThis = path.findIndex((p) => p.r === r && p.c === c);
      if (idxThis >= 0) {
        connColor = dotColor2;
        for (const n of neighbours) {
          conns[n.key] = hasSameColor(r + n.dx, c + n.dy, dotColor2);
        }
      }
    }
  }

  return (
    <View
      style={{
        width: size, height: size,
        borderWidth: 0.5,
        borderColor: border,
        backgroundColor: bg,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Path connectors */}
      {connColor ? (
        <>
          {conns.up && <View style={{ position: 'absolute', top: 0, width: size * 0.32, height: size * 0.5 + 1, backgroundColor: connColor }} />}
          {conns.down && <View style={{ position: 'absolute', bottom: 0, width: size * 0.32, height: size * 0.5 + 1, backgroundColor: connColor }} />}
          {conns.left && <View style={{ position: 'absolute', left: 0, width: size * 0.5 + 1, height: size * 0.32, backgroundColor: connColor }} />}
          {conns.right && <View style={{ position: 'absolute', right: 0, width: size * 0.5 + 1, height: size * 0.32, backgroundColor: connColor }} />}
          {pathColor && (
            <View style={{ width: size * 0.32, height: size * 0.32, backgroundColor: connColor }} />
          )}
        </>
      ) : null}
      {/* Dot */}
      {dotColor ? (
        <View
          style={{
            width: size * 0.62, height: size * 0.62,
            borderRadius: (size * 0.62) / 2,
            backgroundColor: dotColor,
            shadowColor: dotColor,
            shadowOpacity: 0.9,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 0 },
            borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.25)',
          }}
        />
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
    backgroundColor: 'rgba(10,10,10,0.95)',
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
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
