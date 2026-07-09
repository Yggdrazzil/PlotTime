import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '@/lib/theme';
import { Skeleton } from '@/components/anim';

// Écrans « squelette » pendant le chargement : mêmes gabarits que le contenu
// réel, pulsés en douceur → l'app paraît réactive et rien ne saute quand les
// données arrivent (bonne pratique loading UX).

const SIDE = 12;
const GAP = 8;
const CELL = (Dimensions.get('window').width - SIDE * 2 - GAP * 2) / 3;

// Liste « À voir » : quelques cartes épisode fantômes.
export function QueueSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={{ paddingTop: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton style={styles.thumb} />
          <View style={styles.body}>
            <Skeleton style={{ width: '55%', height: 16, borderRadius: 999 }} />
            <Skeleton style={{ width: '40%', height: 20, marginTop: 10 }} />
            <Skeleton style={{ width: '70%', height: 12, marginTop: 8 }} />
          </View>
          <Skeleton style={styles.check} />
        </View>
      ))}
    </View>
  );
}

// Grille d'affiches (pages profil).
export function GridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} style={styles.poster} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', marginHorizontal: 12, marginBottom: 12, backgroundColor: COLORS.white,
    borderRadius: 10, minHeight: 104, overflow: 'hidden', alignItems: 'center',
  },
  thumb: { width: 96, height: 104, borderRadius: 0 },
  body: { flex: 1, paddingHorizontal: 14, paddingVertical: 16 },
  check: { width: 38, height: 38, borderRadius: 19, marginRight: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SIDE, gap: GAP, paddingTop: 16 },
  poster: { width: CELL, aspectRatio: 2 / 3, borderRadius: 6 },
});
