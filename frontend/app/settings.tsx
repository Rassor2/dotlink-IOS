import React from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii } from '@/src/theme';
import { useProfile } from '@/src/state/profile';
import { hapticTap, setAudioPrefs } from '@/src/audio/feedback';
import { useRouter } from 'expo-router';

export default function Settings() {
  const { profile, updateSettings } = useProfile();
  const router = useRouter();
  const s = profile?.settings || { sound: true, music: true, haptics: true };

  const toggle = (key: 'sound' | 'music' | 'haptics') => async (next: boolean) => {
    hapticTap();
    const patch = { [key]: next } as any;
    await updateSettings(patch);
    setAudioPrefs({ ...s, [key]: next });
  };

  return (
    <View style={styles.root} testID="settings-screen">
      <LinearGradient
        colors={['rgba(50,168,82,0.06)', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <TopBar title="Réglages" subtitle="Personnalise ton expérience" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Row
          testID="settings-sound"
          icon="volume-high"
          title="Effets sonores"
          desc="Sons de connexion et de victoire"
          value={s.sound}
          onChange={toggle('sound')}
        />
        <Row
          testID="settings-music"
          icon="musical-notes"
          title="Musique d'ambiance"
          desc="Drone cosmique léger (à venir)"
          value={s.music}
          onChange={toggle('music')}
        />
        <Row
          testID="settings-haptics"
          icon="phone-portrait"
          title="Retour haptique"
          desc="Vibrations subtiles"
          value={s.haptics}
          onChange={toggle('haptics')}
        />

        <TouchableOpacity
          testID="settings-replay-tutorial"
          style={styles.tutBtn}
          onPress={() => { hapticTap(); router.push('/tutorial'); }}
          activeOpacity={0.85}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="book-outline" size={18} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Revoir le tutoriel</Text>
            <Text style={styles.rowDesc}>Suis à nouveau l&apos;intro avec Vega</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
        </TouchableOpacity>
        <View style={styles.about}>
          <Text style={styles.aboutTitle}>Dot Link</Text>
          <Text style={styles.aboutBody}>
            Un voyage cosmique en cinq mondes.{'\n'}
            Tisse les constellations · Rallume l&apos;univers.
          </Text>
          <Text style={styles.aboutMeta}>v1.0 · Données locales + sync cloud</Text>
        </View>
        <SafeAreaView edges={['bottom']} />
      </ScrollView>
    </View>
  );
}

function Row({ icon, title, desc, value, onChange, testID }: {
  icon: any; title: string; desc: string; value: boolean;
  onChange: (v: boolean) => void; testID: string;
}) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(255,255,255,0.10)', true: colors.brand }}
        thumbColor={value ? '#0a0a0a' : '#f4f3f4'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl3, gap: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
    backgroundColor: 'rgba(20,20,20,0.65)',
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,200,81,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.25)',
  },
  rowTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '600' },
  rowDesc: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },

  tutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
    backgroundColor: 'rgba(245,200,81,0.06)',
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
    marginTop: spacing.xs,
  },

  about: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(20,20,20,0.50)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  aboutTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  aboutBody: {
    color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18,
    textAlign: 'center', marginTop: 8,
  },
  aboutMeta: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5, marginTop: 10 },
});
