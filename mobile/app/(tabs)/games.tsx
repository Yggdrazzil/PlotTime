import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, Image, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tmdbImage } from '@/lib/api';
import { useDebounced } from '@/lib/useDebounced';
import { COLORS, FONTS, RADIUS } from '@/lib/theme';
import { PillHeader, EmptyState, Loading, LoadError, Poster } from '@/components/ui';
import { AppearItem } from '@/components/anim';
import { useTabResetSeq } from '@/lib/tabReset';
import { usePullRefresh } from '@/lib/usePullRefresh';

// Miroir de MediaDto (packages/types) pour les jeux : le serveur ne renvoie
// pas encore ce type dans lib/types.ts (endpoints ajoutés en tâche 4/5).
type GameDto = {
  id: string;
  title: string;
  posterPath: string | null;
  year: number | null;
  voteAverage: number | null;
  platforms: string | null;
  userStatus: string | null;
  playtimeMinutes: number | null;
};

type GamesLibraryResponse = {
  wishlist: GameDto[];
  playing: GameDto[];
  completed: GameDto[];
  abandoned: GameDto[];
};

type DiscoverGameDto = { igdbId: string; title: string; year: number | null; posterPath: string | null };
type GamesDiscoverResponse = { popular: DiscoverGameDto[]; upcoming: DiscoverGameDto[] };
type GameSearchResultDto = { igdbId: string; title: string; year: number | null; posterPath: string | null };

// Sorties (+ DLC) à venir des jeux suivis, groupées par mois — miroir de
// UpcomingItemDto (shows) mais à plat (pas de `media` imbriqué).
type GameUpcomingItemDto = { id: string; title: string; posterPath: string | null; releaseDate: string };
type GamesUpcomingResponse = { groups: { label: string; items: GameUpcomingItemDto[] }[] };

const SECTIONS: { key: keyof GamesLibraryResponse; label: string }[] = [
  { key: 'wishlist', label: 'VOULUS' },
  { key: 'playing', label: 'EN COURS' },
  { key: 'completed', label: 'TERMINÉS' },
  { key: 'abandoned', label: 'ABANDONNÉS' },
];

export default function GamesScreen() {
  // Re-clic sur l'onglet « Jeux » : remontage complet (état + scroll par défaut).
  const resetSeq = useTabResetSeq('games');
  return <GamesScreenInner key={resetSeq} />;
}

function GamesScreenInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  // Debounce : une requête quand l'utilisateur marque une pause (cf. explore.tsx).
  const debouncedQuery = useDebounced(query.trim(), 300);
  const searching = query.trim().length > 1;
  const library = useQuery({
    queryKey: ['games', 'library'],
    queryFn: () => api.get<GamesLibraryResponse>('/api/games'),
  });
  const isEmpty =
    !!library.data &&
    library.data.wishlist.length === 0 &&
    library.data.playing.length === 0 &&
    library.data.completed.length === 0 &&
    library.data.abandoned.length === 0;
  // Découverte IGDB (Populaires / À venir) : toujours affichée sous la
  // bibliothèque, et seul contenu de l'écran quand la bibliothèque est vide.
  const discover = useQuery({
    queryKey: ['games', 'discover'],
    queryFn: () => api.get<GamesDiscoverResponse>('/api/games/discover'),
  });
  // Sorties à venir des jeux suivis (miroir de « À voir » côté séries).
  const upcoming = useQuery({
    queryKey: ['games', 'upcoming'],
    queryFn: () => api.get<GamesUpcomingResponse>('/api/games/upcoming'),
  });

  const { refreshing, onRefresh } = usePullRefresh([library.refetch, upcoming.refetch, discover.refetch]);

  // Ajout depuis la découverte : ajoute (statut « Voulus ») puis ouvre la
  // fiche, comme la recherche IGDB (cf. GameSearchResults.add ci-dessous).
  const [addingDiscoverId, setAddingDiscoverId] = useState<string | null>(null);
  const addDiscover = async (g: DiscoverGameDto) => {
    if (addingDiscoverId) return;
    setAddingDiscoverId(g.igdbId);
    try {
      const res = await api.post<{ mediaId: string | null }>('/api/games/add-from-igdb', {
        igdbId: g.igdbId,
        status: 'wishlist',
      });
      qc.invalidateQueries({ queryKey: ['games', 'library'] });
      if (res.mediaId) router.push(('/game/' + res.mediaId) as Href);
    } finally {
      setAddingDiscoverId(null);
    }
  };

  const grid = (items: GameDto[], startIndex = 0) => (
    <View style={styles.grid}>
      {items.map((g, i) => (
        <AppearItem key={g.id} index={startIndex + i} style={styles.cell}>
          {/* Route détail jeu créée en tâche 8 ; référencée ici par avance. */}
          <Poster title={g.title} uri={tmdbImage(g.posterPath)} onPress={() => router.push(`/game/${g.id}` as Href)} />
        </AppearItem>
      ))}
    </View>
  );

  // Carrousel horizontal de découverte (taper ajoute puis ouvre la fiche) —
  // même gabarit que PosterRow (profile.tsx) : Poster width={118}.
  const discoverRow = (items: DiscoverGameDto[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
      {items.map((g) => (
        <View key={g.igdbId} style={{ width: 118 }}>
          <Poster title={g.title} uri={tmdbImage(g.posterPath)} width={118} onPress={() => addDiscover(g)} />
          {addingDiscoverId === g.igdbId ? (
            <View style={styles.posterBusy}>
              <ActivityIndicator color={COLORS.white} size="small" />
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );

  // Carrousel horizontal des sorties à venir (jeux déjà suivis) : ouvre
  // directement la fiche, pas d'ajout.
  const upcomingRow = (items: GameUpcomingItemDto[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
      {items.map((it) => (
        <Poster key={it.id} title={it.title} uri={tmdbImage(it.posterPath)} width={118} onPress={() => router.push(`/game/${it.id}` as Href)} />
      ))}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      {/* Barre de recherche (style repris de explore.tsx) : recherche IGDB, taper
          un résultat l'ajoute directement en « Voulus » et ouvre sa fiche. */}
      <View style={[styles.searchbar, { marginTop: insets.top + 10 }]}>
        <Feather name="search" size={20} color={searching ? COLORS.black : COLORS.textMuted} />
        <TextInput
          style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as never)]}
          placeholder={focused || query ? 'Rechercher un jeu' : 'Rechercher'}
          placeholderTextColor={COLORS.textMuted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.cancel}>Annuler</Text>
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <GameSearchResults query={debouncedQuery} rawQuery={query} />
      ) : library.isLoading ? (
        <Loading />
      ) : library.isError && !library.data ? (
        <LoadError onRetry={library.refetch} busy={library.isRefetching} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.yellow} colors={[COLORS.yellow]} />
          }
        >
          {library.data ? (
            <>
              {!isEmpty ? (
                (() => {
                  const data = library.data;
                  let n = -1;
                  return SECTIONS.map(({ key, label }) => {
                    const items = data[key];
                    if (items.length === 0) return null;
                    const start = n + 1;
                    n += items.length;
                    return (
                      <View key={key}>
                        <PillHeader label={label} />
                        {grid(items, start)}
                      </View>
                    );
                  });
                })()
              ) : (
                <EmptyState title="Aucun jeu suivi" message="Ajoutez des jeux depuis la découverte ci-dessous." />
              )}

              {/* Sorties à venir : jeux suivis dont la sortie n'est pas encore
                  passée, groupés par mois (n'apparaît que si non vide, donc
                  jamais affiché quand la bibliothèque est vide). */}
              {upcoming.data && upcoming.data.groups.length > 0 ? (
                <>
                  <PillHeader label="SORTIES À VENIR" />
                  {upcoming.data.groups.map((g) => (
                    <View key={g.label} style={{ paddingBottom: 8 }}>
                      <Text style={styles.groupLabel}>{g.label.toUpperCase()}</Text>
                      {upcomingRow(g.items)}
                    </View>
                  ))}
                </>
              ) : null}

              {/* Découverte IGDB : toujours sous la bibliothèque, seul contenu
                  visible (avec l'EmptyState ci-dessus) quand elle est vide —
                  jamais affichée deux fois. */}
              {discover.isLoading && !discover.data ? (
                <Loading />
              ) : discover.data ? (
                <>
                  {discover.data.popular.length > 0 ? (
                    <>
                      <PillHeader label="POPULAIRES" />
                      {discoverRow(discover.data.popular)}
                    </>
                  ) : null}
                  {discover.data.upcoming.length > 0 ? (
                    <>
                      <PillHeader label="À VENIR" />
                      {discoverRow(discover.data.upcoming)}
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

// Résultats de recherche IGDB : taper une ligne ajoute directement le jeu
// (statut « Voulus ») puis ouvre sa fiche — pas d'étape intermédiaire, à la
// différence de la recherche séries/films (pas de bouton + séparé ici).
function GameSearchResults({ query, rawQuery }: { query: string; rawQuery: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const search = useQuery({
    queryKey: ['games', 'search', query],
    queryFn: () => api.get<{ results: GameSearchResultDto[] }>(`/api/games/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
  });

  const add = async (r: GameSearchResultDto) => {
    if (addingKey) return;
    setAddingKey(r.igdbId);
    try {
      const res = await api.post<{ mediaId: string | null }>('/api/games/add-from-igdb', {
        igdbId: r.igdbId,
        status: 'wishlist',
      });
      qc.invalidateQueries({ queryKey: ['games', 'library'] });
      if (res.mediaId) router.push(('/game/' + res.mediaId) as Href);
    } finally {
      setAddingKey(null);
    }
  };

  if (search.isLoading) return <Loading />;
  const results = search.data?.results ?? [];
  if (results.length === 0) {
    return <EmptyState title="Toutes nos excuses" message={`Nous n'avons trouvé aucun résultat pour « ${rawQuery.trim()} »`} />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24, paddingTop: 6 }} keyboardShouldPersistTaps="handled">
      {results.map((r, i) => (
        <AppearItem key={r.igdbId} index={i}>
          <Pressable style={styles.resultRow} onPress={() => add(r)} disabled={!!addingKey}>
            {tmdbImage(r.posterPath, 'w185') ? (
              <Image source={{ uri: tmdbImage(r.posterPath, 'w185')! }} style={styles.resultPoster} resizeMode="cover" />
            ) : (
              <View style={[styles.resultPoster, styles.posterEmpty]}>
                <Feather name="image" size={18} color="#b4b4b4" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTitle} numberOfLines={1}>
                {r.title}
              </Text>
              {r.year ? <Text style={styles.resultMeta}>{r.year}</Text> : null}
            </View>
            {addingKey === r.igdbId ? (
              <ActivityIndicator color={COLORS.black} size="small" />
            ) : (
              <Feather name="plus" size={22} color="#E6B800" />
            )}
          </Pressable>
        </AppearItem>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4, gap: 4 },
  cell: { width: '32.5%' },
  // Barre de recherche (mêmes cotes que explore.tsx).
  searchbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 18, height: 44, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  input: { flex: 1, fontFamily: FONTS.regular, fontSize: 15.5, borderWidth: 0, paddingVertical: 6 },
  cancel: { color: COLORS.blue, fontFamily: FONTS.regular, fontSize: 16 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderLight },
  resultPoster: { width: 56, aspectRatio: 2 / 3, borderRadius: 4, backgroundColor: '#e5e5e5' },
  posterEmpty: { alignItems: 'center', justifyContent: 'center' },
  resultTitle: { fontSize: 17, fontFamily: FONTS.bold },
  resultMeta: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textMuted, marginTop: 3 },
  // Sous-titre de groupe (mois) au-dessus d'un carrousel « Sorties à venir ».
  groupLabel: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.textMuted, marginHorizontal: 16, marginBottom: 6, letterSpacing: 0.4 },
  // Overlay « en cours d'ajout » posé sur une jaquette de découverte.
  posterBusy: {
    position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: 2 / 3,
    borderRadius: RADIUS.poster, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
});
