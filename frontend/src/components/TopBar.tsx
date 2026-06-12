import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { colors, spacing, typography, radii } from '@/src/theme';
import { useProfile } from '@/src/state/profile';
import { hapticTap } from '@/src/audio/feedback';

type Props = {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightActions?: React.ReactNode;
  showCoins?: boolean;
  style?: ViewStyle;
};

export function TopBar({ title, subtitle, showBack = true, rightActions, showCoins = true, style }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useProfile();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }, style]} testID="top-bar">
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.row}>
        <View style={styles.side}>
          {showBack ? (
            <TouchableOpacity
              testID="back-button"
              style={styles.iconBtn}
              onPress={() => { hapticTap(); router.back(); }}
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </TouchableOpacity>
          ) : <View style={{ width: 36 }} />}
        </View>
        <View style={styles.center}>
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          {showCoins && profile ? (
            <TouchableOpacity
              testID="header-coins"
              style={styles.coinChip}
              onPress={() => { hapticTap(); router.push('/shop'); }}
            >
              <Ionicons name="ellipse" size={10} color={colors.brand} />
              <Text style={styles.coinText}>{profile.coins}</Text>
              <Ionicons name="add" size={12} color={colors.brand} />
            </TouchableOpacity>
          ) : null}
          {rightActions}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(5,5,5,0.6)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  side: { width: 96, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center' },
  title: {
    color: colors.onSurface,
    fontSize: typography.sizes.lg,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sizes.sm,
    marginTop: 2,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.glassLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  coinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(245,200,81,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.25)',
  },
  coinText: {
    color: colors.brand, fontSize: 13, fontWeight: '700', marginLeft: 2,
  },
});
