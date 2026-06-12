import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, TextInput, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii } from '@/src/theme';
import { api } from '@/src/api/client';
import { useProfile } from '@/src/state/profile';
import { hapticLight, hapticSuccess } from '@/src/audio/feedback';

type Entry = { rank: number; device_id: string; name: string; stars: number; completed: number; coins: number };

export default function Leaderboard() {
  const { profile, refresh } = useProfile();
  const insets = useSafeAreaInsets();
  const [top, setTop] = useState<Entry[]>([]);
  const [me, setMe] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<'global' | 'friends'>('global');
  const [renameCost, setRenameCost] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.leaderboard(profile?.device_id, 100, scope);
      setTop(r.top);
      setMe(r.me);
    } catch {} finally {
      setLoading(false);
    }
  }, [profile?.device_id, scope]);

  useEffect(() => { load(); }, [load]);

  const openRename = async () => {
    setNewName(profile?.name || 'Joueur');
    if (profile) {
      try {
        const c = await api.renameCost(profile.device_id);
        setRenameCost(c.cost);
      } catch { setRenameCost(0); }
    }
    setRenameOpen(true);
  };

  const submitRename = async () => {
    if (!profile) return;
    const trimmed = newName.trim().slice(0, 24);
    if (!trimmed) return;
    if (renameCost > 0 && (profile.coins || 0) < renameCost) return;
    setSaving(true);
    try {
      await api.rename(profile.device_id, trimmed);
      hapticSuccess();
      await refresh();
      await load();
      setRenameOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: Entry }) => {
    const isMe = profile?.device_id === item.device_id;
    return (
      <View style={[styles.row, isMe && styles.rowMe]} testID={`lb-row-${item.rank}`}>
        <View style={[styles.rankBadge, item.rank <= 3 ? styles.rankBadgeTop : null]}>
          <Text style={[styles.rankText, item.rank <= 3 ? styles.rankTextTop : null]}>{item.rank}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}{isMe ? '  ·  Toi' : ''}
          </Text>
          <Text style={styles.sub}>{item.completed} niveaux · {item.coins} pièces</Text>
        </View>
        <View style={styles.starsBlock}>
          <Ionicons name="star" size={13} color={colors.brand} />
          <Text style={styles.starsText}>{item.stars}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root} testID="leaderboard-screen">
      <LinearGradient
        colors={['rgba(245,200,81,0.10)', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <TopBar title="Classement" subtitle={scope === 'global' ? 'Top 100 Tisseurs' : 'Entre amis'} />

      <View style={styles.tabs}>
        <TouchableOpacity
          testID="lb-tab-global"
          style={[styles.tab, scope === 'global' && styles.tabActive]}
          onPress={() => { hapticLight(); setScope('global'); }}
        >
          <Ionicons name="earth" size={14} color={scope === 'global' ? colors.brand : colors.onSurfaceTertiary} />
          <Text style={[styles.tabLabel, scope === 'global' && styles.tabLabelActive]}>Global</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="lb-tab-friends"
          style={[styles.tab, scope === 'friends' && styles.tabActive]}
          onPress={() => { hapticLight(); setScope('friends'); }}
        >
          <Ionicons name="people" size={14} color={scope === 'friends' ? colors.brand : colors.onSurfaceTertiary} />
          <Text style={[styles.tabLabel, scope === 'friends' && styles.tabLabelActive]}>Amis</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={top}
          keyExtractor={(it) => it.device_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={
            <View style={styles.intro}>
              <Text style={styles.introTitle}>Tisseurs de l&apos;univers</Text>
              <Text style={styles.introBody}>
                Classement basé sur les étoiles totales puis les niveaux complétés.
                Ton nom apparaît ici — change-le si tu veux.
              </Text>
              <TouchableOpacity testID="rename-btn" style={styles.renameBtn} onPress={() => { hapticLight(); openRename(); }}>
                <Ionicons name="pencil" size={14} color={colors.brand} />
                <Text style={styles.renameLabel}>Modifier mon nom</Text>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="trophy-outline" size={48} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>Personne n&apos;a encore brillé</Text>
              <Text style={styles.emptyBody}>Termine ton premier niveau pour entrer dans le classement.</Text>
            </View>
          }
        />
      )}

      {/* Sticky "me" footer if not in top */}
      {me && !top.find((t) => t.device_id === me.device_id) ? (
        <View style={[styles.meFooter, { paddingBottom: insets.bottom + 8 }]} testID="lb-me-footer">
          <View style={styles.row}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{me.rank}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{me.name} · Toi</Text>
              <Text style={styles.sub}>{me.completed} niveaux · {me.coins} pièces</Text>
            </View>
            <View style={styles.starsBlock}>
              <Ionicons name="star" size={13} color={colors.brand} />
              <Text style={styles.starsText}>{me.stars}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard} testID="rename-modal">
            <Text style={styles.modalTitle}>Ton nom de Tisseur</Text>
            <Text style={styles.modalSub}>
              {renameCost === 0 ? 'Premier changement offert' : `Coût : ${renameCost} pièces (changements suivants)`}
            </Text>
            <TextInput
              testID="rename-input"
              value={newName}
              onChangeText={setNewName}
              placeholder="Joueur"
              placeholderTextColor={colors.onSurfaceTertiary}
              maxLength={24}
              style={styles.input}
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity testID="rename-cancel" style={styles.modalSecondary} onPress={() => setRenameOpen(false)}>
                <Text style={styles.modalSecondaryLabel}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="rename-save"
                style={[styles.modalPrimary, (renameCost > 0 && (profile?.coins || 0) < renameCost) && { opacity: 0.4 }]}
                disabled={saving || (renameCost > 0 && (profile?.coins || 0) < renameCost)}
                onPress={submitRename}
              >
                {saving ? <ActivityIndicator color="#0a0a0a" /> : (
                  <Text style={styles.modalPrimaryLabel}>
                    {renameCost === 0 ? 'Enregistrer · Gratuit' : `Enregistrer · ${renameCost} pièces`}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SafeAreaView edges={['bottom']} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, paddingBottom: 120 },
  tabs: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(20,20,20,0.7)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  tabActive: { borderColor: 'rgba(245,200,81,0.45)', backgroundColor: 'rgba(245,200,81,0.10)' },
  tabLabel: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  tabLabelActive: { color: colors.brand },

  intro: { marginBottom: spacing.md },
  introTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  introBody: { color: colors.onSurfaceTertiary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  renameBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(245,200,81,0.08)',
    borderRadius: radii.pill,
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.25)',
    alignSelf: 'flex-start', marginTop: 10,
  },
  renameLabel: { color: colors.brand, fontSize: 12, fontWeight: '600' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12,
    backgroundColor: 'rgba(20,20,20,0.7)',
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowMe: {
    borderColor: 'rgba(245,200,81,0.45)',
    backgroundColor: 'rgba(245,200,81,0.08)',
  },
  rankBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  rankBadgeTop: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  rankText: { color: colors.onSurface, fontWeight: '700', fontSize: 12 },
  rankTextTop: { color: '#0a0a0a' },
  name: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  starsBlock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  starsText: { color: colors.brand, fontSize: 14, fontWeight: '700' },

  empty: { alignItems: 'center', padding: 40 },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyBody: { color: colors.onSurfaceTertiary, fontSize: 12, textAlign: 'center', marginTop: 6 },

  meFooter: {
    position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 0,
    paddingTop: 8,
  },

  modalScrim: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: 'rgba(15,15,15,0.98)',
    borderRadius: radii.lg, borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
    padding: spacing.lg,
  },
  modalTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  modalSub: { color: colors.onSurfaceTertiary, fontSize: 12, marginBottom: 12 },
  input: {
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderRadius: radii.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    padding: 12, color: colors.onSurface, fontSize: 14,
  },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalSecondary: {
    flex: 1, paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
  },
  modalSecondaryLabel: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  modalPrimary: {
    flex: 1, paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
  },
  modalPrimaryLabel: { color: '#0a0a0a', fontSize: 13, fontWeight: '700' },
});
