import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import type { EpisodeDto } from '@/lib/types';
import { COLORS, FONTS } from '@/lib/theme';
import { PopIn } from '@/components/anim';

// Mini pop-up « Cocher aussi les épisodes précédents ? » (règle produit) :
// quand l'utilisateur coche un épisode alors que des épisodes ANTÉRIEURS
// diffusés ne sont pas vus, on lui propose de les cocher aussi. C'est le seul
// cas où des épisodes se cochent sans geste direct — et seulement après OUI.

type EpisodeRef = Pick<EpisodeDto, 'id' | 'seasonNumber' | 'episodeNumber' | 'watched' | 'airDate'>;

const aired = (e: EpisodeRef) => !e.airDate || new Date(e.airDate).getTime() <= Date.now();

// Y a-t-il des épisodes réguliers diffusés NON VUS avant `ep` ? (spéciaux exclus)
export function hasUnwatchedPrevious(
  seasons: { seasonNumber: number; episodes: EpisodeRef[] }[],
  ep: EpisodeRef,
): boolean {
  if (ep.seasonNumber <= 0) return false;
  return seasons.some(
    (s) =>
      s.seasonNumber > 0 &&
      s.episodes.some(
        (e) =>
          !e.watched &&
          e.id !== ep.id &&
          aired(e) &&
          (e.seasonNumber < ep.seasonNumber ||
            (e.seasonNumber === ep.seasonNumber && e.episodeNumber < ep.episodeNumber)),
      ),
  );
}

export function MarkPreviousPopup({
  visible,
  onYes,
  onNo,
}: {
  visible: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onNo}>
      <Pressable style={styles.overlay} onPress={onNo}>
        <PopIn style={styles.card}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Text style={styles.message}>
              Souhaitez-vous aussi marquer tous les épisodes précédents comme vus ?
            </Text>
            <View style={styles.buttons}>
              <Pressable style={styles.noBtn} onPress={onNo}>
                <Text style={styles.noText}>NON</Text>
              </Pressable>
              <Pressable style={styles.yesBtn} onPress={onYes}>
                <Text style={styles.yesText}>OUI</Text>
              </Pressable>
            </View>
          </Pressable>
        </PopIn>
      </Pressable>
    </Modal>
  );
}

// Cotes alignées sur nos feuilles (boutons pilule 13 extrabold, carte radius 14).
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 20, width: '100%', maxWidth: 380 },
  message: { color: COLORS.text, fontSize: 16, fontFamily: FONTS.semiBold, lineHeight: 23, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 18 },
  noBtn: { flex: 1, borderWidth: 1.5, borderColor: COLORS.black, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  noText: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.extraBold, letterSpacing: 0.5 },
  yesBtn: { flex: 1, backgroundColor: COLORS.yellow, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  yesText: { color: COLORS.onAccent, fontSize: 13, fontFamily: FONTS.extraBold, letterSpacing: 0.5 },
});
