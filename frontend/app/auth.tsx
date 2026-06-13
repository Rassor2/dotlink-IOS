import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { TopBar } from '@/src/components/TopBar';
import { colors, spacing, radii } from '@/src/theme';
import { useAuth } from '@/src/state/auth';
import { hapticLight, hapticSuccess, hapticError } from '@/src/audio/feedback';

export default function AuthScreen() {
  const router = useRouter();
  const { user, register, login, loginWithGoogle, logout } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Email et mot de passe requis');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') await register(email.trim(), password, name.trim() || undefined);
      else await login(email.trim(), password);
      hapticSuccess();
      router.replace('/');
    } catch (e: any) {
      hapticError();
      const msg = String(e?.message || '');
      if (msg.includes('409')) setError('Cet email est déjà utilisé');
      else if (msg.includes('401')) setError('Email ou mot de passe incorrect');
      else if (msg.includes('8 caractères') || msg.includes('400')) setError('Mot de passe trop court (8 caractères minimum)');
      else setError('Connexion impossible. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <View style={styles.root} testID="auth-screen">
        <LinearGradient colors={['rgba(50,168,82,0.08)', '#050505']} style={StyleSheet.absoluteFill} />
        <TopBar title="Compte" subtitle="Connecté" />
        <View style={styles.center}>
          <View style={styles.card} testID="auth-logged-card">
            <View style={styles.avatar}>
              <Ionicons name={user.provider === 'google' ? 'logo-google' : 'person'} size={28} color={colors.brand} />
            </View>
            <Text style={styles.loggedName} testID="auth-user-name">{user.name || 'Joueur'}</Text>
            <Text style={styles.loggedEmail} testID="auth-user-email">{user.email}</Text>
            <Text style={styles.loggedMeta}>
              {user.provider === 'google' ? 'Compte Google' : 'Compte Dot Link'} · progression synchronisée
            </Text>
            <TouchableOpacity
              testID="auth-logout-btn"
              style={styles.logoutBtn}
              onPress={async () => { hapticLight(); await logout(); }}
            >
              <Ionicons name="log-out-outline" size={16} color={colors.onSurface} />
              <Text style={styles.logoutLabel}>Se déconnecter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="auth-screen">
      <LinearGradient colors={['rgba(245,200,81,0.08)', '#050505']} style={StyleSheet.absoluteFill} />
      <TopBar title="Compte" subtitle="Sauvegarde ta progression" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Mode tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              testID="auth-tab-login"
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => { hapticLight(); setMode('login'); setError(''); }}
            >
              <Text style={[styles.tabLabel, mode === 'login' && styles.tabLabelActive]}>Connexion</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="auth-tab-register"
              style={[styles.tab, mode === 'register' && styles.tabActive]}
              onPress={() => { hapticLight(); setMode('register'); setError(''); }}
            >
              <Text style={[styles.tabLabel, mode === 'register' && styles.tabLabelActive]}>Inscription</Text>
            </TouchableOpacity>
          </View>

          {mode === 'register' ? (
            <TextInput
              testID="auth-name-input"
              style={styles.input}
              placeholder="Pseudo (optionnel)"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={name}
              onChangeText={setName}
              maxLength={24}
            />
          ) : null}
          <TextInput
            testID="auth-email-input"
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.onSurfaceTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            testID="auth-password-input"
            style={styles.input}
            placeholder={mode === 'register' ? 'Mot de passe (8+ caractères)' : 'Mot de passe'}
            placeholderTextColor={colors.onSurfaceTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error} testID="auth-error">{error}</Text> : null}

          <TouchableOpacity
            testID="auth-submit-btn"
            style={styles.submitBtn}
            onPress={submit}
            disabled={busy}
            activeOpacity={0.88}
          >
            {busy ? (
              <ActivityIndicator color="#0a0a0a" size="small" />
            ) : (
              <Text style={styles.submitLabel}>
                {mode === 'register' ? 'Créer mon compte' : 'Se connecter'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            testID="auth-google-btn"
            style={styles.googleBtn}
            onPress={() => { hapticLight(); loginWithGoogle(); }}
            activeOpacity={0.88}
          >
            <Ionicons name="logo-google" size={18} color={colors.onSurface} />
            <Text style={styles.googleLabel}>Continuer avec Google</Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            Apple et Facebook arrivent bientôt (build natif requis).{'\n'}
            Ta progression actuelle sera fusionnée avec ton compte.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(20,20,20,0.7)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  tabActive: { borderColor: 'rgba(245,200,81,0.45)', backgroundColor: 'rgba(245,200,81,0.10)' },
  tabLabel: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  tabLabelActive: { color: colors.brand },

  input: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    color: colors.onSurface, fontSize: 14,
  },
  error: { color: colors.error, fontSize: 12, textAlign: 'center' },

  submitBtn: {
    paddingVertical: 15, alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.brand,
  },
  submitLabel: { color: '#0a0a0a', fontSize: 14, fontWeight: '700', letterSpacing: 0.4 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  dividerText: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  googleLabel: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },

  note: {
    color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 17,
    textAlign: 'center', marginTop: spacing.sm,
  },

  card: {
    width: '100%', maxWidth: 360,
    padding: spacing.xl, alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: 'rgba(50,168,82,0.35)',
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,200,81,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,200,81,0.30)',
  },
  loggedName: { color: colors.onSurface, fontSize: 18, fontWeight: '700', marginTop: 12 },
  loggedEmail: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  loggedMeta: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 10, textAlign: 'center' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 20, paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  logoutLabel: { color: colors.onSurface, fontSize: 13, fontWeight: '600' },
});
