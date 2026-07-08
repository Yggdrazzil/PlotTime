import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { COLORS, FONTS } from '@/lib/theme';
import { PageHeader } from '@/components/PageHeader';

const TABS = ['COMPTE', 'APPLICATION', 'À VENIR'];

export default function Settings() {
  const [tab, setTab] = useState('COMPTE');
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <PageHeader title="Paramètres" />
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabActive]}>{t}</Text>
            <View style={[styles.under, tab === t && styles.underActive]} />
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {tab === 'COMPTE' ? <AccountTab /> : tab === 'APPLICATION' ? <AppTab /> : <UpcomingTab />}
      </ScrollView>
    </View>
  );
}

function AccountTab() {
  const router = useRouter();
  const { user, logout } = useAppStore();
  return (
    <View>
      <SectionTitle>Identification</SectionTitle>
      <View style={{ paddingHorizontal: 24, paddingBottom: 8 }}>
        <Field label="Nom d'utilisateur" value={user?.displayName ?? ''} blue />
        <Field label="Adresse e-mail" value={user?.email || '—'} blue />
        <Field label="Identifiant utilisateur" value={user?.id ?? ''} />
      </View>
      <Row label="Modifier le mot de passe" />
      <Divider />
      <SectionTitle>Import & sauvegarde</SectionTitle>
      <Row label="Importer mes données TV Time" onPress={() => router.push('/import')} />
      <Row label="Exporter mes données SerieTime" />
      <Row label="Sauvegarde locale" />
      <Divider />
      <SectionTitle>Services d'abonnement</SectionTitle>
      <Row label="Modifier vos services d'abonnement" />
      <Divider />
      <View style={{ alignItems: 'center', gap: 24, paddingVertical: 32 }}>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>SE DÉCONNECTER</Text>
        </Pressable>
        <Pressable>
          <Text style={[styles.logout, { color: COLORS.red }]}>SUPPRIMER LE COMPTE</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AppTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<{ settings: any }>('/api/settings') });
  const update = useMutation({
    mutationFn: (patch: any) => api.post('/api/settings', patch),
    onSettled: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
  const s = data?.settings ?? {};
  return (
    <View>
      <SectionTitle>Titres</SectionTitle>
      <ToggleRow label="Afficher dans votre langue" sub="Les titres s'affichent par défaut en anglais" on={s.titlesInUserLanguage ?? true} onToggle={(v) => update.mutate({ titlesInUserLanguage: v })} />
      <Divider />
      <SectionTitle>Thème</SectionTitle>
      {[['system', "Suivre le thème défini sur l'appareil"], ['light', 'Thème clair'], ['dark', 'Thème sombre']].map(([v, l]) => (
        <RadioRow key={v} label={l} on={(s.theme ?? 'light') === v} onPress={() => update.mutate({ theme: v })} />
      ))}
      <Divider />
      <SectionTitle>Cache</SectionTitle>
      <View style={{ padding: 16 }}>
        <Pressable style={styles.cacheBtn} onPress={() => api.post('/api/cache/clear').catch(() => {})}>
          <Text style={styles.cacheText}>VIDER LE CACHE</Text>
        </Pressable>
      </View>
      <Text style={styles.version}>VERSION 1.0.0</Text>
    </View>
  );
}

function UpcomingTab() {
  return (
    <View>
      <SectionTitle>Épisodes à afficher</SectionTitle>
      <Row label="Choix des chaînes" />
      <ToggleRow label="Masquer les épisodes vus" on={false} onToggle={() => {}} />
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}
function Field({ label, value, blue }: { label: string; value: string; blue?: boolean }) {
  return (
    <View style={{ paddingVertical: 12 }}>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 17 }}>{label}</Text>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 17, color: blue ? COLORS.blue : COLORS.textMuted }}>{value}</Text>
    </View>
  );
}
function Row({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 19 }}>{label}</Text>
      <Feather name="chevron-right" size={22} color={COLORS.black} />
    </Pressable>
  );
}
function ToggleRow({ label, sub, on, onToggle }: { label: string; sub?: string; on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 19 }}>{label}</Text>
        {sub ? <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textMuted }}>{sub}</Text> : null}
      </View>
      <Pressable style={[styles.toggle, on && styles.toggleOn]} onPress={() => onToggle(!on)}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </Pressable>
    </View>
  );
}
function RadioRow({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.row, { justifyContent: 'flex-start', gap: 16 }]} onPress={onPress}>
      <View style={[styles.radio, on && styles.radioOn]}>{on ? <Feather name="check" size={14} color={COLORS.black} /> : null}</View>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 18 }}>{label}</Text>
    </Pressable>
  );
}
function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 15 },
  tabText: { fontSize: 15, fontFamily: FONTS.extraBold, letterSpacing: 0.5, color: COLORS.textSoft },
  tabActive: { color: COLORS.black },
  under: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: 'transparent' },
  underActive: { backgroundColor: COLORS.black },
  sectionTitle: { fontSize: 23, fontFamily: FONTS.extraBold, paddingHorizontal: 24, paddingTop: 28 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, gap: 16 },
  toggle: { width: 52, height: 30, borderRadius: 15, backgroundColor: '#ddd', padding: 3 },
  toggleOn: { backgroundColor: COLORS.yellow },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  knobOn: { backgroundColor: '#000', transform: [{ translateX: 22 }] },
  radio: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: 12 },
  logout: { fontSize: 15, fontFamily: FONTS.extraBold, letterSpacing: 0.6 },
  cacheBtn: { borderWidth: 2, borderColor: COLORS.black, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  cacheText: { fontSize: 14, fontFamily: FONTS.extraBold, letterSpacing: 0.6 },
  version: { textAlign: 'center', paddingVertical: 24, fontSize: 13, fontFamily: FONTS.bold, color: COLORS.textMuted, letterSpacing: 1 },
});
