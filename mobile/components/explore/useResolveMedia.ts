import { useRef } from 'react';
import { api } from '@/lib/api';
import type { FeedItem } from './types';

export function useResolveMedia(): (item: FeedItem) => Promise<string> {
  // Cache clé (type:tmdbId) → mediaId, stable sur la vie du flux.
  const cache = useRef(new Map<string, string>()).current;
  const inflight = useRef(new Map<string, Promise<string>>()).current;

  return (item: FeedItem) => {
    if (item.id) return Promise.resolve(item.id);
    const isGame = Boolean(item.igdbId);
    const key = isGame ? `game:${item.igdbId}` : `${item.type}:${item.tmdbId}`;
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached);
    const running = inflight.get(key);
    if (running) return running;

    const path = isGame
      ? '/api/games/add-from-igdb'
      : item.type === 'movie'
        ? '/api/movies/add-from-tmdb'
        : '/api/shows/add-from-tmdb';
    const body = isGame ? { igdbId: item.igdbId } : { tmdbId: item.tmdbId, follow: false };
    const p = api
      .post<{ mediaId: string }>(path, body)
      .then((res) => {
        cache.set(key, res.mediaId);
        inflight.delete(key);
        return res.mediaId;
      })
      .catch((e) => {
        inflight.delete(key);
        throw e;
      });
    inflight.set(key, p);
    return p;
  };
}
