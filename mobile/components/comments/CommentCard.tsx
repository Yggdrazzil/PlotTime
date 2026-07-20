import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Image, ActivityIndicator } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS, SHADOW, SIZES, SPACE } from '@/lib/theme';
import { api, tmdbImage } from '@/lib/api';
import { PopIn } from '@/components/anim';
import { ReportModal } from '@/components/ReportModal';
import type { CommentDto } from './types';
import { dateFr } from './types';

function UserAvatar({
  user,
  size = 44,
  onPress,
}: {
  user: CommentDto['user'];
  size?: number;
  onPress: () => void;
}) {
  const uri = user.avatarUrl ? tmdbImage(user.avatarUrl, 'w185') ?? user.avatarUrl : null;
  return (
    <Pressable
      style={({ pressed }) => [styles.avatarTarget, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir le profil de ${user.displayName}`}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
          resizeMode="cover"
          accessible={false}
        />
      ) : (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} accessible={false}>
          <Text style={[styles.avatarInit, size < 40 && styles.avatarInitSmall]}>
            {user.displayName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// Carte de discussion PlotTime : avatar, nom, date, corps, cœur ❤️,
// réponses, partager, fil de réponses + composeur inline. Partagée par la
// page plein écran (mobile/app/comments/[id].tsx) et le bottom sheet TikTok.
// Les commentaires DES AUTRES portent une action « Signaler » (drapeau,
// exigence stores UGC) — les siens gardent « Supprimer ».
export function CommentCard(props: {
  comment: CommentDto;
  onHeart: (c: CommentDto) => void;
  onRemove: (c: CommentDto) => void;
  onShare: (c: CommentDto) => void;
  replyOpen: boolean;
  onToggleReplies: () => void;
  isReplying: boolean;
  replyText: string;
  setReplyText: (s: string) => void;
  onPostReply: () => Promise<boolean>;
  onOpenUser: (userId: string) => void;
}) {
  const { comment: c, onHeart, onRemove, onShare, replyOpen, onToggleReplies, isReplying, replyText, setReplyText, onPostReply, onOpenUser } = props;

  // Signalement d'un commentaire d'autrui : modal de confirmation partagé
  // (ReportModal), POST /api/report, puis feedback local « Signalé ✓ » sur la
  // rangée (le serveur dédoublonne côté back, pas de toast global ici).
  const [reportTarget, setReportTarget] = useState<CommentDto | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [replyBusy, setReplyBusy] = useState(false);
  const confirmReport = async () => {
    const target = reportTarget;
    setReportTarget(null);
    if (!target) return;
    try {
      await api.post('/api/report', {
        commentId: target.id,
        mediaType: 'comment',
        title: target.body.slice(0, 80),
        reason: 'abuse',
      });
      setReportedIds((ids) => new Set(ids).add(target.id));
    } catch {
      Alert.alert(
        'Signalement impossible',
        'Le commentaire n’a pas pu être signalé. Vérifie ta connexion puis réessaie.',
      );
    }
  };
  const submitReply = async () => {
    if (!replyText.trim() || replyBusy) return;
    setReplyBusy(true);
    try {
      await onPostReply();
    } finally {
      setReplyBusy(false);
    }
  };

  const reportAction = (target: CommentDto, size: number) =>
    reportedIds.has(target.id) ? (
      <Text style={styles.reported} accessibilityRole="text">Signalé ✓</Text>
    ) : (
      <Pressable
        style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
        onPress={() => setReportTarget(target)}
        accessibilityRole="button"
        accessibilityLabel="Signaler ce commentaire"
      >
        <Feather name="flag" size={size} color={COLORS.textMuted} />
      </Pressable>
    );

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <UserAvatar user={c.user} onPress={() => onOpenUser(c.user.id)} />
        <View style={styles.authorCopy}>
          <Text style={styles.name}>{c.user.displayName}</Text>
          <Text style={styles.date}>{dateFr(c.createdAt)}</Text>
        </View>
        {c.isMine ? (
          <Pressable
            style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
            onPress={() => onRemove(c)}
            accessibilityRole="button"
            accessibilityLabel="Supprimer ce commentaire"
          >
            <Feather name="trash-2" size={18} color={COLORS.danger} />
          </Pressable>
        ) : (
          reportAction(c, 18)
        )}
      </View>
      <Text style={styles.body}>{c.body}</Text>
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.footBtn, pressed && styles.pressed]}
          onPress={() => onHeart(c)}
          accessibilityRole="button"
          accessibilityLabel={c.reactions.mine.includes('❤️') ? "Retirer le j'aime" : "J'aime"}
          accessibilityState={{ selected: c.reactions.mine.includes('❤️') }}
        >
          {c.reactions.mine.includes('❤️') ? (
            <PopIn><Ionicons name="heart" size={22} color={COLORS.red} /></PopIn>
          ) : (
            <Ionicons name="heart-outline" size={22} color={COLORS.text} />
          )}
          {c.reactions.total > 0 ? <Text style={styles.footCount}>{c.reactions.total}</Text> : null}
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.footBtn, pressed && styles.pressed]}
          onPress={onToggleReplies}
          accessibilityRole="button"
          accessibilityLabel={replyOpen ? 'Masquer les réponses' : 'Afficher les réponses et répondre'}
          accessibilityState={{ expanded: replyOpen }}
        >
          <Feather name="message-circle" size={21} color={COLORS.primary} />
          {(c.replies?.length ?? 0) > 0 ? <Text style={styles.footCount}>{c.replies!.length}</Text> : null}
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
          onPress={() => onShare(c)}
          accessibilityRole="button"
          accessibilityLabel="Partager ce commentaire"
        >
          <Feather name="share-2" size={19} color={COLORS.text} />
        </Pressable>
      </View>
      {replyOpen ? (
        <View style={styles.replies}>
          {c.replies?.map((r) => (
            <View key={r.id} style={styles.replyRow}>
              <UserAvatar user={r.user} size={36} onPress={() => onOpenUser(r.user.id)} />
              <View style={styles.replyCopy}>
                <Text style={styles.replyName}>{r.user.displayName} <Text style={styles.date}>· {dateFr(r.createdAt)}</Text></Text>
                <Text style={styles.replyBody}>{r.body}</Text>
              </View>
              {r.isMine ? (
                <Pressable
                  style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
                  onPress={() => onRemove(r)}
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer cette réponse"
                >
                  <Feather name="trash-2" size={16} color={COLORS.danger} />
                </Pressable>
              ) : (
                reportAction(r, 15)
              )}
            </View>
          ))}
          {isReplying ? (
            <View style={styles.replyComposer}>
              <TextInput
                style={styles.replyInput}
                placeholder="Votre réponse…"
                placeholderTextColor={COLORS.textMuted}
                value={replyText}
                onChangeText={setReplyText}
                multiline
                maxLength={2000}
                accessibilityLabel="Votre réponse"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.replySend,
                  (!replyText.trim() || replyBusy) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => void submitReply()}
                disabled={!replyText.trim() || replyBusy}
                accessibilityRole="button"
                accessibilityLabel="Publier la réponse"
                accessibilityState={{ disabled: !replyText.trim() || replyBusy, busy: replyBusy }}
              >
                {replyBusy ? (
                  <ActivityIndicator size="small" color={COLORS.onPrimary} />
                ) : (
                  <Feather name="send" size={17} color={COLORS.onPrimary} />
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Confirmation de signalement (exigence stores : UGC signalable). */}
      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        onConfirm={confirmReport}
        title="Signaler ce commentaire"
        body="Contenu haineux ou inapproprié ? Notre équipe vérifiera."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '94%',
    maxWidth: SIZES.contentMax,
    alignSelf: 'center',
    marginVertical: SPACE.xs,
    padding: SPACE.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.card,
    ...SHADOW.card,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  authorCopy: { flex: 1, minWidth: 0 },
  avatarTarget: {
    width: SIZES.touch,
    height: SIZES.touch,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: COLORS.primary,
  },
  avatarInit: {
    color: COLORS.onPrimary,
    fontSize: 17,
    fontFamily: FONTS.extraBold,
  },
  avatarInitSmall: { fontSize: 13 },
  name: {
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: FONTS.extraBold,
  },
  date: {
    marginTop: 1,
    color: COLORS.textMuted,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: FONTS.regular,
  },
  iconAction: {
    width: SIZES.touch,
    height: SIZES.touch,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.control,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  reported: {
    minHeight: SIZES.touch,
    textAlignVertical: 'center',
    color: COLORS.success,
    fontSize: 12,
    lineHeight: SIZES.touch,
    fontFamily: FONTS.bold,
  },
  body: {
    marginTop: SPACE.sm,
    color: COLORS.text,
    fontFamily: FONTS.regular,
    fontSize: 15.5,
    lineHeight: 23,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    marginTop: SPACE.md,
    paddingTop: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },
  footBtn: {
    minHeight: SIZES.touch,
    minWidth: SIZES.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.control,
  },
  footCount: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: FONTS.bold,
  },
  replies: {
    gap: SPACE.sm,
    marginTop: SPACE.sm,
    padding: SPACE.sm,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.control,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.xs,
  },
  replyCopy: { flex: 1, minWidth: 0, paddingTop: 3 },
  replyName: {
    color: COLORS.text,
    fontSize: 13.5,
    lineHeight: 18,
    fontFamily: FONTS.extraBold,
  },
  replyBody: {
    marginTop: 3,
    color: COLORS.text,
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    lineHeight: 20,
  },
  replyComposer: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.xs,
    marginTop: SPACE.xs,
    padding: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.control,
  },
  replyInput: {
    minHeight: SIZES.touch,
    maxHeight: 120,
    flex: 1,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 10,
    color: COLORS.text,
    fontFamily: FONTS.regular,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  replySend: {
    width: SIZES.touch,
    height: SIZES.touch,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.control,
  },
  disabled: { opacity: 0.4 },
});
