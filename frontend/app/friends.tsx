import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Share, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii } from '@/src/theme';
import { api } from '@/src/api/client';
import { useProfile } from '@/src/state/profile';
import { hapticLight, hapticSuccess } from '@/src/audio/feedback';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

type Friend = { friend_code: string; name: string; stars: number; completed: number; coins: number };

export default function FriendsScreen() {
  const { profile } = useProfile();
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const myCode = profile?.friend_code || '';

  const reload = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const r = await api.friends(profile.device_id);
      setFriends(r.friends || []);
    } finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { reload(); }, [reload]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const addByCode = async () => {
    if (!profile || !code.trim()) return;
    setAdding(true);
    try {
      const res = await api.addFriend(profile.device_id, code.trim().toUpperCase());
      hapticSuccess();
      showToast(res.already ? `Déjà dans ta liste : ${res.added}` : `+ ${res.added} ajouté`);
      setCode('');
      await reload();
    } catch (e: any) {
      showToast('Code introuvable');
    } finally { setAdding(false); }
  };

  const remove = async (fc: string) => {
    if (!profile) return;
    hapticLight();
    try {
      await api.removeFriend(profile.device_id, fc);
      await reload();
    } catch {}
  };

  const sharedLink = `${BACKEND_URL}/friends?add=${myCode}`;

  const share = async () => {
    hapticLight();
    const text = `Rejoins-moi sur Dot Link ! Mon code Tisseur : ${myCode}\n${sharedLink}`;
    try {
      if (Platform.OS === 'web') {
        // @ts-ignore
        if (navigator.share) {
          // @ts-ignore
          await navigator.share({ title: 'Dot Link', text });
        } else {
          // @ts-ignore
          await navigator.clipboard.writeText(text);
          showToast('Lien copié');
        }
      } else {
        await Share.share({ message: text });
      }
    } catch {}
  };

  return (
    <View style={styles.root} testID="friends-screen">
      <LinearGradient
        colors={['rgba(50,168,82,0.10)', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <TopBar title="Amis" subtitle="Tisseurs alliés" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* My code card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeKicker}>TON CODE TISSEUR</Text>
          <Text style={styles.codeBig} testID="my-friend-code">{myCode || '------'}</Text>
          <Text style={styles.codeSub}>Partage-le pour que d&apos;autres t&apos;ajoutent</Text>
          <TouchableOpacity testID="share-code" style={styles.shareBtn} onPress={share} activeOpacity={0.88}>
            <Ionicons name="share-social" size={16} color="#0a0a0a" />
            <Text style={styles.shareLabel}>Partager mon code & lien</Text>
          </TouchableOpacity>
        </View>

        {/* Add friend */}
        <Text style={styles.section}>Ajouter par code</Text>
        <View style={styles.addRow}>
          <TextInput
            testID="add-friend-input"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="ABC123"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="characters"
            maxLength={6}
            style={styles.input}
          />
          <TouchableOpacity
            testID="add-friend-btn"
            style={[styles.addBtn, (!code.trim() || adding) && { opacity: 0.5 }]}
            onPress={addByCode}
            disabled={!code.trim() || adding}
          >
            {adding ? <ActivityIndicator size="small" color="#0a0a0a" /> : <Ionicons name="add" size={20} color="#0a0a0a" />}
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>Ma constellation ({friends.length})</Text>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} />
        ) : friends.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyTitle}>Aucun ami pour l&apos;instant</Text>
            <Text style={styles.emptyBody}>Partage ton code pour bâtir ta constellation.</Text>
          </View>
        ) : (
          friends.map((f) => (
            <View key={f.friend_code} style={styles.friendRow} testID={`friend-${f.friend_code}`}>
              <View style={styles.friendAvatar}>
                <Ionicons name="planet" size={16} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>{f.name}</Text>
                <Text style={styles.friendMeta}>{f.friend_code} · {f.completed} niveaux</Text>
              </View>
              <View style={styles.friendStars}>
                <Ionicons name="star" size={12} color={colors.brand} />
                <Text style={styles.friendStarsText}>{f.stars}</Text>
              </View>
              <TouchableOpacity testID={`remove-${f.friend_code}`} style={styles.removeBtn} onPress={() => remove(f.friend_code)} hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.onSurfaceTertiary} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity testID="goto-friends-leaderboard" style={styles.viewLb} onPress={() => router.push('/leaderboard?scope=friends')}>
          <Ionicons name="trophy-outline" size={16} color={colors.brand} />
          <Text style={styles.viewLbLabel}>Voir le classement entre amis</Text>
        </TouchableOpacity>

        <SafeAreaView edges={['bottom']} />
      </ScrollView>

      {toast ? (
        <View style={styles.toast} testID="friends-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: 80, gap: spacing.sm },

  codeCard: {
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(15,15,15,0.92)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
    alignItems: 'center',
  },
  codeKicker: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 3, fontWeight: '700' },
  codeBig: {
    color: colors.brand, fontSize: 38, fontWeight: '800',
    letterSpacing: 8, marginTop: 8, marginBottom: 4,
  },
  codeSub: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    marginTop: 14,
  },
  shareLabel: { color: '#0a0a0a', fontSize: 12, fontWeight: '700' },

  section: {
    color: colors.onSurface, fontSize: 13, fontWeight: '600',
    marginTop: spacing.xl, marginBottom: 6, letterSpacing: 0.5,
  },

  addRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, padding: 12,
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    color: colors.onSurface, fontSize: 18, fontWeight: '700',
    letterSpacing: 4, textAlign: 'center',
  },
  addBtn: {
    width: 48, height: 48, borderRadius: radii.md,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },

  empty: { alignItems: 'center', padding: 24 },
  emptyTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '600', marginTop: 10 },
  emptyBody: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4, textAlign: 'center' },

  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12,
    backgroundColor: 'rgba(20,20,20,0.7)',
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  friendAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(245,200,81,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  friendName: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  friendMeta: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  friendStars: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  friendStarsText: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  removeBtn: { padding: 4 },

  viewLb: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    marginTop: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
    backgroundColor: 'rgba(245,200,81,0.05)',
  },
  viewLbLabel: { color: colors.brand, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },

  toast: {
    position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 30,
    padding: 12, borderRadius: radii.md,
    backgroundColor: 'rgba(15,15,15,0.96)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
    alignItems: 'center',
  },
  toastText: { color: colors.onSurface, fontSize: 13 },
});
