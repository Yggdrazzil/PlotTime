import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, tmdbImage } from '@/lib/api';
import type { MediaDto } from '@/lib/types';
import { COLORS, FONTS, RADIUS, SHADOW, SIZES, SPACE, YELLOW_TRACK } from '@/lib/theme';
import { CELL_W, DRAG_GRID_MAX_WIDTH, LibHeader, type LibraryShow } from '@/components/library';
import { DragGrid } from '@/components/DragGrid';
import { AnimatedFill, Pop } from '@/components/anim';
import { GridSkeleton } from '@/components/skeletons';
import { LoadError, EmptyState } from '@/components/ui';
import { useFavoritesData, sortFavorites } from '@/components/favorites';

const CELL_H = CELL_W * 1.5;

// L'ordre est sauvegardé à chaque dépôt ; l'action de validation referme l'écran.
export default function ReorderFavoritesScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const kind = type === 'movie' ? 'movie' : 'show';
  const qc = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const [scrollLocked, setScrollLocked] = useState(false);

  const { favs, isLoading, isError, hasData, refetch, isRefetching } = useFavoritesData(kind);
  // Ordre d'ouverture de l'écran : l'ordre utilisateur courant. Le DragGrid
  // devient ensuite la source de vérité locale (pas re-trié à chaque refetch).
  const initial = useMemo(() => sortFavorites(favs, 'user'), [favs]);

  // Sauvegarde OPTIMISTE : le nouvel ordre est écrit tout de suite dans le cache
  // (la page « préférés » l'affiche dès le retour), et on n'invalide qu'à la
  // DERNIÈRE sauvegarde en vol — sinon le refetch d'un dépôt précédent, parti
  // avant le POST suivant, réécrivait l'ancien ordre (« changements perdus »).
  const libKey = kind === 'movie' ? ['movies', 'library', 'all'] : ['shows', 'library'];
  const save = useMutation({
    mutationKey: ['fav-reorder', kind],
    mutationFn: (ids: string[]) => api.post('/api/profile/favorites/reorder', { type: kind, ids }),
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: libKey });
      const pos = new Map(ids.map((id, i) => [id, i]));
      const patch = <T extends MediaDto>(m: T): T =>
        pos.has(m.id) ? { ...m, favoriteOrder: pos.get(m.id)! } : m;
      if (kind === 'movie') {
        qc.setQueryData<{ seen: MediaDto[]; unseen: MediaDto[] }>(libKey, (d) =>
          d ? { seen: d.seen.map(patch), unseen: d.unseen.map(patch) } : d,
        );
      } else {
        qc.setQueryData<{ items: LibraryShow[] }>(libKey, (d) => (d ? { items: d.items.map(patch) } : d));
      }
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ['fav-reorder', kind] }) === 1) {
        qc.invalidateQueries({ queryKey: [kind === 'movie' ? 'movies' : 'shows'] });
        qc.invalidateQueries({ queryKey: ['profile'] });
      }
    },
  });

  return (
    <Pop style={styles.screen}>
      <LibHeader
        title="Réorganiser"
        right={
          <Pressable
            style={({ pressed }) => [styles.doneBtn, pressed && styles.controlPressed]}
            onPress={() => goBack('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Terminer le réordonnancement"
            accessibilityHint="Enregistre l'ordre courant et revient au profil"
          >
            <Feather name="check" size={20} color={COLORS.onPrimary} />
          </Pressable>
        }
      />
      {isLoading ? (
        <GridSkeleton />
      ) : isError && !hasData ? (
        <LoadError onRetry={refetch} busy={isRefetching} />
      ) : (
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!scrollLocked}
          scrollEventThrottle={16}
          onScroll={(e) => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.instruction}>
            <View style={styles.instructionIcon}>
              <Feather name="move" size={21} color={COLORS.primary} />
            </View>
            <View style={styles.instructionCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                Organisez vos {kind === 'movie' ? 'films' : 'séries'} préférés
              </Text>
              <Text style={styles.subtitle}>
                Maintenez une affiche, puis faites-la glisser jusqu'à sa nouvelle position.
              </Text>
            </View>
          </View>
          {initial.length === 0 ? (
            <EmptyState title="Aucun favori à réorganiser" />
          ) : (
            <View style={styles.dragCanvas}>
              <DragGrid
                data={initial}
                keyOf={(m) => m.id}
                cellHeight={CELL_H}
                renderItem={(m) => <ReorderCell media={m} isShow={kind === 'show'} />}
                onReorder={(items) => save.mutate(items.map((m) => m.id))}
                onDragStateChange={setScrollLocked}
                scrollRef={scrollRef}
                scrollOffsetRef={scrollOffset}
              />
            </View>
          )}
        </ScrollView>
      )}
    </Pop>
  );
}

// Affiche seule : l'écran est dédié au glisser-déposer.
function ReorderCell({ media, isShow }: { media: MediaDto; isShow: boolean }) {
  const uri = tmdbImage(media.posterPath);
  const progress = (media as LibraryShow).progress;
  const started = isShow && progress && progress.watched > 0;
  const done = started && progress.total > 0 && progress.watched >= progress.total;
  const pct = started && progress.total > 0 ? Math.min(100, (progress.watched / progress.total) * 100) : 0;
  return (
    <View
      style={styles.posterFrame}
      accessible
      accessibilityRole="button"
      accessibilityLabel={media.title}
      accessibilityHint="Maintenez puis faites glisser pour déplacer ce favori"
    >
      <View style={styles.posterBox}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={styles.posterEmpty}>
            <Feather name={isShow ? 'tv' : 'film'} size={24} color={COLORS.primary} />
            <Text style={styles.posterTitle} numberOfLines={3}>{media.title}</Text>
          </View>
        )}
        {started ? (
          <View style={styles.barTrack}>
            <AnimatedFill pct={pct} color={done ? COLORS.green : COLORS.yellow} style={styles.barFill} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: COLORS.bg },
  doneBtn: {
    width: SIZES.touch,
    height: SIZES.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.primary,
  },
  controlPressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  scrollContent: { flexGrow: 1, paddingBottom: SPACE.xl },
  instruction: {
    width: 'auto',
    maxWidth: SIZES.contentMax - SPACE.md * 2,
    minHeight: 96,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    margin: SPACE.md,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    ...SHADOW.card,
  },
  instructionIcon: {
    width: SIZES.touchComfortable,
    height: SIZES.touchComfortable,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.primarySoft,
  },
  instructionCopy: { flex: 1, minWidth: 0 },
  title: { color: COLORS.text, fontSize: 17, lineHeight: 23, fontFamily: FONTS.extraBold },
  subtitle: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular, marginTop: 3 },
  dragCanvas: {
    width: '100%',
    maxWidth: DRAG_GRID_MAX_WIDTH,
    alignSelf: 'center',
  },
  posterFrame: {
    flex: 1,
    borderRadius: RADIUS.poster,
    backgroundColor: COLORS.surface,
    ...SHADOW.card,
  },
  posterBox: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.poster,
    backgroundColor: COLORS.imagePlaceholder,
  },
  posterEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xs,
    gap: SPACE.xs,
    backgroundColor: COLORS.primarySoft,
  },
  posterTitle: {
    color: COLORS.text,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  barTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, backgroundColor: YELLOW_TRACK },
  barFill: { position: 'absolute', left: 0, bottom: 0, top: 0 },
});
