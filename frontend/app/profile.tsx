import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii, WORLD_THEMES, WORLD_ORDER } from '@/src/theme';
import { useProfile } from '@/src/state/profile';

export default function Profile() {
  const { profile } = useProfile();

  const stats = useMemo(() => {
    if (!profile) return null;
    const completed = Object.values(profile.completed || {});
    const totalStars = completed.reduce((s, l) => s + (l.stars || 0), 0);
    const perfect = completed.filter((l) => l.stars === 3).length;
    const byWorld: Record<string, { count: number; stars: number }> = {};
    for (const key of WORLD_ORDER) byWorld[key] = { count: 0, stars: 0 };
    for (const [id, l] of Object.entries(profile.completed || {})) {
      const key = id.split('-')[0];
      if (byWorld[key]) {
        byWorld[key].count += 1;
        byWorld[key].stars += l.stars || 0;
      }
    }
    return { total: completed.length, totalStars, perfect, byWorld };
  }, [profile]);

  return (
    <View style={styles.root} testID="profile-screen">
      <LinearGradient
        colors={['rgba(245,200,81,0.06)', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <TopBar title="Statistiques" subtitle={profile?.name || 'Joueur'} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name="planet" size={32} color={colors.brand} />
          </View>
          <Text style={styles.name}>{profile?.name || 'Joueur'}</Text>
          <Text style={styles.deviceId} numberOfLines={1}>ID · {profile?.device_id?.slice(0, 8) || '—'}</Text>

          <View style={styles.identityStats}>
            <View style={styles.istat}>
              <Text style={styles.istatNum}>{stats?.total || 0}</Text>
              <Text style={styles.istatLabel}>niveaux</Text>
            </View>
            <View style={styles.idiv} />
            <View style={styles.istat}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={14} color={colors.brand} />
                <Text style={styles.istatNum}>{stats?.totalStars || 0}</Text>
              </View>
              <Text style={styles.istatLabel}>étoiles</Text>
            </View>
            <View style={styles.idiv} />
            <View style={styles.istat}>
              <Text style={styles.istatNum}>{stats?.perfect || 0}</Text>
              <Text style={styles.istatLabel}>parfaits</Text>
            </View>
          </View>
        </View>

        {/* Per-world breakdown */}
        <Text style={styles.sectionTitle}>Progression par monde</Text>
        {WORLD_ORDER.map((key) => {
          const theme = WORLD_THEMES[key];
          const s = stats?.byWorld?.[key];
          return (
            <View key={key} style={styles.row} testID={`stat-world-${key}`}>
              <View style={[styles.rowIcon, { backgroundColor: theme.accent + '20' }]}>
                <View style={[styles.rowDot, { backgroundColor: theme.accent }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{theme.name}</Text>
                <Text style={styles.rowTagline}>{theme.tagline}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.rowCount}>{s?.count || 0}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Ionicons name="star" size={11} color={colors.brand} />
                  <Text style={styles.rowStars}>{s?.stars || 0}</Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={styles.lore}>
          <Text style={styles.loreTitle}>L&apos;histoire</Text>
          <Text style={styles.loreBody}>
            Tu es un Tisseur d&apos;Étoiles, voyageur silencieux des cinq mondes. Chaque
            constellation perdue attend que tu la relies. À mesure que tu traces les voies
            de lumière, l&apos;obscurité du Vide recule, et l&apos;univers se souvient.
          </Text>
        </View>

        <SafeAreaView edges={['bottom']} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl3 },
  card: {
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.20)',
    alignItems: 'center',
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(245,200,81,0.10)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
  },
  name: { color: colors.onSurface, fontSize: 22, fontWeight: '700', marginTop: 12, letterSpacing: -0.4 },
  deviceId: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 4, letterSpacing: 1 },
  identityStats: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 20, width: '100%', paddingTop: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  istat: { flex: 1, alignItems: 'center' },
  istatNum: { color: colors.onSurface, fontSize: 20, fontWeight: '700' },
  istatLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5, marginTop: 4, textTransform: 'uppercase' },
  idiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.08)' },

  sectionTitle: {
    color: colors.onSurface, fontSize: 14, fontWeight: '600',
    marginTop: spacing.xl, marginBottom: spacing.md, letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
    backgroundColor: 'rgba(20,20,20,0.65)',
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  rowDot: { width: 12, height: 12, borderRadius: 6 },
  rowName: { color: colors.onSurface, fontSize: 15, fontWeight: '600' },
  rowTagline: { color: colors.onSurfaceTertiary, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  rowCount: { color: colors.onSurface, fontSize: 16, fontWeight: '700' },
  rowStars: { color: colors.brand, fontSize: 11, fontWeight: '600' },

  lore: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(20,20,20,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  loreTitle: {
    color: colors.brand, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase',
    fontWeight: '700',
  },
  loreBody: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 22, marginTop: 10 },
});
