import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { QueueItemDto } from '@/lib/types';
import { episodeCode } from '@/lib/format';
import { tmdbImage } from '@/lib/api';
import { COLORS, SHADOW, FONTS, RADIUS, SPACE } from '@/lib/theme';
import { ShowPill, Badge, CheckCircle } from './ui';

const BADGE_MAP: Record<string, { label: string; variant: 'black' | 'yellow' }> = {
  PREMIERE: { label: 'PREMIERE', variant: 'black' },
  NOUVEAU: { label: 'NOUVEAU', variant: 'yellow' },
  PLUS_RECENT: { label: 'PLUS RÉCENT', variant: 'black' },
};

// `watched` distingue l'historique avec une surface apaisée et une coche verte.
// La pastille du titre ouvre la fiche de la série ; un appui ailleurs sur la
// carte ouvre la fiche de l'épisode (`onOpenEpisode`).
export function EpisodeQueueCard({
  item,
  onCheck,
  watched,
  onOpenEpisode,
}: {
  item: QueueItemDto;
  onCheck: () => void;
  watched?: boolean;
  onOpenEpisode?: () => void;
}) {
  const router = useRouter();
  const ep = item.nextEpisode;
  const openShow = () => router.push(`/show/${item.media.id}`);
  const thumbUri = tmdbImage(ep?.stillPath, 'w300') ?? tmdbImage(item.media.posterPath, 'w342');
  const accessibilityLabel = ep
    ? `${item.media.title}, ${episodeCode(ep.seasonNumber, ep.episodeNumber)}, ${ep.title}${
        item.remainingCount > 0 ? `, plus ${item.remainingCount} épisode${item.remainingCount > 1 ? 's' : ''}` : ''
      }`
    : `${item.media.title}, aucun épisode à voir`;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, watched && styles.cardWatched, pressed && styles.cardPressed]}
      onPress={ep && onOpenEpisode ? onOpenEpisode : openShow}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={ep && onOpenEpisode ? "Ouvre le détail de l'épisode" : 'Ouvre la fiche de la série'}
    >
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={[styles.thumb, watched && styles.thumbWatched]} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <View style={styles.thumbIcon}>
            <Feather name="image" size={22} color={COLORS.textSoft} />
          </View>
        </View>
      )}
      <View style={styles.body}>
        <ShowPill label={item.media.title} onPress={openShow} />
        {ep ? (
          <>
            <View style={styles.codeRow}>
              <Text style={styles.code} numberOfLines={1}>
                {episodeCode(ep.seasonNumber, ep.episodeNumber)}
              </Text>
              {item.remainingCount > 0 ? (
                <Text
                  style={styles.plus}
                  accessibilityLabel={`${item.remainingCount} épisode${item.remainingCount > 1 ? 's' : ''} supplémentaire${
                    item.remainingCount > 1 ? 's' : ''
                  }`}
                >
                  +{item.remainingCount}
                </Text>
              ) : null}
            </View>
            <Text style={styles.epTitle} numberOfLines={1}>
              {ep.title}
            </Text>
          </>
        ) : (
          <Text style={styles.epTitle}>Aucun épisode à voir</Text>
        )}
        {!watched && item.badges.length > 0 ? (
          <View style={styles.badges}>
            {item.badges.map((b) => {
              const badge = BADGE_MAP[b];
              return badge ? <Badge key={b} label={badge.label} variant={badge.variant} /> : null;
            })}
          </View>
        ) : null}
      </View>
      {ep ? (
        <View style={styles.checkWrap}>
          <CheckCircle
            onPress={onCheck}
            size={34}
            checked={watched}
            checkedBg={COLORS.green}
            checkedFg="#fff"
          />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    minHeight: 116,
    marginHorizontal: SPACE.md,
    marginBottom: SPACE.sm,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
    ...SHADOW.card,
  },
  cardPressed: { opacity: 0.9 },
  cardWatched: { backgroundColor: COLORS.surfaceMuted, borderColor: COLORS.success },
  thumb: { width: 104, alignSelf: 'stretch', backgroundColor: COLORS.imagePlaceholder },
  thumbWatched: { opacity: 0.68 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.surfaceMuted,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.sm,
    gap: SPACE.xxs,
  },
  codeRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs },
  code: { color: COLORS.text, fontSize: 18, lineHeight: 23, fontFamily: FONTS.extraBold, flexShrink: 1 },
  plus: { fontSize: 12, lineHeight: 18, fontFamily: FONTS.extraBold, color: COLORS.plusCount, flexShrink: 0 },
  epTitle: { color: COLORS.textMuted, fontFamily: FONTS.medium, fontSize: 13, lineHeight: 18 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xxs, marginTop: 2 },
  checkWrap: { width: 56, justifyContent: 'center', alignItems: 'center', paddingRight: SPACE.sm },
});
