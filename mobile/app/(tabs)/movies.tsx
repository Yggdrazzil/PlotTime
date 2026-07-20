import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, tmdbImage } from '@/lib/api';
import type { MediaDto } from '@/lib/types';
import { RADIUS, SPACE, SIZES } from '@/lib/theme';
import { EmptyState, LoadError, Poster } from '@/components/ui';
import { ScreenShell, SectionHeader, SegmentedFilter, TabHeader } from '@/components/prisme';
import { AppearItem, FadeSwitch, Skeleton } from '@/components/anim';
import { useTabResetSeq } from '@/lib/tabReset';

type MoviesResponse = { toWatch: MediaDto[]; upcoming: { media: MediaDto; releaseDate: string }[] };
type MovieTab = 'to_watch' | 'upcoming';

const TAB_OPTIONS = [
  { value: 'to_watch', label: 'À voir' },
  { value: 'upcoming', label: 'À venir' },
] as const;


export default function MoviesScreen() {
  // Re-clic sur l'onglet « Films » : remontage complet (état + scroll par défaut).
  const resetSeq = useTabResetSeq('movies');
  return <MoviesScreenInner key={resetSeq} />;
}

function MoviesScreenInner() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<MovieTab>('to_watch');
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['movies'],
    queryFn: () => api.get<MoviesResponse>('/api/movies'),
  });

  const availableWidth = Math.min(width, SIZES.contentMax) - SPACE.md * 2;
  const columns = availableWidth >= 640 ? 5 : availableWidth >= 480 ? 4 : 3;
  const posterWidth = Math.max(76, (availableWidth - SPACE.sm * (columns - 1)) / columns);

  const grid = (items: MediaDto[]) => (
    <View style={styles.grid}>
      {items.map((m, i) => (
        <AppearItem key={m.id} index={i} style={{ width: posterWidth }}>
          <Poster
            title={m.title}
            uri={tmdbImage(m.posterPath)}
            width={posterWidth}
            onPress={() => router.push(`/show/${m.id}?type=movie`)}
          />
        </AppearItem>
      ))}
    </View>
  );

  const activeItems = tab === 'to_watch' ? data?.toWatch ?? [] : data?.upcoming.map((item) => item.media) ?? [];
  const activeTitle = tab === 'to_watch' ? 'À regarder' : 'Prochainement';
  const activeSubtitle = tab === 'to_watch'
    ? `${activeItems.length} film${activeItems.length !== 1 ? 's' : ''} dans ta sélection`
    : `${activeItems.length} sortie${activeItems.length !== 1 ? 's' : ''} à venir`;

  return (
    <ScreenShell contentContainerStyle={styles.content}>
      <TabHeader title="Films" />
      <SegmentedFilter
        options={TAB_OPTIONS}
        value={tab}
        onChange={setTab}
        accessibilityLabel="Filtrer les films"
      />
      {isLoading ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View
            style={styles.grid}
            accessibilityRole="progressbar"
            accessibilityLabel="Chargement des films"
          >
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} style={[styles.posterSkeleton, { width: posterWidth }]} />
            ))}
          </View>
        </ScrollView>
      ) : isError && !data ? (
        <LoadError onRetry={refetch} busy={isRefetching} />
      ) : (
        <FadeSwitch trigger={tab}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <SectionHeader title={activeTitle} eyebrow={activeSubtitle} />
            {activeItems.length > 0 ? (
              grid(activeItems)
            ) : (
              <EmptyState
                title={tab === 'to_watch' ? 'Aucun film à voir' : 'Aucun film à venir'}
                message={tab === 'to_watch' ? 'Ajoute des films depuis Explorer.' : 'Les prochaines sorties apparaîtront ici.'}
              />
            )}
          </ScrollView>
        </FadeSwitch>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 0 },
  scrollContent: { paddingTop: SPACE.xs, paddingBottom: SIZES.tabBar + SPACE.xl },
  posterSkeleton: { aspectRatio: 2 / 3, borderRadius: RADIUS.poster },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
});
