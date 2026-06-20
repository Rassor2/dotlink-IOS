import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity,
  TextInput, Modal, Alert, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii } from '@/src/theme';
import { api, type AdminEntry } from '@/src/api/client';
import { useAuth } from '@/src/state/auth';
import { hapticLight, hapticSuccess, hapticError } from '@/src/audio/feedback';

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, authLoading, logout } = useAuth();

  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AdminEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [editCoins, setEditCoins] = useState('');
  const [editReset, setEditReset] = useState(false);
  const [audit, setAudit] = useState<any[] | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    if (!token || !user?.is_admin) return;
    setLoading(true);
    try {
      const r = await api.adminLeaderboard(token, search.trim() || undefined, 200);
      setEntries(r.entries);
    } catch {
      showToast('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [token, user?.is_admin, search]);

  useEffect(() => {
    if (!authLoading && (!user || !user.is_admin)) {
      router.replace('/auth');
      return;
    }
    load();
  }, [authLoading, user, load, router]);

  const onDelete = (item: AdminEntry) => {
    if (!token) return;
    const confirmAndDelete = async () => {
      setBusy(item.device_id);
      try {
        await api.adminDeleteProfile(token, item.device_id);
        hapticSuccess();
        showToast(`${item.name} supprimé`);
        await load();
      } catch (e: any) {
        hapticError();
        showToast('Suppression impossible');
      } finally {
        setBusy(null);
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      const ok = typeof window !== 'undefined' && window.confirm(
        `Supprimer définitivement « ${item.name} » du classement ?\nCette action est irréversible.`,
      );
      if (ok) confirmAndDelete();
    } else {
      Alert.alert(
        'Supprimer ce joueur ?',
        `« ${item.name} » sera retiré du classement et son profil effacé. Action irréversible.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: confirmAndDelete },
        ],
      );
    }
  };

  const openEdit = (item: AdminEntry) => {
    hapticLight();
    setEditTarget(item);
    setEditName(item.name);
    setEditCoins(String(item.coins));
    setEditReset(false);
  };

  const submitEdit = async () => {
    if (!editTarget || !token) return;
    const patch: { name?: string; coins?: number; reset_progress?: boolean } = {};
    const newName = editName.trim().slice(0, 24);
    if (newName && newName !== editTarget.name) patch.name = newName;
    const newCoins = Number.parseInt(editCoins, 10);
    if (!Number.isNaN(newCoins) && newCoins !== editTarget.coins) {
      patch.coins = Math.max(0, newCoins);
    }
    if (editReset) patch.reset_progress = true;
    if (Object.keys(patch).length === 0) {
      setEditTarget(null);
      return;
    }
    setBusy(editTarget.device_id);
    try {
      await api.adminUpdateProfile(token, editTarget.device_id, patch);
      hapticSuccess();
      showToast(`${editTarget.name} mis à jour`);
      setEditTarget(null);
      await load();
    } catch (e) {
      hapticError();
      showToast('Modification impossible');
    } finally {
      setBusy(null);
    }
  };

  const loadAudit = async () => {
    if (!token) return;
    try {
      const r = await api.adminAudit(token, 50);
      setAudit(r.entries);
    } catch {
      showToast('Audit indisponible');
    }
  };

  const renderRow = ({ item }: { item: AdminEntry }) => (
    <View style={styles.row} testID={`admin-row-${item.device_id}`}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{item.rank}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
          {item.has_account ? (
            <Text style={styles.accountTag}>  · compte</Text>
          ) : null}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {item.completed} niv · {item.stars}★ · {item.coins} pièces
        </Text>
        <Text style={styles.deviceId} numberOfLines={1}>{item.device_id}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          testID={`admin-edit-${item.device_id}`}
          style={styles.iconBtn}
          onPress={() => openEdit(item)}
          disabled={busy === item.device_id}
        >
          <Ionicons name="create-outline" size={18} color={colors.brand} />
        </TouchableOpacity>
        <TouchableOpacity
          testID={`admin-delete-${item.device_id}`}
          style={[styles.iconBtn, styles.iconBtnDanger]}
          onPress={() => onDelete(item)}
          disabled={busy === item.device_id}
        >
          {busy === item.device_id ? (
            <ActivityIndicator color="#ff6b6b" size="small" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (authLoading || !user?.is_admin) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="admin-screen">
      <LinearGradient
        colors={['rgba(255,107,107,0.10)', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <TopBar title="Modération" subtitle={`Admin · ${user.name || 'admin2345'}`} />

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={14} color={colors.onSurfaceTertiary} />
          <TextInput
            testID="admin-search-input"
            style={styles.searchInput}
            placeholder="Filtrer par nom…"
            placeholderTextColor={colors.onSurfaceTertiary}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={load}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(''); }}>
              <Ionicons name="close-circle" size={16} color={colors.onSurfaceTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity testID="admin-refresh" style={styles.toolBtn} onPress={() => { hapticLight(); load(); }}>
          <Ionicons name="refresh" size={16} color={colors.onSurface} />
        </TouchableOpacity>
        <TouchableOpacity testID="admin-audit-btn" style={styles.toolBtn} onPress={() => { hapticLight(); loadAudit(); }}>
          <Ionicons name="time-outline" size={16} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(it) => it.device_id}
          renderItem={renderRow}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={42} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>Aucun joueur</Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity
              testID="admin-logout"
              style={styles.logoutBtn}
              onPress={async () => { hapticLight(); await logout(); router.replace('/'); }}
            >
              <Ionicons name="log-out-outline" size={14} color={colors.onSurface} />
              <Text style={styles.logoutLabel}>Quitter la session admin</Text>
            </TouchableOpacity>
          }
        />
      )}

      {/* Toast */}
      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 80 }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* Edit modal */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalScrim}>
          <View style={styles.modalCard} testID="admin-edit-modal">
            <Text style={styles.modalTitle}>Modifier {editTarget?.name}</Text>
            <Text style={styles.modalSub} numberOfLines={1}>device · {editTarget?.device_id}</Text>

            <Text style={styles.fieldLabel}>Nom</Text>
            <TextInput
              testID="admin-edit-name"
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              maxLength={24}
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Pièces</Text>
            <TextInput
              testID="admin-edit-coins"
              style={styles.input}
              value={editCoins}
              onChangeText={(v) => setEditCoins(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />

            <TouchableOpacity
              testID="admin-edit-reset"
              style={styles.toggleRow}
              onPress={() => setEditReset((v) => !v)}
              activeOpacity={0.8}
            >
              <View style={[styles.toggleBox, editReset && styles.toggleBoxOn]}>
                {editReset ? <Ionicons name="checkmark" size={14} color="#0a0a0a" /> : null}
              </View>
              <Text style={styles.toggleLabel}>Réinitialiser toute la progression (étoiles, niveaux)</Text>
            </TouchableOpacity>

            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalSecondary} onPress={() => setEditTarget(null)}>
                <Text style={styles.modalSecondaryLabel}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="admin-edit-save"
                style={styles.modalPrimary}
                onPress={submitEdit}
                disabled={busy === editTarget?.device_id}
              >
                {busy === editTarget?.device_id ? (
                  <ActivityIndicator color="#0a0a0a" size="small" />
                ) : (
                  <Text style={styles.modalPrimaryLabel}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Audit modal */}
      <Modal visible={audit !== null} transparent animationType="fade" onRequestClose={() => setAudit(null)}>
        <View style={styles.modalScrim}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]} testID="admin-audit-modal">
            <Text style={styles.modalTitle}>Historique des actions admin</Text>
            <Text style={styles.modalSub}>50 dernières actions</Text>
            <ScrollView style={{ marginTop: 8 }}>
              {(audit || []).length === 0 ? (
                <Text style={styles.empty}>Aucune action enregistrée.</Text>
              ) : (audit || []).map((a, i) => (
                <View key={i} style={styles.auditRow}>
                  <Text style={styles.auditAction}>
                    {a.action === 'delete_profile' ? '🗑️  Supprimé' : '✏️  Modifié'} · {a.target_name || a.target_device_id}
                  </Text>
                  <Text style={styles.auditMeta}>
                    {a.actor_username} · {new Date(a.at).toLocaleString()}
                  </Text>
                  {a.changes ? (
                    <Text style={styles.auditDetail} numberOfLines={2}>
                      {JSON.stringify(a.changes)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.modalPrimary, { marginTop: 10 }]} onPress={() => setAudit(null)}>
              <Text style={styles.modalPrimaryLabel}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SafeAreaView edges={['bottom']} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg },

  toolbar: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: 8,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderRadius: radii.pill,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  searchInput: {
    flex: 1, color: colors.onSurface, fontSize: 13,
    padding: 0,
  },
  toolBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { color: colors.onSurface, fontSize: 11, fontWeight: '700' },
  name: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  accountTag: { color: colors.brand, fontSize: 11, fontWeight: '500' },
  sub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  deviceId: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,200,81,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
  },
  iconBtnDanger: {
    backgroundColor: 'rgba(255,107,107,0.10)',
    borderColor: 'rgba(255,107,107,0.30)',
  },

  empty: { alignItems: 'center', padding: 40 },
  emptyTitle: { color: colors.onSurface, fontSize: 14, marginTop: 8 },

  logoutBtn: {
    marginTop: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.30)',
  },
  logoutLabel: { color: colors.onSurface, fontSize: 12, fontWeight: '600' },

  toast: {
    position: 'absolute', alignSelf: 'center',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.40)',
  },
  toastText: { color: colors.brand, fontSize: 12, fontWeight: '600' },

  modalScrim: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: 'rgba(15,15,15,0.98)',
    borderRadius: radii.lg, borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
    padding: spacing.lg,
  },
  modalTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '700' },
  modalSub: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 4 },
  fieldLabel: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 12, marginBottom: 6, letterSpacing: 0.5 },
  input: {
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderRadius: radii.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    padding: 12, color: colors.onSurface, fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, marginTop: 4,
  },
  toggleBox: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  toggleBoxOn: { backgroundColor: '#ff6b6b', borderColor: '#ff6b6b' },
  toggleLabel: { color: colors.onSurfaceSecondary, fontSize: 12, flex: 1 },

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

  auditRow: {
    paddingVertical: 8,
    borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  auditAction: { color: colors.onSurface, fontSize: 12, fontWeight: '600' },
  auditMeta: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 2 },
  auditDetail: { color: colors.onSurfaceSecondary, fontSize: 10, marginTop: 4, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
});
