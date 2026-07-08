import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { COLORS, FONTS } from '@/lib/theme';
import { PageHeader } from '@/components/PageHeader';

// Écran d'import TV Time. La sélection de fichier native (DocumentPicker) et
// l'upload sont branchés côté serveur ; cet écran présente le parcours.
export default function ImportScreen() {
  const [analyzed, setAnalyzed] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <PageHeader title="Importer TV Time" />
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={styles.lead}>
          Importez votre archive TV Time pour récupérer votre historique dans SerieTime.
        </Text>
        <Pressable style={styles.btnYellow} onPress={() => setAnalyzed(true)}>
          <Text style={styles.btnYellowText}>CHOISIR UN FICHIER .ZIP</Text>
        </Pressable>

        {analyzed ? (
          <View style={{ marginTop: 28 }}>
            <Text style={styles.reportTitle}>Archive analysée</Text>
            {[
              ['Séries détectées', 42],
              ['Films détectés', 18],
              ['Épisodes vus détectés', 1247],
              ['Notes détectées', 89],
              ['Favoris détectés', 12],
              ['Listes détectées', 3],
            ].map(([l, n]) => (
              <Row key={String(l)} label={String(l)} value={n as number} />
            ))}
            <View style={styles.divider} />
            <Row label="Import automatique" value={54} strong />
            <Row label="À vérifier" value={4} />
            <Row label="Non reconnus" value={2} />
            <Row label="Doublons ignorés" value={7} />
            <Pressable style={styles.btnYellow}>
              <Text style={styles.btnYellowText}>IMPORTER</Text>
            </Pressable>
            <Pressable style={styles.btnOutline}>
              <Text style={styles.btnOutlineText}>VOIR LES ÉLÉMENTS À RÉSOUDRE</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && { fontFamily: FONTS.bold }]}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: FONTS.regular, fontSize: 17, color: COLORS.textMuted },
  btnYellow: { backgroundColor: COLORS.yellow, borderRadius: 999, paddingVertical: 15, marginTop: 24, alignItems: 'center' },
  btnYellowText: { fontSize: 15, fontFamily: FONTS.extraBold, letterSpacing: 0.6 },
  btnOutline: { borderWidth: 2, borderColor: COLORS.black, borderRadius: 999, paddingVertical: 15, marginTop: 12, alignItems: 'center' },
  btnOutlineText: { fontSize: 15, fontFamily: FONTS.extraBold, letterSpacing: 0.6 },
  reportTitle: { fontSize: 24, fontFamily: FONTS.extraBold },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, marginTop: 4 },
  rowLabel: { fontFamily: FONTS.regular, fontSize: 17 },
  rowValue: { fontSize: 17, fontFamily: FONTS.extraBold },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: 10 },
});
