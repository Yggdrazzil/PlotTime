import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api, tmdbImage } from '@/lib/api';
import type { MediaDto } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { COLORS, FONTS } from '@/lib/theme';
import { EmptyState, Loading, Poster } from '@/components/ui';
import { SORT_OPTIONS, SortSheet, sortFavorites } from '@/components/favorites';

// Jeux préférés (profil → « Jeux préférés ») : grille simple, tap = fiche jeu.
// Le favori se bascule depuis le menu « ⋯ » de la fiche ; pas de drag & drop
// ici en V1 (contrairement aux séries/films). Rangée TRIER PAR comme les
// pages séries/films — le tri choisi est persisté et repris sur le profil.
export default function FavoriteGamesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sortOpen, setSortOpen] = useState(false);
  const sort = useAppStore((s) => s.favSort.game);
  const setFavSort = useAppStore((s) => s.setFavSort);
  const { data, isLoading } = useQuery({
    queryKey: ['profile', 'favorites', 'game'],
    queryFn: () => api.get<{ favorites: MediaDto[] }>('/api/profile/favorites?type=game'),
  });
  const favs = useMemo(() => sortFavorites(data?.favorites ?? [], sort), [data, sort]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headSide} accessibilityRole="button" accessibilityLabel="Retour">
          <Feather name="chevron-left" size={26} color={COLORS.black} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="game-controller-outline" size={18} color={COLORS.black} />
          <Text style={styles.title}>Jeux préférés</Text>
        </View>
        <View style={styles.headSide} />
      </View>
      {isLoading ? (
        <Loading />
      ) : favs.length === 0 ? (
        <EmptyState
          title="Aucun jeu en favori"
          message="Ajoute tes jeux préférés depuis le menu « ⋯ » d'une fiche jeu."
        />
      ) : (
        <>
          <Pressable style={styles.sortRow} onPress={() => setSortOpen(true)}>
            <Text style={styles.sortLabel}>TRIER PAR</Text>
            <Text style={styles.sortValue}>{SORT_OPTIONS.find((o) => o.key === sort)?.label ?? ''}</Text>
          </Pressable>
          <ScrollView contentContainerStyle={styles.grid}>
            {favs.map((g) => (
              <View key={g.id} style={styles.cell}>
                <Poster
                  title={g.title}
                  uri={tmdbImage(g.posterPath)}
                  onPress={() => router.push(`/game/${g.id}` as Href)}
                />
              </View>
            ))}
          </ScrollView>
        </>
      )}

      <SortSheet
        visible={sortOpen}
        current={sort}
        onClose={() => setSortOpen(false)}
        onApply={(key) => { setFavSort('game', key); setSortOpen(false); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Rangée TRIER PAR : mêmes cotes que les pages séries/films préférés.
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sortLabel: { fontSize: 11, fontFamily: FONTS.extraBold, color: COLORS.textMuted, letterSpacing: 0.5 },
  sortValue: { fontSize: 16, fontFamily: FONTS.semiBold, color: COLORS.blue },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  headSide: { width: 40, alignItems: 'center' },
  title: { color: COLORS.text, fontSize: 17, fontFamily: FONTS.extraBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  cell: { width: '31%' },
});
