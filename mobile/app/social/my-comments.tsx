import React from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, tmdbImage } from '@/lib/api';
import { COLORS, FONTS, RADIUS, SHADOW, SIZES, SPACE } from '@/lib/theme';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, Loading, LoadError } from '@/components/ui';
import { AppearItem } from '@/components/anim';

type MediaType = 'show' | 'movie' | 'game';
type MyComment = {
  id: string;
  body: string;
  createdAt: string;
  media: { id: string; type: MediaType; title: string; posterPath: string | null };
};

function mediaHref(media: MyComment['media']): Href {
  if (media.type === 'game') return ('/game/' + media.id) as Href;
  return ('/show/' + media.id + (media.type === 'movie' ? '?type=movie' : '')) as Href;
}

function mediaLabel(type: MediaType) {
  if (type === 'game') return 'JEU';
  if (type === 'movie') return 'FILM';
  return 'SÉRIE';
}

function mediaIcon(type: MediaType): keyof typeof Feather.glyphMap {
  if (type === 'game') return 'target';
  if (type === 'movie') return 'film';
  return 'tv';
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyCommentsScreen() {
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['social', 'my-comments'],
    queryFn: () => api.get<{ comments: MyComment[] }>('/api/social/comments'),
  });

  return (
    <View style={styles.screen}>
      <PageHeader title="Mes commentaires" />
      <View style={styles.canvas}>
        {isLoading ? (
          <Loading />
        ) : isError && !data ? (
          <LoadError onRetry={refetch} busy={isRefetching} />
        ) : (
          <FlatList
            data={data?.comments ?? []}
            keyExtractor={(comment) => comment.id}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} />}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.intro}>
                <View style={styles.eyebrow}>
                  <Feather name="message-circle" size={14} color={COLORS.primary} />
                  <Text style={styles.eyebrowText}>MES ÉCHANGES</Text>
                </View>
                <Text style={styles.introTitle}>Tes avis, au même endroit</Text>
                <Text style={styles.introBody}>
                  Retrouve les commentaires laissés sur tes séries, films et jeux.
                </Text>
              </View>
            }
            ListEmptyComponent={
              <EmptyState
                title="Aucun commentaire"
                message="Tes commentaires sur les séries, films et jeux apparaîtront ici."
              />
            }
            renderItem={({ item: comment, index }) => {
              const poster = tmdbImage(comment.media.posterPath, 'w185');
              return (
                <AppearItem index={index}>
                  <Pressable
                    style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                    onPress={() => router.push(mediaHref(comment.media))}
                    accessibilityRole="button"
                    accessibilityLabel={'Ouvrir ' + comment.media.title}
                  >
                    <View style={styles.poster}>
                      {poster ? (
                        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : (
                        <Feather name={mediaIcon(comment.media.type)} size={22} color={COLORS.textSoft} />
                      )}
                    </View>
                    <View style={styles.copy}>
                      <View style={styles.metaRow}>
                        <View style={styles.typePill}>
                          <Text style={styles.typeText}>{mediaLabel(comment.media.type)}</Text>
                        </View>
                        <Text style={styles.date}>{dateLabel(comment.createdAt)}</Text>
                      </View>
                      <Text style={styles.title} numberOfLines={1}>{comment.media.title}</Text>
                      <Text style={styles.body} numberOfLines={4}>« {comment.body} »</Text>
                      <View style={styles.openRow}>
                        <Text style={styles.openText}>Ouvrir la fiche</Text>
                        <Feather name="arrow-up-right" size={15} color={COLORS.primary} />
                      </View>
                    </View>
                  </Pressable>
                </AppearItem>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.pageMuted },
  canvas: { flex: 1, width: '100%', maxWidth: SIZES.contentMax, alignSelf: 'center' },
  list: { flexGrow: 1, paddingHorizontal: SPACE.md, paddingTop: SPACE.md, paddingBottom: SPACE.xl, gap: SPACE.sm },
  intro: {
    marginBottom: SPACE.xxs,
    padding: SPACE.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
    ...SHADOW.card,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACE.xs },
  eyebrowText: { color: COLORS.primary, fontSize: 11, lineHeight: 15, fontFamily: FONTS.extraBold, letterSpacing: 0.8 },
  introTitle: { color: COLORS.text, fontSize: 24, lineHeight: 30, fontFamily: FONTS.extraBold },
  introBody: { marginTop: SPACE.xs, color: COLORS.textMuted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular },
  card: {
    minHeight: 148,
    flexDirection: 'row',
    gap: SPACE.md,
    padding: SPACE.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
    ...SHADOW.card,
  },
  pressed: { opacity: 0.82 },
  poster: {
    width: 82,
    aspectRatio: 2 / 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.imagePlaceholder,
    borderRadius: RADIUS.poster,
  },
  copy: { minWidth: 0, flex: 1, paddingVertical: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.xs },
  typePill: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.pill },
  typeText: { color: COLORS.primary, fontSize: 9, lineHeight: 12, fontFamily: FONTS.extraBold, letterSpacing: 0.7 },
  date: { flexShrink: 1, color: COLORS.textSoft, fontSize: 11, lineHeight: 15, fontFamily: FONTS.regular, textAlign: 'right' },
  title: { marginTop: SPACE.xs, color: COLORS.text, fontSize: 16, lineHeight: 21, fontFamily: FONTS.extraBold },
  body: { marginTop: 5, color: COLORS.textMuted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 'auto', paddingTop: SPACE.xs },
  openText: { color: COLORS.primary, fontSize: 12, lineHeight: 16, fontFamily: FONTS.bold },
});
