import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tmdbImage } from '@/lib/api';
import type { MediaDto } from '@/lib/types';
import type { LibraryShow } from '@/components/library';
import { COLORS, FONTS, RADIUS, SHADOW, SIZES, SPACE } from '@/lib/theme';
import { PrismeCard, ProgressBar, SectionHeader } from '@/components/prisme';
import { EmptyState, Loading, LoadError, Poster } from '@/components/ui';
import { AppearItem } from '@/components/anim';

// Briques de l'onglet Communauté ((tabs)/community.tsx) : carrousel « Tes amis
// ont adoré », carte « Défi de la semaine » et segment Clubs.

type MediaRef = { id: string; title: string; posterPath: string | null; type: 'show' | 'movie' | 'game' };
type MiniUser = { userId: string; displayName: string; avatarUrl: string | null };
type Recommendation = { media: MediaRef; fans: MiniUser[]; avgRating: number; fanCount: number };
type ChallengeEntry = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  minutes: number;
  isMe: boolean;
};
type ClubDto = {
  id: string;
  media: MediaRef;
  memberCount: number;
  friendMembers: MiniUser[];
  isMember: boolean;
};

// Même or que les médailles du classement (stats/leaderboard.tsx).
const GOLD = '#D4A017';

function mediaHref(media: MediaRef): Href {
  if (media.type === 'game') return ('/game/' + media.id) as Href;
  return ('/show/' + media.id + (media.type === 'movie' ? '?type=movie' : '')) as Href;
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

// « Camille, Théo +2 » : max deux prénoms, le reste en compteur.
function fanLabel(fans: MiniUser[], fanCount: number): string {
  const names = fans.slice(0, 2).map((f) => firstName(f.displayName));
  const extra = fanCount - names.length;
  return names.join(', ') + (extra > 0 ? ' +' + extra : '');
}

// « 4 h 32 » / « 45 min » / « 0 min ».
function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return m + ' min';
  return m > 0 ? h + ' h ' + String(m).padStart(2, '0') : h + ' h';
}

// --- « Tes amis ont adoré » (en-tête du Fil) -------------------------------

export function FriendsLovedCarousel() {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['social', 'recommendations'],
    queryFn: () => api.get<{ items: Recommendation[] }>('/api/social/recommendations'),
    staleTime: 5 * 60_000,
  });
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <View style={styles.lovedWrap}>
      <SectionHeader title="Tes amis ont adoré" style={styles.lovedHeader} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.lovedRow}
      >
        {items.map((item) => (
          <View key={item.media.id} style={styles.lovedItem}>
            <Poster
              title={item.media.title}
              uri={tmdbImage(item.media.posterPath, 'w342')}
              width={104}
              onPress={() => router.push(mediaHref(item.media))}
            />
            <Text style={styles.lovedRating} accessibilityLabel={'Note moyenne ' + item.avgRating}>
              ★ {String(item.avgRating).replace('.', ',')}
            </Text>
            <Text style={styles.lovedFans} numberOfLines={2}>
              Aimé par {fanLabel(item.fans, item.fanCount)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// --- Défi de la semaine (segment Classement) -------------------------------

export function WeeklyChallengeCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['social', 'challenge', 'weekly'],
    queryFn: () =>
      api.get<{ weekStart: string; entries: ChallengeEntry[] }>('/api/social/challenge/weekly'),
    staleTime: 60_000,
  });
  // En erreur, on s'efface : le classement en dessous garde ses propres états.
  if (isError) return null;

  const entries = data?.entries ?? [];
  const leaderMinutes = entries[0]?.minutes ?? 0;
  const allZero = entries.length > 0 && entries.every((e) => e.minutes === 0);

  return (
    <PrismeCard elevated style={styles.challengeCard}>
      <View style={styles.challengeHead}>
        <Feather name="zap" size={16} color={COLORS.primary} />
        <Text style={styles.challengeTitle} accessibilityRole="header">
          Défi de la semaine
        </Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={styles.challengeLoading} />
      ) : allZero ? (
        <Text style={styles.challengeEmpty}>
          Personne n’a encore regardé quoi que ce soit cette semaine — lance le défi !
        </Text>
      ) : (
        entries.map((entry, index) => (
          <View
            key={entry.userId}
            style={[styles.challengeRow, entry.isMe && styles.challengeRowMe]}
          >
            <Text style={styles.challengeRank}>{index + 1}</Text>
            {entry.avatarUrl ? (
              <Image
                source={{ uri: tmdbImage(entry.avatarUrl, 'w185') ?? entry.avatarUrl }}
                style={styles.challengeAvatar}
                accessible={false}
              />
            ) : (
              <View style={[styles.challengeAvatar, styles.challengeAvatarEmpty]}>
                <Text style={styles.challengeAvatarInit}>
                  {entry.displayName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.challengeBody}>
              <View style={styles.challengeNameRow}>
                <Text style={styles.challengeName} numberOfLines={1}>
                  {entry.displayName}
                </Text>
                {index === 0 ? (
                  <Feather name="award" size={14} color={GOLD} accessibilityLabel="En tête" />
                ) : null}
                {entry.isMe ? <Text style={styles.challengeMe}>vous</Text> : null}
              </View>
              <ProgressBar
                value={entry.minutes}
                max={Math.max(1, leaderMinutes)}
                label={'Minutes vues par ' + entry.displayName + ' cette semaine'}
                height={5}
                style={styles.challengeBar}
              />
            </View>
            <Text style={styles.challengeMinutes}>{minutesLabel(entry.minutes)}</Text>
          </View>
        ))
      )}
      <Text style={styles.challengeFoot}>Depuis lundi</Text>
    </PrismeCard>
  );
}

// --- Clubs -----------------------------------------------------------------

export function ClubsTab() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['clubs'],
    queryFn: () => api.get<{ mine: ClubDto[]; suggested: ClubDto[] }>('/api/clubs'),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['clubs'] });
  const join = useMutation({
    mutationFn: (clubId: string) =>
      api.post<{ ok: boolean; memberCount: number }>('/api/clubs/' + clubId + '/join'),
    onSuccess: invalidate,
    onError: () => setMutationError('Impossible de rejoindre le club. Réessaie.'),
  });
  const leave = useMutation({
    mutationFn: (clubId: string) =>
      api.post<{ ok: boolean; memberCount: number }>('/api/clubs/' + clubId + '/leave'),
    onSuccess: invalidate,
    onError: () => setMutationError('Impossible de quitter le club. Réessaie.'),
  });

  // Confirmation avant de quitter : Alert natif ; window.confirm sur le web
  // (Alert.alert y est muet).
  const confirmLeave = (club: ClubDto) => {
    setMutationError(null);
    const doLeave = () => leave.mutate(club.id);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Quitter le club « ' + club.media.title + ' » ?')) {
        doLeave();
      }
      return;
    }
    Alert.alert('Quitter le club', 'Tu ne feras plus partie du club « ' + club.media.title + ' ».', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: doLeave },
    ]);
  };

  if (isLoading) return <Loading />;
  if (isError && !data) return <LoadError onRetry={() => void refetch()} busy={isRefetching} />;

  const mine = data?.mine ?? [];
  const suggested = data?.suggested ?? [];
  const busy = join.isPending || leave.isPending;

  const createButton = (
    <Pressable
      onPress={() => {
        setMutationError(null);
        setCreateOpen(true);
      }}
      style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Créer un club"
    >
      <Feather name="plus" size={16} color={COLORS.onPrimary} />
      <Text style={styles.createButtonText}>CRÉER UN CLUB</Text>
    </Pressable>
  );

  return (
    <>
      <ScrollView
        style={styles.clubsList}
        contentContainerStyle={styles.clubsContent}
        showsVerticalScrollIndicator={false}
      >
        {mutationError ? (
          <Text style={styles.inlineError} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {mutationError}
          </Text>
        ) : null}
        {mine.length === 0 && suggested.length === 0 ? (
          <EmptyState
            title="Aucun club pour l'instant"
            message="Crée le premier autour d'une série, d'un film ou d'un jeu de ta bibliothèque !"
          />
        ) : (
          <>
            {mine.length > 0 ? (
              <>
                <SectionHeader title="Mes clubs" style={styles.clubsSection} />
                {mine.map((club, index) => (
                  <AppearItem key={club.id} index={index}>
                    <ClubRow
                      club={club}
                      onOpen={() => openClub(club)}
                      action={
                        <Pressable
                          onPress={() => confirmLeave(club)}
                          disabled={busy}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.leaveButton,
                            pressed && styles.pressed,
                            busy && styles.disabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={'Quitter le club ' + club.media.title}
                          accessibilityState={{ disabled: busy }}
                        >
                          <Text style={styles.leaveButtonText}>Quitter</Text>
                        </Pressable>
                      }
                    />
                  </AppearItem>
                ))}
              </>
            ) : null}
            {suggested.length > 0 ? (
              <>
                <SectionHeader title="Suggestions" style={styles.clubsSection} />
                {suggested.map((club, index) => (
                  <AppearItem key={club.id} index={index}>
                    <ClubRow
                      club={club}
                      onOpen={() => openClub(club)}
                      action={
                        <Pressable
                          onPress={() => {
                            setMutationError(null);
                            join.mutate(club.id);
                          }}
                          disabled={busy}
                          style={({ pressed }) => [
                            styles.joinButton,
                            pressed && styles.pressed,
                            busy && styles.disabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={'Rejoindre le club ' + club.media.title}
                          accessibilityState={{ disabled: busy }}
                        >
                          {join.isPending && join.variables === club.id ? (
                            <ActivityIndicator size="small" color={COLORS.onPrimary} />
                          ) : (
                            <Text style={styles.joinButtonText}>REJOINDRE</Text>
                          )}
                        </Pressable>
                      }
                    />
                  </AppearItem>
                ))}
              </>
            ) : null}
          </>
        )}
        {createButton}
      </ScrollView>
      <CreateClubModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          invalidate();
          setCreateOpen(false);
        }}
      />
    </>
  );

  // La discussion du club = le fil de commentaires du média (écran existant).
  function openClub(club: ClubDto) {
    router.push(
      ('/comments/' + club.media.id + '?title=' + encodeURIComponent(club.media.title)) as Href,
    );
  }
}

function ClubRow({
  club,
  onOpen,
  action,
}: {
  club: ClubDto;
  onOpen: () => void;
  action: React.ReactNode;
}) {
  const friends = club.friendMembers.map((f) => firstName(f.displayName));
  return (
    <PrismeCard
      onPress={onOpen}
      accessibilityLabel={'Ouvrir la discussion du club ' + club.media.title}
      accessibilityHint="Ouvre le fil de commentaires du média"
      style={styles.clubCard}
    >
      {/* Décoratif : sans ce pointerEvents, le Pressable interne du Poster
          avalerait le press de la carte (zone morte). */}
      <View pointerEvents="none" accessible={false}>
        <Poster title={club.media.title} uri={tmdbImage(club.media.posterPath, 'w185')} width={46} />
      </View>
      <View style={styles.clubCopy}>
        <Text style={styles.clubTitle} numberOfLines={1}>
          {club.media.title}
        </Text>
        <Text style={styles.clubMeta}>
          {club.memberCount} {club.memberCount > 1 ? 'membres' : 'membre'}
        </Text>
        {friends.length > 0 ? (
          <Text style={styles.clubFriends} numberOfLines={1}>
            Avec {friends.join(', ')}
          </Text>
        ) : null}
      </View>
      {action}
    </PrismeCard>
  );
}

// Choix du média du club : mes séries + mes films (queries des écrans
// bibliothèque réutilisées telles quelles, mêmes clés de cache).
function CreateClubModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const shows = useQuery({
    queryKey: ['shows', 'library'],
    queryFn: () => api.get<{ items: LibraryShow[] }>('/api/shows/library'),
    enabled: visible,
  });
  const movies = useQuery({
    queryKey: ['movies', 'library', 'last_watched', 'all'],
    queryFn: () =>
      api.get<{ seen: MediaDto[]; unseen: MediaDto[] }>(
        '/api/movies/profile?sort=last_watched&filter=all',
      ),
    enabled: visible,
  });

  const create = useMutation({
    mutationFn: (mediaId: string) => api.post<ClubDto>('/api/clubs', { mediaId }),
    onSuccess: () => {
      setFilter('');
      setError(null);
      onCreated();
    },
    onError: () => setError("Le club n'a pas pu être créé. Réessaie."),
  });

  const items = useMemo(() => {
    const all: MediaDto[] = [
      ...(shows.data?.items ?? []),
      ...(movies.data?.seen ?? []),
      ...(movies.data?.unseen ?? []),
    ];
    const needle = filter.trim().toLowerCase();
    return all
      .filter((m) => !needle || m.title.toLowerCase().includes(needle))
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  }, [shows.data, movies.data, filter]);

  const loading = shows.isLoading || movies.isLoading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer la fenêtre"
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle} accessibilityRole="header">
              Créer un club
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Feather name="x" size={20} color={COLORS.text} />
            </Pressable>
          </View>
          <Text style={styles.modalHint}>
            Choisis une série ou un film de ta bibliothèque : le club réunit ses fans.
          </Text>
          <View style={styles.modalSearch}>
            <Feather name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              style={styles.modalInput}
              placeholder="Filtrer ma bibliothèque"
              placeholderTextColor={COLORS.textSoft}
              value={filter}
              onChangeText={setFilter}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Filtrer ma bibliothèque"
            />
          </View>
          {error ? (
            <Text style={styles.inlineError} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          {loading ? (
            <Loading />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(media) => media.id}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: media }) => (
                <Pressable
                  onPress={() => create.mutate(media.id)}
                  disabled={create.isPending}
                  style={({ pressed }) => [
                    styles.modalRow,
                    pressed && styles.pressed,
                    create.isPending && styles.disabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={'Créer le club ' + media.title}
                  accessibilityState={{ disabled: create.isPending }}
                >
                  <View pointerEvents="none" accessible={false}>
                    <Poster title={media.title} uri={tmdbImage(media.posterPath, 'w185')} width={34} />
                  </View>
                  <Text style={styles.modalRowTitle} numberOfLines={1}>
                    {media.title}
                  </Text>
                  {create.isPending && create.variables === media.id ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Feather name="chevron-right" size={17} color={COLORS.textSoft} />
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>
                  {filter.trim()
                    ? 'Aucun titre de ta bibliothèque ne correspond.'
                    : 'Ta bibliothèque est vide : ajoute d’abord une série ou un film.'}
                </Text>
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  inlineError: {
    color: COLORS.danger,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.bold,
    marginBottom: SPACE.xs,
  },
  // « Tes amis ont adoré »
  lovedWrap: { marginBottom: SPACE.xs },
  lovedHeader: { marginTop: 0 },
  lovedRow: { gap: SPACE.sm, paddingRight: SPACE.md },
  lovedItem: { width: 104 },
  lovedRating: {
    color: COLORS.text,
    fontSize: 12.5,
    fontFamily: FONTS.extraBold,
    marginTop: SPACE.xxs,
  },
  lovedFans: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  // Défi de la semaine
  challengeCard: { marginBottom: SPACE.sm },
  challengeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    marginBottom: SPACE.xs,
  },
  challengeTitle: { color: COLORS.text, fontSize: 17, fontFamily: FONTS.extraBold },
  challengeLoading: { paddingVertical: SPACE.lg },
  challengeEmpty: {
    color: COLORS.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: FONTS.regular,
    paddingVertical: SPACE.sm,
  },
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.xs,
    paddingHorizontal: SPACE.xs,
    borderRadius: RADIUS.control,
  },
  challengeRowMe: { backgroundColor: COLORS.primarySoft },
  challengeRank: {
    width: 20,
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.extraBold,
  },
  challengeAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primarySoft },
  challengeAvatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  challengeAvatarInit: { color: COLORS.primary, fontSize: 14, fontFamily: FONTS.extraBold },
  challengeBody: { flex: 1, minWidth: 0 },
  challengeNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs },
  challengeName: {
    flexShrink: 1,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.bold,
  },
  challengeMe: { color: COLORS.primary, fontSize: 12, fontFamily: FONTS.regular },
  challengeBar: { marginTop: SPACE.xxs },
  challengeMinutes: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.extraBold },
  challengeFoot: {
    color: COLORS.textSoft,
    fontSize: 11,
    fontFamily: FONTS.medium,
    marginTop: SPACE.xs,
  },
  // Clubs
  clubsList: { flex: 1 },
  clubsContent: {
    padding: SPACE.md,
    paddingBottom: 120,
    width: '100%',
    maxWidth: SIZES.contentMax,
    alignSelf: 'center',
  },
  clubsSection: { marginTop: SPACE.xs },
  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    padding: SPACE.sm,
    marginBottom: SPACE.sm,
    ...SHADOW.card,
  },
  clubCopy: { flex: 1, minWidth: 0 },
  clubTitle: { color: COLORS.text, fontSize: 15, fontFamily: FONTS.extraBold },
  clubMeta: {
    color: COLORS.textMuted,
    fontSize: 12.5,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  clubFriends: {
    color: COLORS.primary,
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    marginTop: 2,
  },
  leaveButton: {
    minHeight: SIZES.touch,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xs,
    borderRadius: RADIUS.control,
  },
  leaveButtonText: { color: COLORS.textMuted, fontSize: 12.5, fontFamily: FONTS.bold },
  joinButton: {
    minWidth: 104,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
  },
  joinButtonText: {
    color: COLORS.onPrimary,
    fontSize: 11,
    fontFamily: FONTS.extraBold,
    letterSpacing: 0.5,
  },
  createButton: {
    minHeight: SIZES.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xxs,
    alignSelf: 'center',
    marginTop: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    ...SHADOW.card,
  },
  createButtonText: {
    color: COLORS.onPrimary,
    fontSize: 13,
    fontFamily: FONTS.extraBold,
    letterSpacing: 0.6,
  },
  // Modal « Créer un club »
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: COLORS.overlay,
  },
  modalSheet: {
    maxHeight: '80%',
    width: '100%',
    maxWidth: SIZES.contentMax,
    alignSelf: 'center',
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    padding: SPACE.md,
    paddingBottom: SPACE.lg,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.sm,
  },
  modalTitle: { color: COLORS.text, fontSize: 19, fontFamily: FONTS.extraBold },
  modalClose: {
    width: SIZES.touch,
    height: SIZES.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.control,
  },
  modalHint: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.regular,
    marginBottom: SPACE.sm,
  },
  modalSearch: {
    minHeight: SIZES.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
    marginBottom: SPACE.sm,
  },
  modalInput: {
    flex: 1,
    minWidth: 0,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.regular,
    paddingVertical: SPACE.xs,
  },
  modalList: { flexGrow: 0 },
  modalRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.xxs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  modalRowTitle: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 14.5, fontFamily: FONTS.bold },
  modalEmpty: {
    color: COLORS.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: FONTS.regular,
    paddingVertical: SPACE.md,
    textAlign: 'center',
  },
});
