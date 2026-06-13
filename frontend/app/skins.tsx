import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii } from '@/src/theme';
import { api } from '@/src/api/client';
import { useProfile } from '@/src/state/profile';
import { hapticLight, hapticSuccess, play } from '@/src/audio/feedback';
import { BoardMotif, BallVisual } from '@/src/skins/visuals';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

const TIER_COLOR: Record<string, string> = {
  common: '#9aa0a6',
  uncommon: '#32A852',
  rare: '#3aa6f0',  // visual hint only (used for label badge, not for game dots)
  epic: '#E91E63',
  legendary: '#FFC107',
  developer: '#98FF98',
};

type Skin = any;

export default function SkinsScreen() {
  const { profile, setServerCoins } = useProfile();
  const [data, setData] = useState<{ board: Skin[]; ball: Skin[] } | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [active, setActive] = useState<{ board?: string; ball?: string }>({});
  const [tab, setTab] = useState<'board' | 'ball'>('board');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.skins(profile?.device_id);
      setData(r.catalog);
      setOwned(r.owned);
      setActive(r.active);
    } finally { setLoading(false); }
  }, [profile?.device_id]);

  useEffect(() => { reload(); }, [reload]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const buyWithCoins = async (s: Skin) => {
    if (!profile) return;
    if (profile.coins < s.coins) { showToast('Pas assez de pièces'); return; }
    setBusy(s.id);
    try {
      const res = await api.buySkin(profile.device_id, s.id);
      setServerCoins(res.coins);
      await reload();
      play('coin'); hapticSuccess();
      showToast(`${s.name} débloqué !`);
    } catch (e: any) {
      showToast('Erreur achat');
    } finally { setBusy(null); }
  };

  const buyWithStripe = async (s: Skin) => {
    if (!profile) return;
    setBusy(s.id);
    try {
      const origin = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : BACKEND_URL;
      const res = await api.skinCheckout(profile.device_id, s.id, origin);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.open(res.url, '_blank');
      } else {
        await WebBrowser.openBrowserAsync(res.url);
      }
      showToast('Continue le paiement dans le navigateur…');
    } catch {
      showToast('Erreur paiement');
    } finally { setBusy(null); }
  };

  const activate = async (s: Skin) => {
    if (!profile) return;
    hapticLight();
    setBusy(s.id);
    try {
      await api.activateSkin(profile.device_id, s.id);
      await reload();
      showToast(`${s.name} activé`);
    } finally { setBusy(null); }
  };

  return (
    <View style={styles.root} testID="skins-screen">
      <LinearGradient
        colors={['rgba(245,200,81,0.08)', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <TopBar title="Skins" subtitle="Plateaux & sphères" />

      <View style={styles.tabs}>
        <TouchableOpacity
          testID="tab-board"
          style={[styles.tab, tab === 'board' && styles.tabActive]}
          onPress={() => { hapticLight(); setTab('board'); }}
        >
          <Ionicons name="grid" size={14} color={tab === 'board' ? colors.brand : colors.onSurfaceTertiary} />
          <Text style={[styles.tabLabel, tab === 'board' && styles.tabLabelActive]}>Plateaux</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-ball"
          style={[styles.tab, tab === 'ball' && styles.tabActive]}
          onPress={() => { hapticLight(); setTab('ball'); }}
        >
          <Ionicons name="ellipse" size={14} color={tab === 'ball' ? colors.brand : colors.onSurfaceTertiary} />
          <Text style={[styles.tabLabel, tab === 'ball' && styles.tabLabelActive]}>Sphères</Text>
        </TouchableOpacity>
      </View>

      {loading || !data ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {(tab === 'board' ? data.board : data.ball).map((s: Skin) => {
            const isOwned = owned.includes(s.id);
            const isActive = active[tab] === s.id;
            const isDeveloper = s.tier === 'developer';
            return (
              <View
                key={s.id}
                testID={`skin-${s.id}`}
                style={[styles.card, isActive && { borderColor: colors.brand + 'CC' }]}
              >
                <LinearGradient
                  colors={[TIER_COLOR[s.tier] + '20', 'transparent']}
                  style={StyleSheet.absoluteFill}
                />
                {/* Preview */}
                <View style={styles.preview}>
                  {tab === 'board' ? (
                    <View style={[styles.boardPreview, { backgroundColor: s.bg }]}>
                      <BoardMotif skinId={s.id} size={84} />
                      <View style={styles.boardPreviewDots}>
                        <View style={[styles.previewDot, { backgroundColor: s.accent, shadowColor: s.accent }]} />
                        <View style={[styles.previewDot, { backgroundColor: s.accent, shadowColor: s.accent }]} />
                      </View>
                    </View>
                  ) : (
                    <BallVisual color="#32A852" size={72} skinId={s.id} />
                  )}
                </View>
                {/* Info */}
                <View style={{ flex: 1 }}>
                  <View style={styles.headerRow}>
                    <Text style={styles.name}>{s.name}</Text>
                    <View style={[styles.tierBadge, { backgroundColor: TIER_COLOR[s.tier] + '30', borderColor: TIER_COLOR[s.tier] + '80' }]}>
                      <Text style={[styles.tierText, { color: TIER_COLOR[s.tier] }]}>{s.tier_label}</Text>
                    </View>
                  </View>
                  <Text style={styles.desc} numberOfLines={2}>{s.description}</Text>
                  <Text style={styles.meta}>≈ {s.ads} pubs</Text>

                  {/* Buttons */}
                  <View style={styles.actions}>
                    {isActive ? (
                      <View style={[styles.btn, styles.btnActive]}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
                        <Text style={styles.btnActiveLabel}>Équipé</Text>
                      </View>
                    ) : isOwned ? (
                      <TouchableOpacity testID={`equip-${s.id}`} style={[styles.btn, styles.btnPrimary]} onPress={() => activate(s)} disabled={busy !== null}>
                        <Text style={styles.btnPrimaryLabel}>Équiper</Text>
                      </TouchableOpacity>
                    ) : isDeveloper ? (
                      <View style={[styles.btn, styles.btnLocked]}>
                        <Ionicons name="lock-closed" size={12} color={colors.onSurfaceTertiary} />
                        <Text style={styles.btnLockedLabel}>Réservé Dev</Text>
                      </View>
                    ) : (
                      <>
                        <TouchableOpacity
                          testID={`buy-coins-${s.id}`}
                          style={[styles.btn, styles.btnCoins]}
                          onPress={() => buyWithCoins(s)}
                          disabled={busy !== null}
                        >
                          {busy === s.id ? <ActivityIndicator size="small" color={colors.brand} /> : (
                            <>
                              <Ionicons name="ellipse" size={10} color={colors.brand} />
                              <Text style={styles.btnCoinsLabel}>{s.coins}</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID={`buy-stripe-${s.id}`}
                          style={[styles.btn, styles.btnStripe]}
                          onPress={() => buyWithStripe(s)}
                          disabled={busy !== null}
                        >
                          <Ionicons name="card" size={12} color="#0a0a0a" />
                          <Text style={styles.btnStripeLabel}>${s.usd.toFixed(2)}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
          <SafeAreaView edges={['bottom']} />
        </ScrollView>
      )}

      {toast ? (
        <View style={styles.toast} testID="skins-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

function BoardGridPreview({ gridLine, accent }: { gridLine: string; accent: string }) {
  return (
    <View style={{ flex: 1 }}>
      {Array.from({ length: 4 }).map((_, r) => (
        <View key={r} style={{ flex: 1, flexDirection: 'row' }}>
          {Array.from({ length: 4 }).map((__, c) => (
            <View key={c} style={{ flex: 1, borderWidth: 0.5, borderColor: gridLine, alignItems: 'center', justifyContent: 'center' }}>
              {(r === 0 && c === 0) || (r === 3 && c === 3) ? (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent, shadowColor: accent, shadowOpacity: 0.9, shadowRadius: 6 }} />
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function BallPreview({ style, ringOpacity, glow }: { style: string; ringOpacity: number; glow: number }) {
  const color = '#32A852';
  const size = 36;
  return (
    <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
      {style !== 'solid' ? (
        <View style={{
          position: 'absolute', width: size + 14, height: size + 14, borderRadius: (size + 14) / 2,
          borderWidth: 2, borderColor: color, opacity: ringOpacity,
        }} />
      ) : null}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        shadowColor: color, shadowOpacity: 0.9 * glow, shadowRadius: 12 * glow,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.30)',
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  tabs: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
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

  scroll: { padding: spacing.lg, paddingBottom: 80, gap: spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14,
    backgroundColor: 'rgba(20,20,20,0.78)',
    borderRadius: radii.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  preview: {
    width: 84, height: 84,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  boardPreview: { flex: 1, alignSelf: 'stretch', position: 'relative' },
  boardPreviewDots: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  previewDot: {
    width: 10, height: 10, borderRadius: 5,
    shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: '700', flex: 1 },
  tierBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1 },
  tierText: { fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  desc: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4, lineHeight: 16 },
  meta: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 4, letterSpacing: 1 },

  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radii.pill,
  },
  btnCoins: {
    backgroundColor: 'rgba(245,200,81,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
  },
  btnCoinsLabel: { color: colors.brand, fontSize: 12, fontWeight: '700' },
  btnStripe: { backgroundColor: colors.brand },
  btnStripeLabel: { color: '#0a0a0a', fontSize: 12, fontWeight: '700' },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryLabel: { color: '#0a0a0a', fontSize: 12, fontWeight: '700' },
  btnActive: { backgroundColor: 'rgba(245,200,81,0.10)', borderWidth: 1, borderColor: 'rgba(245,200,81,0.45)' },
  btnActiveLabel: { color: colors.brand, fontSize: 12, fontWeight: '700' },
  btnLocked: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  btnLockedLabel: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },

  toast: {
    position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 30,
    padding: 12, borderRadius: radii.md,
    backgroundColor: 'rgba(15,15,15,0.96)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
    alignItems: 'center',
  },
  toastText: { color: colors.onSurface, fontSize: 13 },
});
