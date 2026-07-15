export type FeedItem = {
  id: string | null;
  tmdbId: string | null;
  tvdbId: string | null;
  igdbId?: string | null; // présent → c'est un JEU (source IGDB, actions jeux)
  type: 'show' | 'movie' | 'game';
  category?: 'serie' | 'film' | 'anime' | 'jeux';
  title: string;
  year: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  inLibrary: boolean;
  stats?: { likes: number; watched: number; comments: number };
  me?: { liked: boolean; watched: boolean };
  // Note communautaire TMDb (/10) — affichée en pastille ★ sur la carte.
  voteAverage?: number | null;
};

export type FeedCategory = 'tout' | 'serie' | 'film' | 'anime' | 'jeux';

export const FEED_CATEGORIES: { key: FeedCategory; label: string }[] = [
  { key: 'tout', label: 'TOUT' },
  { key: 'serie', label: 'SÉRIES' },
  { key: 'film', label: 'FILMS' },
  { key: 'anime', label: 'ANIMÉS' },
  { key: 'jeux', label: 'JEUX' },
];

export const catOf = (f: FeedItem): FeedCategory =>
  f.category ?? (f.type === 'game' ? 'jeux' : f.type === 'show' ? 'serie' : 'film');
