import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, radii } from '@/src/theme';
import { api } from '@/src/api/client';
import { useProfile } from '@/src/state/profile';
import { hapticSuccess, play } from '@/src/audio/feedback';

export default function CheckoutReturn() {
  const params = useLocalSearchParams<{ session_id?: string }>();
  const router = useRouter();
  const { syncNow } = useProfile();
  const [status, setStatus] = useState<'checking' | 'success' | 'pending' | 'error'>('checking');
  const [coinsAdded, setCoinsAdded] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll(attempts = 0) {
      if (cancelled) return;
      if (!params.session_id) { setStatus('error'); return; }
      try {
        const res = await api.checkoutStatus(params.session_id);
        if (res.credited) {
          await syncNow();
          play('coin');
          hapticSuccess();
          setCoinsAdded(res.coins_added);
          setStatus('success');
          return;
        }
        if (res.status === 'expired') { setStatus('error'); return; }
        if (attempts > 20) { setStatus('pending'); return; }
        setTimeout(() => poll(attempts + 1), 2000);
      } catch {
        if (attempts > 20) { setStatus('error'); return; }
        setTimeout(() => poll(attempts + 1), 2000);
      }
    }
    poll();
    return () => { cancelled = true; };
  }, [params.session_id, syncNow]);

  return (
    <View style={styles.root} testID="checkout-return">
      <LinearGradient colors={['rgba(245,200,81,0.10)', '#050505']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.card}>
          {status === 'checking' && (
            <>
              <ActivityIndicator color={colors.brand} size="large" />
              <Text style={styles.title}>Vérification du paiement…</Text>
              <Text style={styles.body}>Quelques secondes seulement.</Text>
            </>
          )}
          {status === 'success' && (
            <>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={56} color={colors.brand} />
              </View>
              <Text style={styles.title}>Paiement confirmé</Text>
              <Text style={styles.body}>+{coinsAdded} pièces ajoutées à ton solde.</Text>
              <TouchableOpacity
                testID="checkout-continue"
                style={styles.primaryBtn}
                onPress={() => router.replace('/')}
              >
                <Text style={styles.primaryLabel}>Retour à l&apos;accueil</Text>
              </TouchableOpacity>
            </>
          )}
          {status === 'pending' && (
            <>
              <Ionicons name="time-outline" size={48} color={colors.brand} />
              <Text style={styles.title}>Traitement en cours</Text>
              <Text style={styles.body}>Tes pièces seront créditées sous peu.</Text>
              <TouchableOpacity
                testID="checkout-back"
                style={styles.primaryBtn}
                onPress={() => router.replace('/shop')}
              >
                <Text style={styles.primaryLabel}>Retour boutique</Text>
              </TouchableOpacity>
            </>
          )}
          {status === 'error' && (
            <>
              <Ionicons name="alert-circle" size={48} color={colors.error} />
              <Text style={styles.title}>Impossible de confirmer</Text>
              <Text style={styles.body}>Aucune charge n&apos;a été appliquée. Réessaie depuis la boutique.</Text>
              <TouchableOpacity
                testID="checkout-retry"
                style={styles.primaryBtn}
                onPress={() => router.replace('/shop')}
              >
                <Text style={styles.primaryLabel}>Retour boutique</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%', maxWidth: 380,
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.25)',
    alignItems: 'center',
  },
  successIcon: { marginBottom: 4 },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  body: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    marginTop: 20,
    paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  primaryLabel: { color: '#0a0a0a', fontSize: 13, fontWeight: '700' },
});
