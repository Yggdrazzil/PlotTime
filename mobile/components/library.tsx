import React, { createContext, useContext } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tmdbImage } from '@/lib/api';
import type { MediaDto } from '@/lib/types';
import {
  COLORS,
  FONTS,
  RADIUS,
  SHADOW,
  SIZES,
  SPACE,
  STATUS_BAR,
  YELLOW_TRACK,
} from '@/lib/theme';
import { AnimatedFill, PressableScale } from '@/components/anim';

// Progression d'une série basée sur les épisodes DIFFUSÉS (fournie par l'API).
export type LibraryShow = MediaDto & {
  progress: { watched: number; total: number };
  addedAt: string;
  lastWatchedAt: string | null;
};

const GAP = SPACE.sm;
const SIDE = SPACE.md;

// DragGrid consomme encore ces cotes synchrones. On conserve donc son contrat
// historique à trois colonnes, mais on le borne pour qu'il reste lisible sur le
// web. Les grilles de consultation utilisent, elles, les métriques adaptatives
// fournies par GridCellWidthContext.
export const COLS = 3;
export const GRID_GAP = GAP;
export const GRID_SIDE = SIDE;
export const DRAG_GRID_MAX_WIDTH = 560;
const initialDragWidth = Math.min(Dimensions.get('window').width, DRAG_GRID_MAX_WIDTH);
export const CELL_W = Math.max(72, (initialDragWidth - SIDE * 2 - GAP * (COLS - 1)) / COLS);

const GridCellWidthContext = createContext(CELL_W);

// En-tête Prisme partagé : retour, hiérarchie claire et action optionnelle.
export function LibHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + SPACE.sm }]}>
      <View style={styles.headerCanvas}>
        <Pressable
          onPress={() => goBack('/profile')}
          style={({ pressed }) => [styles.headerSide, pressed && styles.controlPressed]}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          accessibilityHint="Revient au profil"
        >
          <Feather name="chevron-left" size={24} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Ma collection</Text>
          <Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={styles.headerSide}>{right}</View>
      </View>
    </View>
  );
}

// Repère de section visible dans le flux et annoncé comme titre.
export function SectionPill({ label }: { label: string }) {
  return (
    <View style={styles.pillWrap}>
      <View style={styles.pillAccent} />
      <Text accessibilityRole="header" style={styles.pill}>{label}</Text>
    </View>
  );
}

// Grille adaptative : 3 colonnes sur téléphone, 4 sur tablette étroite et 5
// sur grand écran. La largeur reste bornée au canevas Prisme partagé.
export function Grid({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const canvasWidth = Math.min(width, SIZES.contentMax);
  const availableWidth = Math.max(216, canvasWidth - SIDE * 2);
  const columns = availableWidth >= 640 ? 5 : availableWidth >= 480 ? 4 : 3;
  const cellWidth = Math.max(64, (availableWidth - GAP * (columns - 1)) / columns);

  return (
    <GridCellWidthContext.Provider value={cellWidth}>
      <View style={styles.grid}>{children}</View>
    </GridCellWidthContext.Provider>
  );
}

// Cellule générique pour les contenus qui utilisent la même grille sans passer
// par ShowCell/MovieCell (par exemple les jeux favoris).
export function LibraryGridCell({ children }: { children: React.ReactNode }) {
  const width = useContext(GridCellWidthContext);
  return <View style={{ width }}>{children}</View>;
}

function statusLabel(kind: keyof typeof STATUS_BAR) {
  if (kind === 'stopped') return 'Arrêtée';
  if (kind === 'completed') return 'Terminée';
  if (kind === 'watchlist') return 'À voir plus tard';
  if (kind === 'upToDate') return 'À jour';
  return 'En cours';
}

// Affiche d'une série avec progression sur les épisodes diffusés et code
// couleur de statut inchangé.
export function ShowCell({ show, bar = true }: { show: LibraryShow; bar?: boolean }) {
  const router = useRouter();
  const width = useContext(GridCellWidthContext);
  const uri = tmdbImage(show.posterPath);
  const { watched, total } = show.progress ?? { watched: 0, total: 0 };
  const started = watched > 0;
  const done = total > 0 && watched >= total;
  const kind: keyof typeof STATUS_BAR =
    show.userStatus === 'abandoned' ? 'stopped'
      : show.userStatus === 'completed' ? 'completed'
        : show.userStatus === 'watchlist' ? 'watchlist'
          : done ? 'upToDate' : 'watching';
  const pct = kind === 'completed' ? 100 : total > 0 ? Math.min(100, (watched / total) * 100) : 0;
  const showBar = bar && (kind === 'completed' || started);
  const progressCopy = total > 0
    ? `${watched} épisode${watched === 1 ? '' : 's'} sur ${total}`
    : 'Progression indisponible';

  return (
    <PressableScale
      style={[styles.cell, { width }]}
      onPress={() => router.push(`/show/${show.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${show.title}, ${statusLabel(kind)}, ${progressCopy}`}
      accessibilityHint="Ouvre la fiche de la série"
    >
      <View style={styles.posterFrame}>
        <View style={styles.posterBox}>
          {uri ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.posterEmpty}>
              <Feather name="tv" size={24} color={COLORS.primary} />
              <Text style={styles.posterTitle} numberOfLines={3}>
                {show.title}
              </Text>
            </View>
          )}
          {showBar ? (
            <View style={[styles.barTrack, { backgroundColor: STATUS_BAR[kind].track }]}>
              <AnimatedFill pct={pct} color={STATUS_BAR[kind].fill} style={styles.barFill} />
            </View>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

// Affiche d'un film (pas de barre de progression).
export function MovieCell({ movie }: { movie: MediaDto }) {
  const router = useRouter();
  const width = useContext(GridCellWidthContext);
  const uri = tmdbImage(movie.posterPath);
  return (
    <PressableScale
      style={[styles.cell, { width }]}
      onPress={() => router.push(`/show/${movie.id}?type=movie`)}
      accessibilityRole="button"
      accessibilityLabel={movie.title}
      accessibilityHint="Ouvre la fiche du film"
    >
      <View style={styles.posterFrame}>
        <View style={styles.posterBox}>
          {uri ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.posterEmpty}>
              <Feather name="film" size={24} color={COLORS.primary} />
              <Text style={styles.posterTitle} numberOfLines={3}>
                {movie.title}
              </Text>
            </View>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  headerCanvas: {
    width: '100%',
    maxWidth: SIZES.contentMax,
    minHeight: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
  },
  headerSide: {
    width: SIZES.touch,
    height: SIZES.touch,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.control,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONTS.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 26,
    lineHeight: 32,
    fontFamily: FONTS.extraBold,
    letterSpacing: -0.4,
  },
  controlPressed: { backgroundColor: COLORS.primarySoft, transform: [{ scale: 0.96 }] },
  pillWrap: {
    width: '100%',
    maxWidth: SIZES.contentMax,
    minHeight: SIZES.touch,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SIDE,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.xs,
  },
  pillAccent: {
    width: 5,
    height: 20,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.secondary,
  },
  pill: {
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.extraBold,
  },
  grid: {
    width: '100%',
    maxWidth: SIZES.contentMax,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SIDE,
    paddingBottom: SPACE.sm,
    gap: GAP,
  },
  cell: { borderRadius: RADIUS.poster },
  posterFrame: {
    borderRadius: RADIUS.poster,
    backgroundColor: COLORS.surface,
    ...SHADOW.card,
  },
  posterBox: {
    width: '100%',
    aspectRatio: 2 / 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.poster,
    backgroundColor: COLORS.imagePlaceholder,
  },
  posterEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xs,
    gap: SPACE.xs,
    backgroundColor: COLORS.primarySoft,
  },
  posterTitle: {
    color: COLORS.text,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  barTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, backgroundColor: YELLOW_TRACK },
  barFill: { position: 'absolute', left: 0, bottom: 0, top: 0 },
});
