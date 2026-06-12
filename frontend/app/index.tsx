import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  withSequence,
} from 'react-native-reanimated';

import { colors, spacing, radii, typography } from '@/src/theme';
import { useProfile } from '@/src/state/profile';
import { hapticTap, setAudioPrefs, setMusicPlaying } from '@/src/audio/feedback';

const BG = 'https://images.pexels.com/photos/33441868/pexels-photo-33441868.jpeg';
const { width } = Dimensions.get('window');

function PulsingDot({ delay = 0, size = 6, color = '#F5C851', x = 0, y = 0 }) {
  const opacity = useSharedValue(0.2);
  const scale = useSharedValue(0.6);
  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.2, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.1, { duration: 1400 }),
          withTiming(0.6, { duration: 1400 }),
        ),
        -1,
      ),
    );
  }, [delay, opacity, scale]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute', left: x, top: y, width: size, height: size,
          borderRadius: size / 2, backgroundColor: color,
          shadowColor: color, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

export default function Home() {
  const router = useRouter();
  const { profile } = useProfile();

  useEffect(() => {
    if (profile) {
      setAudioPrefs({
        sound: profile.settings.sound,
        music: profile.settings.music,
        haptics: profile.settings.haptics,
      });
      if (profile.settings.music) setMusicPlaying(true);
      // Force tutorial on first run
      if (profile.tutorial_done === false) {
        router.replace('/tutorial');
      }
    }
  }, [profile, router]);

  const titleScale = useSharedValue(0.92);
  useEffect(() => {
    titleScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.97, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [titleScale]);
  const titleStyle = useAnimatedStyle(() => ({ transform: [{ scale: titleScale.value }] }));

  return (
    <View style={styles.root} testID="home-screen">
      <ImageBackground source={{ uri: BG }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={2}>
        <LinearGradient
          colors={['rgba(5,5,5,0.55)', 'rgba(5,5,5,0.85)', '#050505']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      {/* Ambient dots (battery-friendly: 3 layers instead of 5) */}
      <PulsingDot x={width * 0.18} y={140} size={5} color="#98FF98" delay={0} />
      <PulsingDot x={width * 0.72} y={360} size={5} color="#E91E63" delay={1300} />
      <PulsingDot x={width * 0.10} y={420} size={3} color="#F5C851" delay={1700} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Top header (coins) */}
        <View style={styles.topRow}>
          <TouchableOpacity testID="profile-link" style={styles.iconPill} onPress={() => { hapticTap(); router.push('/profile'); }}>
            <Ionicons name="person-circle-outline" size={20} color={colors.onSurface} />
            <Text style={styles.iconPillText}>{profile?.name || 'Joueur'}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity testID="settings-link" style={styles.iconBtn} onPress={() => { hapticTap(); router.push('/settings'); }}>
            <Ionicons name="settings-outline" size={20} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity testID="home-coins" style={styles.coinChip} onPress={() => { hapticTap(); router.push('/shop'); }}>
            <Ionicons name="ellipse" size={10} color={colors.brand} />
            <Text style={styles.coinText}>{profile?.coins ?? 0}</Text>
            <Ionicons name="add" size={14} color={colors.brand} />
          </TouchableOpacity>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Animated.View style={titleStyle}>
            <Text style={styles.kicker}>UN VOYAGE COSMIQUE</Text>
            <Text style={styles.title}>Dot{'  '}<Text style={{ color: colors.brand }}>Link</Text></Text>
            <Text style={styles.tagline}>Relie les étoiles. Trace la voie. Remplis l&apos;infini.</Text>
          </Animated.View>
        </View>

        {/* CTAs */}
        <View style={styles.ctas}>
          <BlurView intensity={30} tint="dark" style={styles.primaryCard}>
            <TouchableOpacity
              testID="play-button"
              style={styles.primaryBtn}
              onPress={() => { hapticTap(); router.push('/worlds'); }}
              activeOpacity={0.85}
            >
              <View style={styles.primaryInner}>
                <View>
                  <Text style={styles.primaryLabel}>JOUER</Text>
                  <Text style={styles.primarySub}>5 mondes · 400 niveaux</Text>
                </View>
                <View style={styles.primaryIcon}>
                  <Ionicons name="play" size={22} color={colors.onBrandPrimary} />
                </View>
              </View>
            </TouchableOpacity>
          </BlurView>

          <View style={styles.secondaryRow}>
            <TouchableOpacity testID="shop-cta" style={styles.secondaryBtn} onPress={() => { hapticTap(); router.push('/shop'); }}>
              <Ionicons name="diamond-outline" size={18} color={colors.brand} />
              <Text style={styles.secondaryLabel}>Boutique</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="leaderboard-cta" style={styles.secondaryBtn} onPress={() => { hapticTap(); router.push('/leaderboard'); }}>
              <Ionicons name="trophy-outline" size={18} color={colors.brand} />
              <Text style={styles.secondaryLabel}>Classement</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="profile-cta" style={styles.secondaryBtn} onPress={() => { hapticTap(); router.push('/profile'); }}>
              <Ionicons name="person-outline" size={18} color={colors.brand} />
              <Text style={styles.secondaryLabel}>Profil</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footer}>v1.0 · Lumina → Aurora → Zenith → Eclipse → Void</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  safe: { flex: 1, paddingHorizontal: spacing.lg },
  topRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4,
  },
  iconPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  iconPillText: { color: colors.onSurface, fontSize: 12, fontWeight: '600' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  coinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(245,200,81,0.12)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
  },
  coinText: { color: colors.brand, fontSize: 13, fontWeight: '700' },

  hero: {
    flex: 1, justifyContent: 'center', paddingTop: spacing.xl3,
  },
  kicker: {
    color: colors.onSurfaceTertiary, fontSize: 12, letterSpacing: 4,
    fontWeight: '600',
  },
  title: {
    color: colors.onSurface,
    fontSize: 72,
    lineHeight: 78,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: -2,
  },
  tagline: {
    color: colors.onSurfaceSecondary, fontSize: 15, marginTop: 14, lineHeight: 22,
    maxWidth: 320,
  },

  ctas: { gap: spacing.md, marginBottom: spacing.lg },
  primaryCard: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245,200,81,0.30)',
    backgroundColor: 'rgba(245,200,81,0.05)',
  },
  primaryBtn: {
    backgroundColor: 'rgba(245,200,81,0.08)',
  },
  primaryInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg,
  },
  primaryLabel: {
    color: colors.onSurface, fontSize: 20, fontWeight: '700', letterSpacing: 4,
  },
  primarySub: {
    color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4, letterSpacing: 1,
  },
  primaryIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand, shadowOpacity: 0.6, shadowRadius: 16,
  },

  secondaryRow: { flexDirection: 'row', gap: spacing.md },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(20,20,20,0.65)',
  },
  secondaryLabel: { color: colors.onSurface, fontSize: 13, fontWeight: '600', letterSpacing: 1 },

  footer: {
    textAlign: 'center', color: colors.onSurfaceTertiary,
    fontSize: 10, letterSpacing: 2, marginBottom: 8,
  },
});
