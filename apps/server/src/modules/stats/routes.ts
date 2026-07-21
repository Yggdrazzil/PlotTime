import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { requireAuth } from '../auth/routes.js';
import { blockedIdSet } from '../social/blocks.js';
import { EP_FALLBACK_MIN, MOVIE_FALLBACK_MIN } from '../../lib/runtimeFallbacks.js';
import { dayKeyParis, weekStartParis } from '../../lib/parisTime.js';
import { createTtlCache } from '../../lib/ttlCache.js';

// Runtimes de repli centralisés dans lib/runtimeFallbacks.ts (mêmes valeurs et
// même sémantique `runtime > 0` que le profil). Ré-exportés pour les
// consommateurs historiques (défi hebdo de social/routes.ts).
export { EP_FALLBACK_MIN, MOVIE_FALLBACK_MIN };

const DAY = 86_400_000;
const WEEKS = 12;

// Clé de semaine : lundi 00:00 EUROPE/PARIS (jamais l'heure locale du serveur
// — un VPS en UTC décalerait les jours/semaines). Logique partagée avec la
// gamification (lib/parisTime.ts).
function weekStart(d: Date): number {
  return weekStartParis(d).getTime();
}
function dayKey(d: Date): string {
  return dayKeyParis(d);
}
// Libellé "j/m" d'un début de semaine, exprimé en Europe/Paris.
const PARIS_LABEL = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'numeric',
});
function topCounts(items: string[], limit: number): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const name = it.trim();
    if (!name) continue;
    m.set(name, (m.get(name) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
// Genres stockés en chaîne séparée par virgules → on éclate et on compte chaque genre.
function splitGenres(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map((g) => g.trim()).filter(Boolean);
}

// SQLite stocke les DateTime Prisma en millisecondes epoch : une colonne date
// lue via $queryRaw peut revenir en Date, bigint ou number selon le decltype —
// on normalise (Number(Date) vaut déjà les ms epoch).
function rawDate(v: Date | bigint | number): Date {
  return v instanceof Date ? v : new Date(Number(v));
}

// Classement Communauté : l'agrégation la plus lourde du serveur (3 GROUP BY
// sur TOUT l'historique de moi + mes abonnements), rappelée par l'onglet
// Communauté de chaque client. 2 min de cache par utilisateur suffisent — un
// visionnage fraîchement coché apparaît au refresh suivant. Désactivé en test
// (voir lib/ttlCache.ts).
type LeaderboardEntry = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isMe: boolean;
  minutes: number;
};
const leaderboardCache = createTtlCache<{
  series: (LeaderboardEntry & { episodes: number })[];
  movies: (LeaderboardEntry & { movies: number })[];
  games: (LeaderboardEntry & { games: number })[];
}>(120_000);

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Stats détaillées (Bloc 1) : totaux, graphiques hebdo, genres, chaînes,
  // marathons, projection « quand tu rattraperas ». Séries + films.
  app.get('/api/stats/detailed', async (request) => {
    const userId = request.userId;
    const now = new Date();
    const since = new Date(now.getTime() - WEEKS * 7 * DAY);

    // Épisodes vus : SQL brut à PLAT (date + runtime résolu + série) au lieu du
    // findMany avec select imbriqué episode→show→media — sur une bibliothèque à
    // 20k épisodes, l'hydratation de 20k objets Prisma imbriqués dominait le
    // coût de l'endpoint. Le runtime est résolu par le CASE (même sémantique
    // `runtime > 0` que episodeRuntimeMin / le classement) ; les fenêtres
    // Europe/Paris (semaines, marathons par jour) restent calculées en JS via
    // lib/parisTime.ts — SQLite ne connaît pas les fuseaux, un date() UTC
    // décalerait les journées.
    const [watchedEps, showLib, movieLib, watchedMovies, gameLib] = await Promise.all([
      prisma.$queryRaw<{ watchedAt: Date | bigint | number; showId: string; minutes: bigint | number; title: string }[]>`
        SELECT ues.watchedAt AS watchedAt,
               e.showId AS showId,
               CASE WHEN e.runtime > 0 THEN e.runtime
                    WHEN m.runtime > 0 THEN m.runtime
                    ELSE ${EP_FALLBACK_MIN} END AS minutes,
               COALESCE(m.localizedTitle, m.title) AS title
        FROM "UserEpisodeStatus" ues
        JOIN "Episode" e ON e.id = ues.episodeId
        JOIN "Show" s ON s.id = e.showId
        JOIN "Media" m ON m.id = s.mediaId
        WHERE ues.status = 'watched' AND ues.watchedAt IS NOT NULL AND ues.userId = ${userId}`,
      // Bibliothèque séries : genres + chaîne + en production, une seule
      // requête plate (remplace les deux findMany show d'origine).
      prisma.$queryRaw<{ genres: string | null; network: string | null; platform: string | null; inProduction: bigint | number | null }[]>`
        SELECT m.genres AS genres, s.network AS network, s.platform AS platform, s.inProduction AS inProduction
        FROM "UserMediaStatus" ums
        JOIN "Media" m ON m.id = ums.mediaId
        LEFT JOIN "Show" s ON s.mediaId = m.id
        WHERE ums.userId = ${userId} AND m.type = 'show'`,
      // Bibliothèque films : genres.
      prisma.$queryRaw<{ genres: string | null }[]>`
        SELECT m.genres AS genres
        FROM "UserMediaStatus" ums
        JOIN "Media" m ON m.id = ums.mediaId
        WHERE ums.userId = ${userId} AND m.type = 'movie'`,
      // Films vus (date + runtime résolu) pour totaux + hebdo.
      prisma.$queryRaw<{ completedAt: Date | bigint | number | null; lastWatchedAt: Date | bigint | number | null; minutes: bigint | number }[]>`
        SELECT ums.completedAt AS completedAt, ums.lastWatchedAt AS lastWatchedAt,
               CASE WHEN m.runtime > 0 THEN m.runtime ELSE ${MOVIE_FALLBACK_MIN} END AS minutes
        FROM "UserMediaStatus" ums
        JOIN "Media" m ON m.id = ums.mediaId
        WHERE ums.userId = ${userId} AND ums.status = 'completed' AND m.type = 'movie'`,
      // Bibliothèque jeux : statuts, possession, temps déclaré, genres,
      // identité pour le « top par temps de jeu » (onglet Jeux des stats).
      // Reste en Prisma : peu de lignes, beaucoup de champs identitaires.
      prisma.userMediaStatus.findMany({
        where: { userId, media: { type: 'game' }, isHidden: false },
        select: {
          status: true,
          isOwned: true,
          playtimeMinutes: true,
          media: { select: { id: true, title: true, localizedTitle: true, posterPath: true, genres: true } },
        },
      }),
    ]);

    // ===== SÉRIES =====
    const epWeekly = new Map<number, { episodes: number; minutes: number }>();
    const marathonByShow = new Map<string, { title: string; perDay: Map<string, number>; minutes: number }>();
    let epLast7d = 0;
    let showMinutesTotal = 0;
    for (const e of watchedEps) {
      const min = Number(e.minutes);
      showMinutesTotal += min;
      const w = rawDate(e.watchedAt);
      if (now.getTime() - w.getTime() < 7 * DAY) epLast7d += 1;
      if (w >= since) {
        const k = weekStart(w);
        const cur = epWeekly.get(k) ?? { episodes: 0, minutes: 0 };
        cur.episodes += 1;
        cur.minutes += min;
        epWeekly.set(k, cur);
      }
      const m = marathonByShow.get(e.showId) ?? { title: e.title, perDay: new Map(), minutes: 0 };
      const dk = dayKey(w);
      m.perDay.set(dk, (m.perDay.get(dk) ?? 0) + 1);
      m.minutes += min;
      marathonByShow.set(e.showId, m);
    }

    // Marathons : max d'épisodes d'une série vus le même jour.
    const marathons = [...marathonByShow.values()]
      .map((m) => ({ title: m.title, episodes: Math.max(0, ...m.perDay.values()), hours: Math.round(m.minutes / 60) }))
      .sort((a, b) => b.episodes - a.episodes)
      .slice(0, 5);

    const showGenres = topCounts(showLib.flatMap((s) => splitGenres(s.genres)), 6);
    const showNetworks = topCounts(
      showLib.map((r) => r.network ?? r.platform ?? '').filter(Boolean),
      6,
    );
    const showsInProduction = showLib.filter((r) => Number(r.inProduction ?? 0)).length;

    // ===== FILMS =====
    const mvWeekly = new Map<number, { count: number; minutes: number }>();
    let mvLast7d = 0;
    let movieMinutesTotal = 0;
    for (const m of watchedMovies) {
      const min = Number(m.minutes);
      movieMinutesTotal += min;
      const rawW = m.completedAt ?? m.lastWatchedAt;
      const w = rawW == null ? null : rawDate(rawW);
      if (!w) continue;
      if (now.getTime() - w.getTime() < 7 * DAY) mvLast7d += 1;
      if (w >= since) {
        const k = weekStart(w);
        const cur = mvWeekly.get(k) ?? { count: 0, minutes: 0 };
        cur.count += 1;
        cur.minutes += min;
        mvWeekly.set(k, cur);
      }
    }

    // Séries de semaines continues (même vides) pour un graphique régulier.
    // On recule de lundi parisien en lundi parisien (pas de -7×24 h brut : une
    // bascule DST décalerait les clés d'une heure et casserait les buckets).
    const weeks: number[] = [];
    let cursor = weekStartParis(now);
    for (let i = 0; i < WEEKS; i++) {
      weeks.unshift(cursor.getTime());
      cursor = weekStartParis(new Date(cursor.getTime() - DAY));
    }
    const label = (ts: number) => PARIS_LABEL.format(new Date(ts));

    return {
      series: {
        episodesWatched: watchedEps.length,
        episodesLast7d: epLast7d,
        minutes: showMinutesTotal,
        showsAdded: showLib.length,
        showsInProduction,
        weekly: weeks.map((ts) => ({ label: label(ts), episodes: epWeekly.get(ts)?.episodes ?? 0, hours: Math.round((epWeekly.get(ts)?.minutes ?? 0) / 60) })),
        genres: showGenres,
        networks: showNetworks,
        marathons,
      },
      movies: {
        moviesWatched: watchedMovies.length,
        moviesLast7d: mvLast7d,
        minutes: movieMinutesTotal,
        moviesAdded: movieLib.length,
        weekly: weeks.map((ts) => ({ label: label(ts), count: mvWeekly.get(ts)?.count ?? 0, hours: Math.round((mvWeekly.get(ts)?.minutes ?? 0) / 60) })),
        genres: topCounts(movieLib.flatMap((m) => splitGenres(m.genres)), 6),
      },
      // ===== JEUX (onglet Jeux des stats — temps 100 % déclaratif) =====
      games: {
        tracked: gameLib.length,
        playing: gameLib.filter((g) => g.status === 'playing').length,
        completed: gameLib.filter((g) => g.status === 'completed').length,
        abandoned: gameLib.filter((g) => g.status === 'abandoned').length,
        wishlist: gameLib.filter((g) => g.status === 'wishlist').length,
        owned: gameLib.filter((g) => g.isOwned).length,
        minutes: gameLib.reduce((sum, g) => sum + (g.playtimeMinutes ?? 0), 0),
        // Top par temps déclaré : point d'entrée vers la fiche (édition).
        topByPlaytime: gameLib
          .filter((g) => (g.playtimeMinutes ?? 0) > 0)
          .sort((a, b) => (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0))
          .slice(0, 8)
          .map((g) => ({
            id: g.media.id,
            title: g.media.localizedTitle ?? g.media.title,
            posterPath: g.media.posterPath,
            minutes: g.playtimeMinutes ?? 0,
          })),
        genres: topCounts(gameLib.flatMap((g) => splitGenres(g.media.genres)), 6),
      },
    };
  });

  // Classement (Bloc 2) : moi + les personnes que je suis, triés par temps de
  // visionnage. Agrégation en SQL brut (une requête pour tous les comptes) :
  // indispensable pour rester rapide avec des bibliothèques à 20k épisodes.
  app.get('/api/stats/leaderboard', async (request) => {
    const userId = request.userId;
    const cached = leaderboardCache.get(userId);
    if (cached) return cached;
    const [following, blockedIds] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      }),
      // Blocage : les comptes que j'ai bloqués sortent de MON classement
      // (même règle que gamification/routes.ts — ceinture-bretelles, bloquer
      // désabonne déjà mais un vieux follow peut subsister).
      blockedIdSet(userId),
    ]);
    const ids = [userId, ...following.map((f) => f.followingId).filter((id) => !blockedIds.has(id))];

    const [epRows, mvRows, gmRows, users] = await Promise.all([
      prisma.$queryRaw<{ userId: string; minutes: bigint | number; count: bigint | number }[]>`
        SELECT ues.userId AS userId,
               SUM(CASE WHEN e.runtime > 0 THEN e.runtime
                        WHEN m.runtime > 0 THEN m.runtime
                        ELSE ${EP_FALLBACK_MIN} END) AS minutes,
               COUNT(*) AS count
        FROM "UserEpisodeStatus" ues
        JOIN "Episode" e ON e.id = ues.episodeId
        JOIN "Show" s ON s.id = e.showId
        JOIN "Media" m ON m.id = s.mediaId
        WHERE ues.status = 'watched' AND ues.userId IN (${Prisma.join(ids)})
        GROUP BY ues.userId`,
      prisma.$queryRaw<{ userId: string; minutes: bigint | number; count: bigint | number }[]>`
        SELECT ums.userId AS userId,
               SUM(CASE WHEN m.runtime > 0 THEN m.runtime ELSE ${MOVIE_FALLBACK_MIN} END) AS minutes,
               COUNT(*) AS count
        FROM "UserMediaStatus" ums
        JOIN "Media" m ON m.id = ums.mediaId
        WHERE ums.status = 'completed' AND m.type = 'movie' AND ums.userId IN (${Prisma.join(ids)})
        GROUP BY ums.userId`,
      // Jeux : temps de jeu DÉCLARATIF (saisi sur la fiche / import Steam) —
      // même règle que l'onglet Jeux des stats. « Joués » = en cours/terminés.
      prisma.$queryRaw<{ userId: string; minutes: bigint | number; count: bigint | number }[]>`
        SELECT ums.userId AS userId,
               SUM(COALESCE(ums.playtimeMinutes, 0)) AS minutes,
               SUM(CASE WHEN ums.status IN ('playing', 'completed') THEN 1 ELSE 0 END) AS count
        FROM "UserMediaStatus" ums
        JOIN "Media" m ON m.id = ums.mediaId
        WHERE m.type = 'game' AND ums.isHidden = 0 AND ums.userId IN (${Prisma.join(ids)})
        GROUP BY ums.userId`,
      prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, avatarUrl: true },
      }),
    ]);

    const ep = new Map(epRows.map((r) => [r.userId, { minutes: Number(r.minutes), count: Number(r.count) }]));
    const mv = new Map(mvRows.map((r) => [r.userId, { minutes: Number(r.minutes), count: Number(r.count) }]));
    const entry = (u: (typeof users)[number]) => ({
      userId: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isMe: u.id === userId,
    });
    const series = users
      .map((u) => ({ ...entry(u), minutes: ep.get(u.id)?.minutes ?? 0, episodes: ep.get(u.id)?.count ?? 0 }))
      .sort((a, b) => b.minutes - a.minutes);
    const movies = users
      .map((u) => ({ ...entry(u), minutes: mv.get(u.id)?.minutes ?? 0, movies: mv.get(u.id)?.count ?? 0 }))
      .sort((a, b) => b.minutes - a.minutes);
    const gm = new Map(gmRows.map((r) => [r.userId, { minutes: Number(r.minutes), count: Number(r.count) }]));
    const games = users
      .map((u) => ({ ...entry(u), minutes: gm.get(u.id)?.minutes ?? 0, games: gm.get(u.id)?.count ?? 0 }))
      .sort((a, b) => b.minutes - a.minutes);
    const result = { series, movies, games };
    leaderboardCache.set(userId, result);
    return result;
  });

  // Badges (Bloc 3) : calculés à la volée depuis l'état du compte — pas de table
  // de déblocage, un badge reflète toujours la réalité (et « se répare » seul
  // après un import). Icônes maison (Feather + couleur), pas d'art TV Time.
  app.get('/api/stats/badges', async (request) => {
    const userId = request.userId;
    const [
      episodesWatched,
      moviesWatched,
      showsAdded,
      showsCompleted,
      favorites,
      comments,
      epRatings,
      mediaRatings,
      followingCount,
      followersCount,
      imports,
      minutesRow,
      marathonRow,
    ] = await Promise.all([
      prisma.userEpisodeStatus.count({ where: { userId, status: 'watched' } }),
      prisma.userMediaStatus.count({ where: { userId, status: 'completed', media: { type: 'movie' } } }),
      prisma.userMediaStatus.count({ where: { userId, media: { type: 'show' } } }),
      prisma.userMediaStatus.count({ where: { userId, status: 'completed', media: { type: 'show' } } }),
      prisma.userMediaStatus.count({ where: { userId, isFavorite: true } }),
      prisma.comment.count({ where: { userId } }),
      prisma.userEpisodeStatus.count({ where: { userId, rating: { not: null } } }),
      prisma.userMediaStatus.count({ where: { userId, rating: { not: null } } }),
      prisma.follow.count({ where: { followerId: userId } }),
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.import.count({ where: { userId } }),
      prisma.$queryRaw<{ minutes: bigint | number | null }[]>`
        SELECT SUM(CASE WHEN e.runtime > 0 THEN e.runtime
                        WHEN m.runtime > 0 THEN m.runtime
                        ELSE ${EP_FALLBACK_MIN} END) AS minutes
        FROM "UserEpisodeStatus" ues
        JOIN "Episode" e ON e.id = ues.episodeId
        JOIN "Show" s ON s.id = e.showId
        JOIN "Media" m ON m.id = s.mediaId
        WHERE ues.status = 'watched' AND ues.userId = ${userId}`,
      prisma.$queryRaw<{ maxRun: bigint | number | null }[]>`
        SELECT MAX(c) AS maxRun FROM (
          SELECT COUNT(*) AS c FROM "UserEpisodeStatus" ues
          JOIN "Episode" e ON e.id = ues.episodeId
          WHERE ues.userId = ${userId} AND ues.status = 'watched' AND ues.watchedAt IS NOT NULL
          GROUP BY e.showId, date(ues.watchedAt / 1000, 'unixepoch')
        )`,
    ]);
    const minutes = Number(minutesRow[0]?.minutes ?? 0);
    const marathon = Number(marathonRow[0]?.maxRun ?? 0);
    const ratings = epRatings + mediaRatings;

    // (id, titre, description, icône Feather, couleur, valeur courante, objectif)
    const def = (
      id: string, title: string, description: string, icon: string, color: string, current: number, target: number,
    ) => ({ id, title, description, icon, color, earned: current >= target, progress: { current: Math.min(current, target), target } });

    const sections = [
      {
        title: 'Badges de visionnage',
        badges: [
          def('first-episode', 'Premier pas', 'Regarder son premier épisode', 'play', '#62D600', episodesWatched, 1),
          def('serial-100', 'Habitué', 'Regarder 100 épisodes', 'tv', '#0075D9', episodesWatched, 100),
          def('serial-1000', 'Accro aux séries', 'Regarder 1 000 épisodes', 'tv', '#7B5CD6', episodesWatched, 1000),
          def('serial-5000', 'Marathonien du canapé', 'Regarder 5 000 épisodes', 'tv', '#E8871E', episodesWatched, 5000),
          def('serial-20000', 'Légende du binge', 'Regarder 20 000 épisodes', 'award', '#FFD400', episodesWatched, 20000),
          def('marathon-10', 'Marathonien', "10 épisodes d'une même série en un jour", 'zap', '#C7222A', marathon, 10),
          def('time-month', 'Un mois de ta vie', "Cumuler 1 mois devant des séries", 'clock', '#0FA47A', minutes, 43_200),
          def('time-year', 'Une année entière', "Cumuler 1 an devant des séries", 'clock', '#B8860B', minutes, 525_600),
        ],
      },
      {
        title: 'Badges de films',
        badges: [
          def('movie-1', 'Cinéphile en herbe', 'Regarder son premier film', 'film', '#62D600', moviesWatched, 1),
          def('movie-50', 'Rat de cinéma', 'Regarder 50 films', 'film', '#0075D9', moviesWatched, 50),
          def('movie-500', 'Encyclopédie vivante', 'Regarder 500 films', 'award', '#FFD400', moviesWatched, 500),
        ],
      },
      {
        title: 'Badges de collection',
        badges: [
          def('shows-10', 'Collectionneur', 'Suivre 10 séries', 'bookmark', '#62D600', showsAdded, 10),
          def('shows-100', 'Grande bibliothèque', 'Suivre 100 séries', 'bookmark', '#0075D9', showsAdded, 100),
          def('shows-500', 'Archiviste', 'Suivre 500 séries', 'archive', '#7B5CD6', showsAdded, 500),
          def('completed-1', 'Finisseur', 'Terminer une série', 'check-circle', '#62D600', showsCompleted, 1),
          def('completed-25', 'Jusqu’au générique', 'Terminer 25 séries', 'check-circle', '#E8871E', showsCompleted, 25),
          def('favorite-1', 'Coup de cœur', 'Ajouter un favori', 'heart', '#C7222A', favorites, 1),
        ],
      },
      {
        title: 'Badges sociaux',
        badges: [
          def('comment-1', 'Bavard', 'Écrire un commentaire', 'message-circle', '#0075D9', comments, 1),
          def('rating-1', 'Critique', 'Noter une série ou un film', 'star', '#FFD400', ratings, 1),
          def('follow-1', 'Connecté', "S'abonner à quelqu'un", 'user-plus', '#62D600', followingCount, 1),
          def('follower-1', 'Populaire', 'Avoir un abonné', 'users', '#7B5CD6', followersCount, 1),
        ],
      },
      {
        title: "Badges d'application",
        badges: [
          def('import-1', 'Migrateur', 'Importer son archive TV Time', 'download', '#0FA47A', imports, 1),
        ],
      },
    ];

    const earned = sections.reduce((n, s) => n + s.badges.filter((b) => b.earned).length, 0);
    const total = sections.reduce((n, s) => n + s.badges.length, 0);
    return { earned, total, sections };
  });
}
