import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing, withDelay,
} from 'react-native-reanimated';

import { colors, spacing, radii } from '@/src/theme';
import { useProfile } from '@/src/state/profile';
import { api } from '@/src/api/client';
import { hapticLight, hapticSuccess, play } from '@/src/audio/feedback';

const STEPS = [
  {
    icon: 'planet',
    title: 'Bienvenue, Tisseur',
    body: "Je suis Vega, gardien des constellations. L\u2019univers s\u2019est ass\u00e9ch\u00e9 et chaque \u00e9toile attend qu\u2019on la relie. Tu vas m\u2019aider \u00e0 rallumer cinq mondes.",
  },
  {
    icon: 'finger-print',
    title: 'Comment jouer',
    body: "Touche un point coloré et glisse jusqu\u2019au point jumeau de même couleur. Sans croiser les lignes. Quand toutes les paires sont connectées, la constellation est complète.",
  },
  {
    icon: 'sparkles',
    title: 'Étoiles & pièces',
    body: "Résous chaque niveau en un seul trait par couleur pour gagner 3 étoiles. Les étoiles te donnent des pièces, et les pièces te débloquent des indices, des skins et des plateaux uniques.",
  },
  {
    icon: 'color-palette',
    title: 'Skins cosmiques',
    body: "Six raretés de plateaux et de sphères t\u2019attendent dans la boutique : Commun, Peu commun, Rare, Épique, Légendaire, et le mythique Développeur.",
  },
  {
    icon: 'trophy',
    title: 'Classement & amis',
    body: "Grimpe dans le Top 100 mondial ou défie tes amis avec ton code unique à 6 caractères. Partage-le pour bâtir ton propre cercle de Tisseurs.",
  },
  {
    icon: 'gift',
    title: 'Ta récompense',
    body: "Tu es prêt. Pour t\u2019accueillir, je t\u2019offre 150 pièces — de quoi tester un indice ou commencer un skin Peu commun. Bonne route, Tisseur.",
  },
];

export default function Tutorial() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, refresh } = useProfile();
  const [step, setStep] = useState(0);
  const [completing, setCompleting] = useState(false);

  const breath = useSharedValue(0);
  useEffect(() => {
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [breath]);
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.06 }],
    shadowOpacity: 0.5 + breath.value * 0.4,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + breath.value * 0.5,
    transform: [{ scale: 1 + breath.value * 0.15 }],
  }));

  const next = async () => {
    hapticLight();
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    if (!profile || completing) return;
    setCompleting(true);
    try {
      const res = await api.tutorialComplete(profile.device_id);
      if (res.reward > 0) { play('coin'); hapticSuccess(); }
      await refresh();
    } finally {
      setCompleting(false);
      router.replace('/');
    }
  };

  const current = STEPS[step];

  return (
    <View style={styles.root} testID="tutorial-screen">
      <LinearGradient
        colors={['rgba(50,168,82,0.10)', 'rgba(245,200,81,0.06)', '#050505']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* progress dots */}
        <View style={styles.progress}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.center}>
          <Animated.View style={[styles.ring, ringStyle]} />
          <Animated.View style={[styles.avatar, avatarStyle]}>
            <Ionicons name="planet" size={56} color={colors.brand} />
          </Animated.View>
          <Text style={styles.avatarName}>VEGA · Gardien</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.iconRow}>
            <Ionicons name={current.icon as any} size={20} color={colors.brand} />
            <Text style={styles.cardKicker}>ÉTAPE {step + 1} / {STEPS.length}</Text>
          </View>
          <Text style={styles.cardTitle}>{current.title}</Text>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.cardBody}>{current.body}</Text>
          </ScrollView>

          <TouchableOpacity
            testID="tutorial-continue"
            style={styles.cta}
            onPress={next}
            activeOpacity={0.88}
            disabled={completing}
          >
            <Text style={styles.ctaLabel}>
              {step < STEPS.length - 1 ? 'Continuer' : 'Recevoir mes 150 pièces'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#0a0a0a" />
          </TouchableOpacity>
          <Text style={styles.mandatory}>Tutoriel obligatoire · une fois suffit</Text>
        </View>

        <View style={{ height: insets.bottom + 12 }} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  safe: { flex: 1, paddingHorizontal: spacing.lg },

  progress: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingTop: 8, paddingBottom: 16,
  },
  dot: {
    width: 26, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  dotActive: { backgroundColor: colors.brand },

  center: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  ring: {
    position: 'absolute', top: 10, width: 120, height: 120, borderRadius: 60,
    borderWidth: 2, borderColor: colors.brand,
  },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(20,20,20,0.85)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(245,200,81,0.45)',
    shadowColor: colors.brand,
    shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
  },
  avatarName: {
    marginTop: 14,
    color: colors.brand, fontSize: 11, letterSpacing: 3, fontWeight: '700',
  },

  card: {
    backgroundColor: 'rgba(15,15,15,0.96)',
    borderRadius: radii.lg, borderWidth: 1,
    borderColor: 'rgba(245,200,81,0.30)',
    padding: 20,
  },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardKicker: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  cardTitle: { color: colors.onSurface, fontSize: 22, fontWeight: '700', marginTop: 6, letterSpacing: -0.4 },
  cardBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 22, marginTop: 12 },

  cta: {
    marginTop: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
  },
  ctaLabel: { color: '#0a0a0a', fontSize: 14, fontWeight: '700', letterSpacing: 0.4 },
  mandatory: {
    color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5,
    textAlign: 'center', marginTop: 10, textTransform: 'uppercase',
  },
});
