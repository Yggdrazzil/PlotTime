import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { requireAuth } from '../auth/routes.js';
import { serializeMedia } from '../media/serialize.js';

type PublicUser = { id: string; displayName: string; avatarUrl: string | null; isPrivate: boolean };

function publicUser(u: PublicUser): PublicUser {
  return { id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl, isPrivate: u.isPrivate };
}

async function followingIdSet(userId: string): Promise<Set<string>> {
  const rows = await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
  return new Set(rows.map((r) => r.followingId));
}

function summarizeReactions(reactions: { emoji: string; userId: string }[], me: string) {
  const byEmoji: Record<string, number> = {};
  let mine: string | null = null;
  for (const r of reactions) {
    byEmoji[r.emoji] = (byEmoji[r.emoji] ?? 0) + 1;
    if (r.userId === me) mine = r.emoji;
  }
  return { total: reactions.length, byEmoji, mine };
}

type FeedItem = {
  kind: 'watch' | 'comment';
  id: string;
  date: string;
  eventType: string;
  user: PublicUser;
  media: { id: string; title: string; posterPath: string | null; type: string };
  episode: { seasonNumber: number; episodeNumber: number; title: string } | null;
  body?: string;
};

export async function socialRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // --- Abonnements ---------------------------------------------------------
  app.post('/api/social/follow/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    if (userId === request.userId) return reply.code(400).send({ error: 'cannot_follow_self' });
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return reply.code(404).send({ error: 'not_found' });
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: request.userId, followingId: userId } },
      create: { followerId: request.userId, followingId: userId },
      update: {},
    });
    return { ok: true, following: true };
  });

  app.delete('/api/social/follow/:userId', async (request) => {
    const { userId } = request.params as { userId: string };
    await prisma.follow.deleteMany({ where: { followerId: request.userId, followingId: userId } });
    return { ok: true, following: false };
  });

  app.get('/api/social/following', async (request) => {
    const rows = await prisma.follow.findMany({
      where: { followerId: request.userId },
      include: { following: true },
      orderBy: { createdAt: 'desc' },
    });
    return { users: rows.map((r) => ({ ...publicUser(r.following), isFollowing: true })) };
  });

  app.get('/api/social/followers', async (request) => {
    const rows = await prisma.follow.findMany({
      where: { followingId: request.userId },
      include: { follower: true },
      orderBy: { createdAt: 'desc' },
    });
    const followingIds = await followingIdSet(request.userId);
    return {
      users: rows.map((r) => ({ ...publicUser(r.follower), isFollowing: followingIds.has(r.follower.id) })),
    };
  });

  // --- Recherche d'utilisateurs -------------------------------------------
  app.get('/api/users/search', async (request) => {
    const { q } = z.object({ q: z.string().default('') }).parse(request.query ?? {});
    const term = q.trim();
    if (!term) return { users: [] };
    const users = await prisma.user.findMany({
      where: { displayName: { contains: term }, id: { not: request.userId } },
      take: 20,
    });
    const followingIds = await followingIdSet(request.userId);
    return { users: users.map((u) => ({ ...publicUser(u), isFollowing: followingIds.has(u.id) })) };
  });

  // --- Profil public -------------------------------------------------------
  app.get('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: 'not_found' });
    const isSelf = id === request.userId;
    const isFollowing =
      !isSelf &&
      !!(await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: request.userId, followingId: id } },
      }));
    const [followersCount, followingCount] = await Promise.all([
      prisma.follow.count({ where: { followingId: id } }),
      prisma.follow.count({ where: { followerId: id } }),
    ]);
    const base = { ...publicUser(user), isFollowing, isSelf, followersCount, followingCount };

    // Profil privé : activité masquée aux non-abonnés.
    if (user.isPrivate && !isSelf && !isFollowing) {
      return { ...base, restricted: true, stats: null, recentShows: [] };
    }
    const [showsCount, moviesCount, episodesWatched, recent] = await Promise.all([
      prisma.userMediaStatus.count({ where: { userId: id, media: { type: 'show' } } }),
      prisma.userMediaStatus.count({ where: { userId: id, media: { type: 'movie' } } }),
      prisma.userEpisodeStatus.count({ where: { userId: id, status: 'watched' } }),
      prisma.userMediaStatus.findMany({
        where: { userId: id, media: { type: 'show' }, isHidden: false },
        include: { media: true },
        orderBy: { lastWatchedAt: 'desc' },
        take: 12,
      }),
    ]);
    return {
      ...base,
      restricted: false,
      stats: { showsCount, moviesCount, episodesWatched },
      recentShows: recent.map((s) => serializeMedia(s.media, s)),
    };
  });

  // --- Fil d'activité des abonnements --------------------------------------
  app.get('/api/social/feed', async (request) => {
    const ids = [...(await followingIdSet(request.userId))];
    if (ids.length === 0) return { items: [] as FeedItem[] };

    const [events, comments] = await Promise.all([
      prisma.watchEvent.findMany({
        where: { userId: { in: ids }, eventType: { in: ['watched', 'favorited', 'added_to_watchlist'] } },
        include: { user: true, media: true, episode: true },
        orderBy: { eventDate: 'desc' },
        take: 40,
      }),
      prisma.comment.findMany({
        where: { userId: { in: ids } },
        include: { user: true, media: true, episode: true },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ]);

    const items: FeedItem[] = [
      ...events.map((e): FeedItem => ({
        kind: 'watch',
        id: e.id,
        date: e.eventDate.toISOString(),
        eventType: e.eventType,
        user: publicUser(e.user),
        media: {
          id: e.mediaId,
          title: e.media.localizedTitle ?? e.media.title,
          posterPath: e.media.posterPath,
          type: e.media.type,
        },
        episode: e.episode
          ? { seasonNumber: e.episode.seasonNumber, episodeNumber: e.episode.episodeNumber, title: e.episode.title }
          : null,
      })),
      ...comments.map((c): FeedItem => ({
        kind: 'comment',
        id: c.id,
        date: c.createdAt.toISOString(),
        eventType: 'comment',
        user: publicUser(c.user),
        media: {
          id: c.mediaId,
          title: c.media.localizedTitle ?? c.media.title,
          posterPath: c.media.posterPath,
          type: c.media.type,
        },
        episode: c.episode
          ? { seasonNumber: c.episode.seasonNumber, episodeNumber: c.episode.episodeNumber, title: c.episode.title }
          : null,
        body: c.body,
      })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50);

    return { items };
  });

  // --- Confidentialité -----------------------------------------------------
  app.post('/api/social/privacy', async (request) => {
    const { isPrivate } = z.object({ isPrivate: z.boolean() }).parse(request.body);
    await prisma.user.update({ where: { id: request.userId }, data: { isPrivate } });
    return { ok: true, isPrivate };
  });

  // --- Commentaires + réactions -------------------------------------------
  app.get('/api/media/:id/comments', async (request) => {
    const { id } = request.params as { id: string };
    const { episodeId } = z.object({ episodeId: z.string().optional() }).parse(request.query ?? {});
    const comments = await prisma.comment.findMany({
      where: { mediaId: id, ...(episodeId ? { episodeId } : {}) },
      include: { user: true, reactions: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        episodeId: c.episodeId,
        user: publicUser(c.user),
        isMine: c.userId === request.userId,
        reactions: summarizeReactions(c.reactions, request.userId),
      })),
    };
  });

  app.post('/api/media/:id/comments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ body: z.string().min(1).max(2000), episodeId: z.string().optional() })
      .parse(request.body);
    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) return reply.code(404).send({ error: 'not_found' });
    if (body.episodeId) {
      const ep = await prisma.episode.findUnique({ where: { id: body.episodeId } });
      if (!ep) return reply.code(404).send({ error: 'episode_not_found' });
    }
    const comment = await prisma.comment.create({
      data: { userId: request.userId, mediaId: id, episodeId: body.episodeId, body: body.body },
    });
    return { id: comment.id };
  });

  app.delete('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return reply.code(404).send({ error: 'not_found' });
    if (comment.userId !== request.userId) return reply.code(403).send({ error: 'forbidden' });
    await prisma.comment.delete({ where: { id } });
    return { ok: true };
  });

  app.post('/api/comments/:id/react', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { emoji } = z.object({ emoji: z.string().min(1).max(8) }).parse(request.body);
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return reply.code(404).send({ error: 'not_found' });
    await prisma.commentReaction.upsert({
      where: { commentId_userId: { commentId: id, userId: request.userId } },
      create: { commentId: id, userId: request.userId, emoji },
      update: { emoji },
    });
    return { ok: true };
  });

  app.delete('/api/comments/:id/react', async (request) => {
    const { id } = request.params as { id: string };
    await prisma.commentReaction.deleteMany({ where: { commentId: id, userId: request.userId } });
    return { ok: true };
  });
}
