import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii } from '@/src/theme';
import { api, type Pack } from '@/src/api/client';
import { useProfile } from '@/src/state/profile';
import { hapticLight, hapticSuccess, play } from '@/src/audio/feedback';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

export default function Shop() {
  const router = useRouter();
  const { profile, addCoins, syncNow } = useProfile();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [pollingSession, setPollingSession] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.packs()
      .then((r) => setPacks(r.packs))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const pollStatus = useCallback(async (sessionId: string, attempts = 0) => {
    if (attempts > 30) {
      setBusyPack(null);
      setPollingSession(null);
      return;
    }
    try {
      const status = await api.checkoutStatus(sessionId);
      if (status.credited) {
        // Refresh profile from server
        await syncNow();
        play('coin');
        hapticSuccess();
        showToast(`+${status.coins_added} pièces ajoutées !`);
        setBusyPack(null);
        setPollingSession(null);
        return;
      }
      if (status.status === 'expired') {
        setBusyPack(null);
        setPollingSession(null);
        showToast('Session expirée');
        return;
      }
    } catch (e) {
      // ignore
    }
    pollTimer.current = setTimeout(() => pollStatus(sessionId, attempts + 1), 2000);
  }, [syncNow]);

  const buy = async (pack: Pack) => {
    if (!profile) return;
    hapticLight();
    setBusyPack(pack.id);
    try {
      const origin = BACKEND_URL;
      const res = await api.checkoutCreate(profile.device_id, pack.id, origin);
      setPollingSession(res.session_id);
      if (Platform.OS === 'web') {
        // Open in current tab so success redirect lands back in app
        // On web preview, opening in a new tab keeps the polling going here
        if (typeof window !== 'undefined') window.open(res.url, '_blank');
      } else {
        await WebBrowser.openBrowserAsync(res.url);
      }
      pollStatus(res.session_id, 0);
    } catch (e) {
      setBusyPack(null);
      showToast('Erreur de paiement');
    }
  };

  return (
    <View style={styles.root} testID="shop-screen">
      <LinearGradient
        colors={['rgba(245,200,81,0.08)', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <TopBar title="Boutique" subtitle="Achete des pièces cosmiques" />
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.intro}>
            Utilise tes pièces pour révéler des indices ou rejouer plus vite. Tu peux aussi
            regarder une vidéo bonus pour gagner gratuitement.
          </Text>

          {/* Free coin via mock ad */}
          <TouchableOpacity
            testID="shop-reward-ad"
            style={styles.adRow}
            onPress={async () => {
              if (!profile) return;
              hapticLight();
              try {
                await api.reward(profile.device_id, 50);
                await syncNow();
              } catch {
                await addCoins(50);
              }
              play('coin');
              hapticSuccess();
              showToast('+50 pièces');
            }}
            activeOpacity={0.85}
          >
            <View style={styles.adBadge}><Text style={styles.adBadgeText}>PUB</Text></View>
            <Ionicons name="play-circle" size={22} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.adTitle}>Regarder une vidéo bonus</Text>
              <Text style={styles.adSub}>Gagne +50 pièces gratuites · Démo</Text>
            </View>
            <Ionicons name="add-circle" size={22} color={colors.brand} />
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Packs de pièces</Text>
          <View style={styles.grid}>
            {packs.map((p, idx) => (
              <TouchableOpacity
                key={p.id}
                testID={`pack-${p.id}`}
                style={[styles.card, idx % 2 === 1 ? { marginLeft: spacing.md } : null]}
                onPress={() => buy(p)}
                disabled={busyPack !== null}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['rgba(245,200,81,0.18)', 'transparent']}
                  style={StyleSheet.absoluteFill}
                />
                {p.bonus > 0 ? (
                  <View style={styles.bonusBadge}>
                    <Text style={styles.bonusText}>+{Math.round((p.bonus / p.coins) * 100)}%</Text>
                  </View>
                ) : null}
                <View style={styles.coinIcon}>
                  <Ionicons name="ellipse" size={28} color={colors.brand} />
                </View>
                <Text style={styles.coinAmount}>{p.total.toLocaleString()}</Text>
                <Text style={styles.coinLabel}>pièces</Text>
                {p.bonus > 0 ? (
                  <Text style={styles.coinBonus}>+{p.bonus} bonus</Text>
                ) : <View style={{ height: 16 }} />}
                <View style={styles.priceBtn}>
                  {busyPack === p.id ? (
                    <ActivityIndicator size="small" color="#0a0a0a" />
                  ) : (
                    <Text style={styles.priceText}>${p.amount.toFixed(2)}</Text>
                  )}
                </View>
                <Text style={styles.packName}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.legal}>
            Paiement sécurisé par Stripe. Cartes test Stripe acceptées en mode démo.{'\n'}
            Carte test : 4242 4242 4242 4242 · n&apos;importe quelle date future · n&apos;importe quel CVC.
          </Text>
        </ScrollView>
      )}

      {pollingSession ? (
        <View style={styles.polling} testID="polling-banner">
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.pollingText}>
            En attente de confirmation du paiement…
          </Text>
        </View>
      ) : null}

      {toast ? (
        <View style={styles.toast} testID="shop-toast">
          <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: 120 },

  intro: {
    color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 20,
    marginBottom: spacing.lg,
  },

  adRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(245,200,81,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.25)',
    marginBottom: spacing.lg,
  },
  adBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, backgroundColor: 'rgba(245,200,81,0.25)',
  },
  adBadgeText: { color: colors.brand, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  adTitle: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  adSub: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },

  sectionTitle: {
    color: colors.onSurface, fontSize: 16, fontWeight: '600',
    marginTop: spacing.sm, marginBottom: spacing.md,
    letterSpacing: 0.4,
  },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md,
  },
  card: {
    width: '47%',
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.20)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  bonusBadge: {
    position: 'absolute', top: 10, right: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  bonusText: { color: '#140F00', fontSize: 10, fontWeight: '800' },
  coinIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(245,200,81,0.10)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4, marginBottom: 8,
    shadowColor: colors.brand, shadowOpacity: 0.4, shadowRadius: 12,
  },
  coinAmount: { color: colors.onSurface, fontSize: 22, fontWeight: '700' },
  coinLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  coinBonus: { color: colors.brand, fontSize: 11, marginTop: 4, fontWeight: '600' },
  priceBtn: {
    marginTop: 12, paddingHorizontal: 18, paddingVertical: 8,
    backgroundColor: colors.brand, borderRadius: radii.pill,
    minWidth: 84, alignItems: 'center',
  },
  priceText: { color: '#0a0a0a', fontSize: 14, fontWeight: '800' },
  packName: {
    color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 8,
    letterSpacing: 1, textTransform: 'uppercase',
  },

  legal: {
    marginTop: spacing.xl, color: colors.onSurfaceTertiary,
    fontSize: 10, lineHeight: 16, textAlign: 'center',
  },

  polling: {
    position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 24,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: radii.md,
    backgroundColor: 'rgba(15,15,15,0.96)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
  },
  pollingText: { color: colors.onSurface, fontSize: 13, flex: 1 },

  toast: {
    position: 'absolute', left: spacing.lg, right: spacing.lg, top: 80,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: radii.md,
    backgroundColor: 'rgba(15,15,15,0.97)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
  },
  toastText: { color: colors.onSurface, fontSize: 13, flex: 1 },
});
