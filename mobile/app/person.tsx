import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { goBack } from '@/lib/nav';
import { api, tmdbImage } from '@/lib/api';
import { COLORS, FONTS, RADIUS, SHADOW, SIZES, SPACE } from '@/lib/theme';
import { EmptyState, LoadError } from '@/components/ui';
import { FadeSwitch } from '@/components/anim';
import { Stars } from '@/components/Stars';

type CastMember = {
  name: string;
  character: string | null;
  profilePath: string | null;
  tmdbId: string | null;
};

type Filmo = {
  tmdbId: string;
  mediaType: 'show' | 'movie';
  title: string;
  character: string | null;
  year: string | null;
  posterPath: string | null;
  episodeCount: number | null;
  rating: number | null;
  genres: string[];
};

type Person = {
  tmdbId: string;
  name: string;
  biography: string | null;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  twitter: string | null;
  instagram: string | null;
  filmography: Filmo[];
};

type FilmoFilter = 'all' | 'show' | 'movie';

const FILTERS: { value: FilmoFilter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'show', label: 'Séries' },
  { value: 'movie', label: 'Films' },
];

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export default function PersonScreen() {
  const params = useLocalSearchParams<{ mediaId?: string; type?: string; index?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMovie = params.type === 'movie';
  const isWide = width >= 680;
  const [index, setIndex] = useState(Math.max(0, Number(params.index ?? 0) || 0));
  const [filter, setFilter] = useState<FilmoFilter>('all');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const detail = useQuery({
    queryKey: [isMovie ? 'movie' : 'show', String(params.mediaId)],
    queryFn: () =>
      api.get<{ cast: CastMember[] }>(
        '/api/' + (isMovie ? 'movies' : 'shows') + '/' + params.mediaId,
      ),
    enabled: !!params.mediaId,
  });

  const cast = detail.data?.cast ?? [];
  const safeIndex = cast.length > 0 ? Math.min(index, cast.length - 1) : 0;
  const member = cast[safeIndex];

  useEffect(() => {
    if (cast.length > 0 && index !== safeIndex) setIndex(safeIndex);
  }, [cast.length, index, safeIndex]);

  useEffect(() => {
    setOpenError(null);
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ y: 0, animated: false }),
    );
  }, [safeIndex]);

  const person = useQuery({
    queryKey: ['person', member?.tmdbId ?? member?.name],
    queryFn: async () => {
      let personId = member!.tmdbId;
      if (!personId) {
        personId = (
          await api.get<{ tmdbId: string }>(
            '/api/people/search?name=' + encodeURIComponent(member!.name),
          )
        ).tmdbId;
      }
      return api.get<{ person: Person }>('/api/people/' + personId);
    },
    enabled: !!member,
    staleTime: 30 * 60_000,
  });

  const openFilmo = async (item: Filmo) => {
    if (openingId) return;
    const itemKey = item.mediaType + '-' + item.tmdbId;
    setOpeningId(itemKey);
    setOpenError(null);

    try {
      const path =
        item.mediaType === 'movie'
          ? '/api/movies/add-from-tmdb'
          : '/api/shows/add-from-tmdb';
      const result = await api.post<{ mediaId: string }>(path, {
        tmdbId: item.tmdbId,
        follow: false,
      });
      router.push((
        '/show/' + result.mediaId + (item.mediaType === 'movie' ? '?type=movie' : '')
      ) as Href);
    } catch {
      setOpenError("Cette œuvre n'a pas pu être ouverte. Réessaie dans un instant.");
    } finally {
      setOpeningId(null);
    }
  };

  if (detail.isLoading) {
    return (
      <View style={styles.screen}>
        <PersonTopBar
          insetTop={insets.top}
          index={0}
          total={0}
          onPrevious={() => undefined}
          onNext={() => undefined}
        />
        <View
          style={styles.centerState}
          accessibilityRole="progressbar"
          accessibilityLabel="Chargement de la personne"
        >
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </View>
    );
  }

  if (detail.isError) {
    return (
      <View style={styles.screen}>
        <PersonTopBar
          insetTop={insets.top}
          index={0}
          total={0}
          onPrevious={() => undefined}
          onNext={() => undefined}
        />
        <View style={styles.stateCanvas}>
          <LoadError onRetry={detail.refetch} busy={detail.isRefetching} />
        </View>
      </View>
    );
  }

  if (!member) {
    return (
      <View style={styles.screen}>
        <PersonTopBar
          insetTop={insets.top}
          index={0}
          total={0}
          onPrevious={() => undefined}
          onNext={() => undefined}
        />
        <View style={styles.stateCanvas}>
          <EmptyState
            title="Distribution indisponible"
            message="Aucune personne n'est associée à cette œuvre pour le moment."
          />
        </View>
      </View>
    );
  }

  const profile = person.data?.person;
  const photo = tmdbImage(profile?.profilePath ?? member.profilePath, 'w500');
  const filmography = (profile?.filmography ?? []).filter(
    (item) => filter === 'all' || item.mediaType === filter,
  );
  const portraitWidth = isWide
    ? 244
    : Math.min(Math.max(width - SPACE.md * 4, 180), 320);

  return (
    <View style={styles.screen}>
      <PersonTopBar
        insetTop={insets.top}
        index={safeIndex}
        total={cast.length}
        onPrevious={() => setIndex((current) => Math.max(0, current - 1))}
        onNext={() => setIndex((current) => Math.min(cast.length - 1, current + 1))}
      />

      <FadeSwitch trigger={safeIndex}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + SPACE.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.canvas}>
            <View style={[styles.heroCard, isWide && styles.heroCardWide]}>
              <View
                style={[
                  styles.photoCard,
                  {
                    width: portraitWidth,
                    height: portraitWidth * 1.42,
                  },
                ]}
              >
                {photo ? (
                  <Image
                    source={{ uri: photo }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    accessible
                    accessibilityLabel={'Portrait de ' + (profile?.name ?? member.name)}
                  />
                ) : (
                  <View style={styles.photoEmpty} accessible accessibilityLabel="Portrait indisponible">
                    <Feather name="user" size={56} color={COLORS.textSoft} />
                  </View>
                )}
                <View style={styles.castBadge}>
                  <Text style={styles.castBadgeText}>
                    {safeIndex + 1}/{cast.length}
                  </Text>
                </View>
              </View>

              <View style={[styles.identity, isWide && styles.identityWide]}>
                <Text style={styles.eyebrow}>DISTRIBUTION</Text>
                <Text style={styles.name} accessibilityRole="header">
                  {profile?.name ?? member.name}
                </Text>
                {member.character ? (
                  <Text style={styles.character}>Interprète {member.character}</Text>
                ) : null}

                {profile?.birthday ? (
                  <View style={styles.infoRow}>
                    <View style={styles.infoIcon} accessible={false}>
                      <Feather name="calendar" size={17} color={COLORS.primary} />
                    </View>
                    <Text style={styles.infoText}>
                      Né(e) le {dateFr(profile.birthday)}
                      {profile.deathday ? ' · décédé(e) le ' + dateFr(profile.deathday) : ''}
                    </Text>
                  </View>
                ) : null}

                {profile?.placeOfBirth ? (
                  <View style={styles.infoRow}>
                    <View style={styles.infoIcon} accessible={false}>
                      <Feather name="map-pin" size={17} color={COLORS.secondary} />
                    </View>
                    <Text style={styles.infoText}>{profile.placeOfBirth}</Text>
                  </View>
                ) : null}

                {profile?.twitter || profile?.instagram ? (
                  <View style={styles.socialRow}>
                    {profile.twitter ? (
                      <SocialLink
                        icon="at-sign"
                        label="Profil X"
                        onPress={() =>
                          Linking.openURL('https://x.com/' + profile.twitter).catch(() => undefined)
                        }
                      />
                    ) : null}
                    {profile.instagram ? (
                      <SocialLink
                        icon="instagram"
                        label="Instagram"
                        onPress={() =>
                          Linking.openURL('https://instagram.com/' + profile.instagram).catch(
                            () => undefined,
                          )
                        }
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            {person.isLoading ? (
              <View
                style={styles.loadingCard}
                accessibilityRole="progressbar"
                accessibilityLabel="Chargement de la biographie et de la filmographie"
              >
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>Biographie et filmographie…</Text>
              </View>
            ) : null}

            {person.isError ? (
              <View style={styles.inlineError} accessibilityRole="alert">
                <View style={styles.inlineErrorIcon} accessible={false}>
                  <Feather name="wifi-off" size={20} color={COLORS.danger} />
                </View>
                <View style={styles.inlineErrorCopy}>
                  <Text style={styles.inlineErrorTitle}>Informations indisponibles</Text>
                  <Text style={styles.inlineErrorText}>
                    Le casting reste accessible. Réessaie pour charger la biographie.
                  </Text>
                </View>
                <Pressable
                  onPress={() => person.refetch()}
                  disabled={person.isRefetching}
                  style={({ pressed }) => [
                    styles.retryButton,
                    pressed && styles.controlPressed,
                    person.isRefetching && styles.controlDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Réessayer de charger la personne"
                  accessibilityState={{
                    disabled: person.isRefetching,
                    busy: person.isRefetching,
                  }}
                >
                  {person.isRefetching ? (
                    <ActivityIndicator color={COLORS.onPrimary} size="small" />
                  ) : (
                    <Feather name="refresh-cw" size={18} color={COLORS.onPrimary} />
                  )}
                </Pressable>
              </View>
            ) : null}

            {profile?.biography ? (
              <View style={styles.sectionCard}>
                <SectionHeading eyebrow="À PROPOS" title="Son parcours" icon="book-open" />
                <Text style={styles.biography} selectable>
                  {profile.biography}
                </Text>
              </View>
            ) : null}

            {profile ? (
              <View style={styles.filmographySection}>
                <SectionHeading
                  eyebrow="FILMOGRAPHIE"
                  title={
                    profile.filmography.length +
                    ' œuvre' +
                    (profile.filmography.length > 1 ? 's' : '')
                  }
                  icon="play-circle"
                />

                <View style={styles.filterTabs}>
                  {FILTERS.map((item) => {
                    const active = item.value === filter;
                    return (
                      <Pressable
                        key={item.value}
                        onPress={() => setFilter(item.value)}
                        style={({ pressed }) => [
                          styles.filterTab,
                          active && styles.filterTabActive,
                          pressed && styles.controlPressed,
                        ]}
                        accessibilityRole="tab"
                        accessibilityLabel={'Filtrer la filmographie : ' + item.label}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.filterText, active && styles.filterTextActive]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {openError ? (
                  <Text
                    style={styles.openError}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    {openError}
                  </Text>
                ) : null}

                {filmography.length > 0 ? (
                  <View style={styles.filmographyList}>
                    {filmography.map((item) => {
                      const itemKey = item.mediaType + '-' + item.tmdbId;
                      const itemPoster = tmdbImage(item.posterPath, 'w185');
                      const meta = [
                        item.year,
                        item.mediaType === 'show' ? 'Série' : 'Film',
                        item.mediaType === 'show' && item.episodeCount
                          ? item.episodeCount +
                            ' épisode' +
                            (item.episodeCount > 1 ? 's' : '')
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');

                      return (
                        <Pressable
                          key={itemKey}
                          style={({ pressed }) => [
                            styles.filmographyRow,
                            pressed && styles.rowPressed,
                            !!openingId && openingId !== itemKey && styles.controlDisabled,
                          ]}
                          onPress={() => openFilmo(item)}
                          disabled={!!openingId}
                          accessibilityRole="button"
                          accessibilityLabel={[
                            item.title,
                            item.character ? 'rôle ' + item.character : null,
                            meta,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                          accessibilityHint="Ouvre la fiche de cette œuvre"
                          accessibilityState={{
                            disabled: !!openingId,
                            busy: openingId === itemKey,
                          }}
                        >
                          {itemPoster ? (
                            <Image
                              source={{ uri: itemPoster }}
                              style={styles.filmographyPoster}
                              resizeMode="cover"
                              accessible={false}
                            />
                          ) : (
                            <View style={styles.filmographyPosterEmpty} accessible={false}>
                              <Feather
                                name={item.mediaType === 'movie' ? 'film' : 'tv'}
                                size={22}
                                color={COLORS.textSoft}
                              />
                            </View>
                          )}

                          <View style={styles.filmographyCopy}>
                            <Text style={styles.filmographyName} numberOfLines={2}>
                              {item.title}
                            </Text>
                            {item.character ? (
                              <Text style={styles.filmographyRole} numberOfLines={2}>
                                {item.character}
                              </Text>
                            ) : null}
                            <Text style={styles.filmographyMeta}>{meta}</Text>
                            {typeof item.rating === 'number' && item.rating > 0 ? (
                              <Stars rating10={item.rating} />
                            ) : null}
                            {item.genres.length > 0 ? (
                              <Text style={styles.filmographyGenres} numberOfLines={2}>
                                {item.genres.join(' · ')}
                              </Text>
                            ) : null}
                          </View>

                          <View style={styles.rowAction} accessible={false}>
                            {openingId === itemKey ? (
                              <ActivityIndicator color={COLORS.primary} size="small" />
                            ) : (
                              <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.filmographyEmpty}>
                    <Feather name="film" size={24} color={COLORS.primary} />
                    <Text style={styles.filmographyEmptyTitle}>Aucune œuvre dans ce filtre</Text>
                    <Text style={styles.filmographyEmptyText}>
                      Essaie une autre catégorie pour parcourir la filmographie.
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </FadeSwitch>
    </View>
  );
}

function PersonTopBar({
  insetTop,
  index,
  total,
  onPrevious,
  onNext,
}: {
  insetTop: number;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const hasPrevious = total > 0 && index > 0;
  const hasNext = total > 0 && index < total - 1;

  return (
    <View style={[styles.topBar, { paddingTop: insetTop }]}>
      <View style={styles.topBarCanvas}>
        <View style={styles.topBarGroup}>
          <HeaderButton
            icon="chevron-left"
            label="Personne précédente"
            onPress={onPrevious}
            disabled={!hasPrevious}
          />
          <HeaderButton
            icon="chevron-right"
            label="Personne suivante"
            onPress={onNext}
            disabled={!hasNext}
          />
          {total > 0 ? (
            <Text
              style={styles.topBarCount}
              accessibilityLabel={'Personne ' + (index + 1) + ' sur ' + total}
            >
              {index + 1}/{total}
            </Text>
          ) : null}
        </View>

        <HeaderButton
          icon="x"
          label="Fermer la fiche personne"
          onPress={() => goBack('/')}
        />
      </View>
    </View>
  );
}

function HeaderButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.headerButton,
        pressed && styles.controlPressed,
        disabled && styles.headerButtonDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Feather
        name={icon}
        size={22}
        color={disabled ? COLORS.textSoft : COLORS.text}
      />
    </Pressable>
  );
}

function SocialLink({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.socialLink, pressed && styles.controlPressed]}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      <Feather name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.socialLinkText}>{label}</Text>
      <Feather name="external-link" size={14} color={COLORS.textMuted} />
    </Pressable>
  );
}

function SectionHeading({
  eyebrow,
  title,
  icon,
}: {
  eyebrow: string;
  title: string;
  icon: React.ComponentProps<typeof Feather>['name'];
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionIcon} accessible={false}>
        <Feather name={icon} size={19} color={COLORS.primary} />
      </View>
      <View style={styles.sectionHeadingCopy}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  canvas: {
    width: '100%',
    maxWidth: SIZES.contentMax,
    alignSelf: 'center',
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.lg,
    gap: SPACE.lg,
  },
  topBar: {
    zIndex: 5,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  topBarCanvas: {
    width: '100%',
    maxWidth: SIZES.contentMax,
    minHeight: SIZES.header,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.sm,
  },
  topBarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xxs,
  },
  headerButton: {
    width: SIZES.touch,
    height: SIZES.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.surfaceMuted,
  },
  headerButtonDisabled: {
    opacity: 0.42,
  },
  topBarCount: {
    minWidth: 38,
    marginLeft: SPACE.xxs,
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateCanvas: {
    width: '100%',
    maxWidth: SIZES.contentMax,
    alignSelf: 'center',
    paddingTop: SPACE.md,
  },
  heroCard: {
    alignItems: 'center',
    padding: SPACE.md,
    gap: SPACE.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.sheet,
    backgroundColor: COLORS.surface,
    ...SHADOW.card,
  },
  heroCardWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: SPACE.lg,
  },
  photoCard: {
    position: 'relative',
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.imagePlaceholder,
  },
  photoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  castBadge: {
    position: 'absolute',
    right: SPACE.sm,
    bottom: SPACE.sm,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(20, 13, 39, 0.78)',
  },
  castBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONTS.extraBold,
  },
  identity: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
  },
  identityWide: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: SPACE.md,
  },
  eyebrow: {
    marginBottom: SPACE.xs,
    color: COLORS.primary,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: FONTS.extraBold,
    letterSpacing: 1.2,
  },
  name: {
    color: COLORS.text,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: FONTS.extraBold,
  },
  character: {
    marginTop: SPACE.xs,
    marginBottom: SPACE.lg,
    color: COLORS.textMuted,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.semiBold,
  },
  infoRow: {
    width: '100%',
    minHeight: SIZES.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.xxs,
  },
  infoIcon: {
    width: 34,
    height: 34,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: COLORS.primarySoft,
  },
  infoText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.medium,
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.xs,
    marginTop: SPACE.md,
  },
  socialLink: {
    minHeight: SIZES.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: SPACE.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
  },
  socialLinkText: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: FONTS.bold,
  },
  loadingCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  inlineError: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
  },
  inlineErrorIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: COLORS.surfaceMuted,
  },
  inlineErrorCopy: {
    flex: 1,
  },
  inlineErrorTitle: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONTS.extraBold,
  },
  inlineErrorText: {
    marginTop: 2,
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.regular,
  },
  retryButton: {
    width: SIZES.touch,
    height: SIZES.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.primary,
  },
  sectionCard: {
    padding: SPACE.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    ...SHADOW.card,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  sectionIcon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.primarySoft,
  },
  sectionHeadingCopy: {
    flex: 1,
  },
  sectionEyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONTS.extraBold,
    letterSpacing: 1,
  },
  sectionTitle: {
    marginTop: 1,
    color: COLORS.text,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: FONTS.extraBold,
  },
  biography: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: FONTS.regular,
  },
  filmographySection: {
    padding: SPACE.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    ...SHADOW.card,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: SPACE.xs,
    marginBottom: SPACE.md,
    padding: SPACE.xxs,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.surfaceMuted,
  },
  filterTab: {
    minHeight: SIZES.touch,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xs,
    borderRadius: RADIUS.small,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.bold,
  },
  filterTextActive: {
    color: COLORS.onPrimary,
  },
  openError: {
    marginBottom: SPACE.sm,
    padding: SPACE.sm,
    color: COLORS.danger,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.semiBold,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.surfaceMuted,
  },
  filmographyList: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
  },
  filmographyRow: {
    minHeight: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  rowPressed: {
    backgroundColor: COLORS.surfaceMuted,
  },
  filmographyPoster: {
    width: 74,
    height: 111,
    flexShrink: 0,
    borderRadius: RADIUS.small,
    backgroundColor: COLORS.imagePlaceholder,
  },
  filmographyPosterEmpty: {
    width: 74,
    height: 111,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.small,
    backgroundColor: COLORS.imagePlaceholder,
  },
  filmographyCopy: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 0,
  },
  filmographyName: {
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: FONTS.extraBold,
  },
  filmographyRole: {
    marginTop: 2,
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.bold,
  },
  filmographyMeta: {
    marginTop: SPACE.xxs,
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: FONTS.medium,
  },
  filmographyGenres: {
    marginTop: SPACE.xxs,
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONTS.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  rowAction: {
    width: 30,
    minHeight: SIZES.touch,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filmographyEmpty: {
    alignItems: 'center',
    paddingVertical: SPACE.xl,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surfaceMuted,
  },
  filmographyEmptyTitle: {
    marginTop: SPACE.sm,
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.extraBold,
    textAlign: 'center',
  },
  filmographyEmptyText: {
    maxWidth: 360,
    marginTop: SPACE.xxs,
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  controlPressed: {
    opacity: 0.72,
  },
  controlDisabled: {
    opacity: 0.48,
  },
});
