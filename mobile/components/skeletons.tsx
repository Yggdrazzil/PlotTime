import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { COLORS, RADIUS, SPACE, SIZES } from '@/lib/theme';
import { Skeleton } from '@/components/anim';

// Écrans « squelette » pendant le chargement : mêmes gabarits que le contenu
// réel, pulsés en douceur pour garder une interface stable et réactive.

const SIDE = SPACE.md;
const GAP = SPACE.sm;

// Liste « À voir » : quelques cartes épisode fantômes.
export function QueueSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.queue} accessibilityLabel="Chargement des épisodes" accessibilityRole="progressbar">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton style={styles.thumb} />
          <View style={styles.body}>
            <Skeleton style={[styles.fill, styles.pill]} />
            <Skeleton style={[styles.fill, styles.code]} />
            <Skeleton style={[styles.fill, styles.title]} />
          </View>
          <Skeleton style={styles.check} />
        </View>
      ))}
    </View>
  );
}

// Grille d'affiches (pages profil), recalculée à chaque changement de fenêtre.
export function GridSkeleton({ count = 9 }: { count?: number }) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, SIZES.contentMax);
  const cell = Math.max(72, (contentWidth - SIDE * 2 - GAP * 2) / 3);

  return (
    <View style={styles.grid} accessibilityLabel="Chargement de la bibliothèque" accessibilityRole="progressbar">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} style={[styles.poster, styles.fill, { width: cell }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  queue: { width: '100%', maxWidth: SIZES.contentMax, alignSelf: 'center', paddingTop: SPACE.md },
  card: {
    flexDirection: 'row',
    minHeight: 116,
    marginHorizontal: SPACE.md,
    marginBottom: SPACE.sm,
    overflow: 'hidden',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
  },
  fill: { backgroundColor: COLORS.surfaceMuted },
  thumb: { width: 104, alignSelf: 'stretch', borderRadius: 0, backgroundColor: COLORS.surfaceMuted },
  body: { flex: 1, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.sm },
  pill: { width: '62%', height: 28, borderRadius: RADIUS.pill },
  code: { width: '44%', height: 20, marginTop: SPACE.sm, borderRadius: RADIUS.small },
  title: { width: '74%', height: 12, marginTop: SPACE.xs, borderRadius: RADIUS.small },
  check: {
    width: SIZES.touch,
    height: SIZES.touch,
    marginRight: SPACE.sm,
    borderRadius: SIZES.touch / 2,
    backgroundColor: COLORS.surfaceMuted,
  },
  grid: {
    width: '100%',
    maxWidth: SIZES.contentMax,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SIDE,
    paddingTop: SPACE.md,
    gap: GAP,
  },
  poster: { aspectRatio: 2 / 3, borderRadius: RADIUS.poster },
});
