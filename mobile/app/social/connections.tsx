import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tmdbImage } from '@/lib/api';
import { COLORS, FONTS, RADIUS, SHADOW, SIZES, SPACE } from '@/lib/theme';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, Loading, LoadError } from '@/components/ui';
import { AppearItem, PressableScale } from '@/components/anim';

type PublicUser = { id: string; displayName: string; avatarUrl: string | null; isFollowing?: boolean };

export default function ConnectionsScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const followers = type === 'followers';
  const path = followers ? '/api/social/followers' : '/api/social/following';
  const router = useRouter();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['social', 'connections', followers ? 'followers' : 'following'],
    queryFn: () => api.get<{ users: PublicUser[] }>(path),
  });

  const toggle = async (user: PublicUser) => {
    if (busyId) return;
    const currentlyFollowing = overrides[user.id] ?? user.isFollowing ?? false;
    setBusyId(user.id);
    setActionError(null);
    setOverrides((current) => ({ ...current, [user.id]: !currentlyFollowing }));
    try {
      if (currentlyFollowing) await api.del('/api/social/follow/' + user.id);
      else await api.post('/api/social/follow/' + user.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['social'] }),
        qc.invalidateQueries({ queryKey: ['profile'] }),
        qc.invalidateQueries({ queryKey: ['user', user.id] }),
      ]);
    } catch {
      setOverrides((current) => ({ ...current, [user.id]: currentlyFollowing }));
      setActionError("L'action n'a pas pu être enregistrée. Réessaie.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <PageHeader title={followers ? 'Abonnés' : 'Abonnements'} />
      <View style={styles.canvas}>
        {isLoading ? (
          <Loading />
        ) : isError && !data ? (
          <LoadError onRetry={refetch} busy={isRefetching} />
        ) : (
          <FlatList
            data={data?.users ?? []}
            keyExtractor={(user) => user.id}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} />}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.intro}>
                <View style={styles.eyebrow}>
                  <Feather name={followers ? 'users' : 'user-check'} size={14} color={COLORS.primary} />
                  <Text style={styles.eyebrowText}>{followers ? 'TA COMMUNAUTÉ' : 'TON RÉSEAU'}</Text>
                </View>
                <Text style={styles.introTitle}>{followers ? 'Les personnes qui te suivent' : 'Les personnes que tu suis'}</Text>
                <Text style={styles.introBody}>
                  {data?.users.length ?? 0} {followers ? 'abonné' : 'abonnement'}
                  {(data?.users.length ?? 0) > 1 ? 's' : ''}
                </Text>
                {actionError ? (
                  <View style={styles.errorBanner} accessibilityRole="alert">
                    <Feather name="alert-circle" size={16} color={COLORS.danger} />
                    <Text style={styles.errorText}>{actionError}</Text>
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <EmptyState
                title={followers ? 'Aucun abonné' : 'Aucun abonnement'}
                message={followers ? "Personne ne te suit pour l'instant." : "Tu ne suis personne pour l'instant."}
              />
            }
            renderItem={({ item: user, index }) => {
              const following = overrides[user.id] ?? user.isFollowing ?? false;
              const avatar = user.avatarUrl ? tmdbImage(user.avatarUrl, 'w185') ?? user.avatarUrl : null;
              const itemBusy = busyId === user.id;
              return (
                <AppearItem index={index}>
                  <View style={styles.card}>
                    <PressableScale
                      style={styles.person}
                      onPress={() => router.push(('/user/' + user.id) as Href)}
                      accessibilityRole="button"
                      accessibilityLabel={'Ouvrir le profil de ' + user.displayName}
                    >
                      <View style={styles.avatar}>
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : (
                          <Text style={styles.avatarInitial}>{user.displayName.slice(0, 1).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={styles.personCopy}>
                        <Text style={styles.name} numberOfLines={1}>{user.displayName}</Text>
                        <Text style={styles.profileHint}>Voir le profil</Text>
                      </View>
                    </PressableScale>
                    <Pressable
                      style={({ pressed }) => [
                        styles.followButton,
                        following && styles.followButtonActive,
                        pressed && styles.pressed,
                        busyId !== null && !itemBusy && styles.disabled,
                      ]}
                      onPress={() => toggle(user)}
                      disabled={busyId !== null}
                      accessibilityRole="button"
                      accessibilityLabel={(following ? 'Ne plus suivre ' : 'Suivre ') + user.displayName}
                      accessibilityState={{ disabled: busyId !== null, busy: itemBusy }}
                    >
                      {itemBusy ? (
                        <ActivityIndicator size="small" color={following ? COLORS.primary : COLORS.onPrimary} />
                      ) : (
                        <>
                          <Feather name={following ? 'check' : 'plus'} size={16} color={following ? COLORS.primary : COLORS.onPrimary} />
                          <Text style={[styles.followText, following && styles.followTextActive]}>
                            {following ? 'ABONNÉ' : 'SUIVRE'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
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
  introBody: { marginTop: SPACE.xs, color: COLORS.textMuted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    marginTop: SPACE.md,
    padding: SPACE.sm,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.control,
  },
  errorText: { flex: 1, color: COLORS.danger, fontSize: 13, lineHeight: 18, fontFamily: FONTS.bold },
  card: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    padding: SPACE.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
  },
  person: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  avatar: {
    width: 52,
    height: 52,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
    borderRadius: 26,
  },
  avatarInitial: { color: COLORS.primary, fontSize: 20, fontFamily: FONTS.extraBold },
  personCopy: { minWidth: 0, flex: 1 },
  name: { color: COLORS.text, fontSize: 16, lineHeight: 21, fontFamily: FONTS.extraBold },
  profileHint: { marginTop: 2, color: COLORS.textMuted, fontSize: 12, lineHeight: 16, fontFamily: FONTS.regular },
  followButton: {
    minWidth: 104,
    minHeight: SIZES.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACE.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
  },
  followButtonActive: { backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: COLORS.primary },
  followText: { color: COLORS.onPrimary, fontSize: 12, fontFamily: FONTS.extraBold, letterSpacing: 0.5 },
  followTextActive: { color: COLORS.primary },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
});
