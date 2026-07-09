import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Modal, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, tmdbImage } from '@/lib/api';
import type { MediaDto } from '@/lib/types';
import { COLORS, FONTS } from '@/lib/theme';
import { Loading, LoadError, EmptyState } from '@/components/ui';
import { LibHeader, Grid, MovieCell } from '@/components/library';
import { Pop } from '@/components/anim';

export default function FavoriteMoviesScreen() {
  const [picker, setPicker] = useState(false);
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['movies', 'library', 'all'],
    queryFn: () => api.get<{ seen: MediaDto[]; unseen: MediaDto[] }>('/api/movies/profile?filter=all'),
  });
  const all = [...(data?.seen ?? []), ...(data?.unseen ?? [])];
  const favs = all.filter((m) => m.isFavorite);

  return (
    <Pop style={{ backgroundColor: COLORS.white }}>
      <LibHeader title="Films préférés" />
      {isLoading ? (
        <Loading />
      ) : isError && !data ? (
        <LoadError onRetry={refetch} busy={isRefetching} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <Pressable style={styles.addBtn} onPress={() => setPicker(true)}>
            <Text style={styles.addText}>AJOUTER/SUPPRIMER DES FILMS</Text>
          </Pressable>
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>TRIER PAR </Text>
            <Text style={styles.sortValue}>Ordre de l'utilisateur</Text>
          </View>
          {favs.length === 0 ? (
            <EmptyState title="Aucun film en favori" message="Ajoute tes films préférés avec le bouton ci-dessus." />
          ) : (
            <Grid>{favs.map((m) => <MovieCell key={m.id} movie={m} />)}</Grid>
          )}
        </ScrollView>
      )}
      <FavPicker visible={picker} items={all} onClose={() => setPicker(false)} />
    </Pop>
  );
}

function FavPicker({ visible, items, onClose }: { visible: boolean; items: MediaDto[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (id: string) => api.post(`/api/movies/${id}/favorite`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['movies', 'library', 'all'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.white, paddingTop: insets.top }}>
        <View style={styles.pickerHead}>
          <Text style={styles.pickerTitle}>Films préférés</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="x" size={26} color={COLORS.black} />
          </Pressable>
        </View>
        {items.length === 0 ? (
          <EmptyState title="Aucun film" message="Ajoute des films pour pouvoir les mettre en favori." />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
            {items.map((m) => (
              <Pressable key={m.id} style={styles.pickRow} onPress={() => toggle.mutate(m.id)}>
                <Image source={{ uri: tmdbImage(m.posterPath, 'w185') ?? undefined }} style={styles.pickPoster} resizeMode="cover" />
                <Text style={styles.pickName} numberOfLines={2}>{m.title}</Text>
                <Feather name="star" size={26} color={m.isFavorite ? COLORS.yellow : '#ccc'} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  addBtn: { backgroundColor: COLORS.yellow, borderRadius: 999, marginHorizontal: 16, marginTop: 16, paddingVertical: 15, alignItems: 'center' },
  addText: { fontSize: 15, fontFamily: FONTS.extraBold, letterSpacing: 0.5 },
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  sortLabel: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.textMuted, letterSpacing: 0.5 },
  sortValue: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.blue },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  pickerTitle: { fontSize: 20, fontFamily: FONTS.extraBold },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderLight },
  pickPoster: { width: 44, height: 66, borderRadius: 4, backgroundColor: '#e5e5e5' },
  pickName: { flex: 1, fontSize: 16, fontFamily: FONTS.semiBold },
});
