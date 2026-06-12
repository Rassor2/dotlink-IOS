import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii, WORLD_THEMES } from '@/src/theme';
import { api, type LevelData } from '@/src/api/client';
import { useProfile } from '@/src/state/profile';
import { hapticLight } from '@/src/audio/feedback';

export default function LevelsList() {
  const params = useLocalSearchParams<{ difficulty: string }>();
  const difficulty = params.difficulty || 'lumina';
  const router = useRouter();
  const { profile } = useProfile();

  const [levels, setLevels] = useState<LevelData[]>([]);
  const [meta, setMeta] = useState<{ label: string; count: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.levels(difficulty)
      .then((r) => {
        setLevels(r.levels);
        setMeta({ label: r.label, count: r.count });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [difficulty]);

  const theme = WORLD_THEMES[difficulty];

  const sortedLevels = useMemo(() => levels.slice().sort((a, b) => a.index - b.index), [levels]);

  const renderItem = ({ item }: { item: LevelData }) => {
    const completed = profile?.completed?.[item.id];
    const stars = completed?.stars || 0;
    const unlocked = item.index === 1 || !!profile?.completed?.[`${difficulty}-${item.index - 1}`];
    return (
      <TouchableOpacity
        testID={`level-${item.id}`}
        activeOpacity={0.85}
        disabled={!unlocked}
        onPress={() => {
          hapticLight();
          router.push(`/game/${difficulty}/${item.index}`);
        }}
        style={[
          styles.tile,
          {
            borderColor: stars > 0 ? theme.accent + '88' : unlocked ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
            backgroundColor: unlocked ? 'rgba(20,20,20,0.85)' : 'rgba(20,20,20,0.4)',
          },
        ]}
      >
        {stars > 0 && (
          <LinearGradient
            colors={[theme.accent + '22', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
        )}
        {!unlocked && (
          <Ionicons name="lock-closed" size={16} color={colors.onSurfaceTertiary} />
        )}
        {unlocked && (
          <>
            <Text style={[styles.tileNumber, { color: stars > 0 ? theme.accent : colors.onSurface }]}>
              {item.index}
            </Text>
            <View style={styles.starRow}>
              {[1, 2, 3].map((i) => (
                <Ionicons
                  key={i}
                  name={i <= stars ? 'star' : 'star-outline'}
                  size={9}
                  color={i <= stars ? colors.brand : colors.onSurfaceTertiary}
                />
              ))}
            </View>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root} testID="levels-screen">
      <LinearGradient
        colors={[theme?.accent + '14' || '#050505', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <TopBar
        title={theme?.name || meta?.label || difficulty}
        subtitle={`${meta?.label || ''} · ${meta?.count || 0} niveaux`}
      />
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={theme?.accent || colors.brand} /></View>
      ) : (
        <FlatList
          data={sortedLevels}
          keyExtractor={(it) => it.id}
          numColumns={4}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          columnWrapperStyle={{ gap: spacing.md, justifyContent: 'flex-start' }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListFooterComponent={<SafeAreaView edges={['bottom']} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, paddingBottom: spacing.xl3 },
  tile: {
    width: 72, height: 88, borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  tileNumber: { fontSize: 22, fontWeight: '700' },
  starRow: { flexDirection: 'row', marginTop: 6, gap: 2 },
});
