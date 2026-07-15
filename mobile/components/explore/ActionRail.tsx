import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tmdbImage } from '@/lib/api';
import { COLORS, FONTS } from '@/lib/theme';
import { PopIn } from '@/components/anim';
import { formatCount } from '@/lib/format';
import type { FeedItem } from './types';

export type RailState = {
  liked: boolean;
  watched: boolean;
  likes: number;
  watchedCount: number;
  comments: number;
};

function RailButton({
  icon,
  active,
  activeColor,
  count,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  active?: boolean;
  activeColor?: string;
  count?: number;
  onPress: () => void;
}) {
  const color = active ? activeColor ?? COLORS.yellow : '#fff';
  return (
    <Pressable style={styles.btn} onPress={onPress} hitSlop={8}>
      <PopIn key={String(active)} style={styles.iconWrap}>
        <Feather name={icon} size={30} color={color} />
      </PopIn>
      {count != null ? <Text style={styles.count}>{formatCount(count)}</Text> : null}
    </Pressable>
  );
}

export function ActionRail({
  item,
  state,
  onLike,
  onDislike,
  onWatched,
  onComment,
  onShare,
  onFiche,
}: {
  item: FeedItem;
  state: RailState;
  onLike: () => void;
  onDislike: () => void;
  onWatched: () => void;
  onComment: () => void;
  onShare: () => void;
  onFiche: () => void;
}) {
  const poster = tmdbImage(item.posterPath, 'w185');
  return (
    <View style={styles.rail}>
      <Pressable style={styles.posterBtn} onPress={onFiche} hitSlop={6}>
        {poster ? (
          <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" />
        ) : (
          <View style={[styles.poster, styles.posterEmpty]}>
            <Feather name="film" size={18} color="#fff" />
          </View>
        )}
      </Pressable>
      <RailButton icon="heart" active={state.liked} activeColor={COLORS.yellow} count={state.likes} onPress={onLike} />
      <RailButton icon="thumbs-down" activeColor={COLORS.red} onPress={onDislike} />
      <RailButton icon="eye" active={state.watched} activeColor={COLORS.green} count={state.watchedCount} onPress={onWatched} />
      <RailButton icon="message-circle" count={state.comments} onPress={onComment} />
      <RailButton icon="share-2" onPress={onShare} />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { position: 'absolute', right: 10, bottom: 120, alignItems: 'center', gap: 20 },
  posterBtn: { marginBottom: 4 },
  poster: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#fff', backgroundColor: '#26262e' },
  posterEmpty: { alignItems: 'center', justifyContent: 'center' },
  btn: { alignItems: 'center', gap: 4 },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  count: { color: '#fff', fontFamily: FONTS.bold, fontSize: 12, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});
