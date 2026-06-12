import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii, WORLD_THEMES, WORLD_ORDER } from '@/src/theme';
import { api, type DifficultyMeta } from '@/src/api/client';
import { useProfile } from '@/src/state/profile';
import { hapticLight } from '@/src/audio/feedback';

export default function Worlds() {
  const router = useRouter();
  const { profile } = useProfile();
  const [worlds, setWorlds] = useState<DifficultyMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.difficulties().then((d) => {
      setWorlds(d.difficulties);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const completedFor = (key: string) =>
    Object.keys(profile?.completed || {}).filter((id) => id.startsWith(`${key}-`)).length;
  const starsFor = (key: string) =>
    Object.entries(profile?.completed || {})
      .filter(([id]) => id.startsWith(`${key}-`))
      .reduce((a, [, v]) => a + (v.stars || 0), 0);

  // Unlock logic: lumina always unlocked. Each next world unlocks when previous has >=5 levels with 1+ stars.
  const isUnlocked = (idx: number) => {
    if (idx === 0) return true;
    const prevKey = WORLD_ORDER[idx - 1];
    return completedFor(prevKey) >= 5;
  };

  return (
    <View style={styles.root} testID="worlds-screen">
      <LinearGradient
        colors={['#050505', '#0a0a0a', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <TopBar title="Mondes" subtitle="Choisis ton univers" />

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {worlds.map((w, idx) => {
            const theme = WORLD_THEMES[w.key];
            const completed = completedFor(w.key);
            const stars = starsFor(w.key);
            const totalStars = w.count * 3;
            const unlocked = isUnlocked(idx);
            return (
              <TouchableOpacity
                key={w.key}
                testID={`world-${w.key}`}
                activeOpacity={0.85}
                disabled={!unlocked}
                onPress={() => {
                  hapticLight();
                  router.push(`/levels/${w.key}`);
                }}
                style={[styles.card, { borderColor: unlocked ? theme.accent + '55' : 'rgba(255,255,255,0.06)' }]}
              >
                <LinearGradient
                  colors={[theme.accent + '20', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconWrap}>
                    <View style={[styles.cardIcon, { backgroundColor: theme.accent, shadowColor: theme.accent }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.worldKicker}>MONDE {idx + 1} · {w.label}</Text>
                    <Text style={[styles.worldName, { color: unlocked ? colors.onSurface : colors.onSurfaceTertiary }]}>
                      {theme.name}
                    </Text>
                    <Text style={styles.worldTagline}>{theme.tagline}</Text>
                  </View>
                  {unlocked ? (
                    <Ionicons name="chevron-forward" size={22} color={theme.accent} />
                  ) : (
                    <Ionicons name="lock-closed" size={20} color={colors.onSurfaceTertiary} />
                  )}
                </View>
                <View style={styles.cardStats}>
                  <View style={styles.statBlock}>
                    <Text style={styles.statNum}>{completed}<Text style={styles.statSub}>/{w.count}</Text></Text>
                    <Text style={styles.statLabel}>niveaux</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.statBlock}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="star" size={14} color={colors.brand} />
                      <Text style={styles.statNum}>{stars}<Text style={styles.statSub}>/{totalStars}</Text></Text>
                    </View>
                    <Text style={styles.statLabel}>étoiles</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.statBlock}>
                    <Text style={styles.statNum}>{w.size}<Text style={styles.statSub}>×{w.size}</Text></Text>
                    <Text style={styles.statLabel}>grille</Text>
                  </View>
                </View>
                {!unlocked ? (
                  <Text style={styles.lockHint}>Termine 5 niveaux du monde précédent</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
          <SafeAreaView edges={['bottom']} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl3, gap: spacing.md },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    backgroundColor: 'rgba(20,20,20,0.65)',
    padding: spacing.lg,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  cardIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardIcon: {
    width: 22, height: 22, borderRadius: 11,
    shadowOpacity: 0.9, shadowRadius: 18,
  },
  worldKicker: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  worldName: { fontSize: 26, fontWeight: '700', marginTop: 2, letterSpacing: -0.5 },
  worldTagline: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, fontStyle: 'italic' },

  cardStats: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  statBlock: { alignItems: 'center', flex: 1 },
  statNum: { color: colors.onSurface, fontSize: 18, fontWeight: '700' },
  statSub: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: '500' },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5, marginTop: 4, textTransform: 'uppercase' },
  divider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.08)' },

  lockHint: {
    marginTop: spacing.md, color: colors.onSurfaceTertiary, fontSize: 12,
    textAlign: 'center', fontStyle: 'italic',
  },
});
