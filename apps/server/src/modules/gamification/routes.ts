// Gamification — endpoints (spec 2026-07-16 §6/§9).
import type { FastifyInstance } from 'fastify';
import { XP_RULES } from '@serietime/core';
import { prisma } from '../../db/client.js';
import { requireAuth } from '../auth/routes.js';
import { meView, weekStartParis } from './service.js';

export async function gamificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Progression complète : recompute léger à la volée (aucune écriture — les
  // notifications restent au recompute débouncé, cf. service.meView).
  app.get('/api/gamification/me', async (request, reply) => {
    const view = await meView(request.userId);
    if (!view) return reply.code(404).send({ error: 'not_found' });
    return view;
  });

  // Classement hebdo entre amis : XP gagné depuis lundi 00:00 Europe/Paris,
  // calculé en live (pas de table), requêtes groupées — jamais de N+1.
  // NB : le bonus « jour J » des épisodes est volontairement ignoré ici
  // (barème simple ×10, spec §6) pour éviter de charger les dates de
  // diffusion de toute la semaine de chaque ami.
  app.get('/api/gamification/leaderboard', async (request) => {
    const follows = await prisma.follow.findMany({
      where: { followerId: request.userId },
      select: { followingId: true },
    });
    const ids = [request.userId, ...follows.map((f) => f.followingId)];
    const since = weekStartParis(new Date());

    const [episodes, movies, games, comments, users, progresses] = await Promise.all([
      prisma.userEpisodeStatus.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'watched', watchedAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.userMediaStatus.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'completed', completedAt: { gte: since }, media: { type: 'movie' } },
        _count: { _all: true },
      }),
      prisma.userMediaStatus.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'completed', completedAt: { gte: since }, media: { type: 'game' } },
        _count: { _all: true },
      }),
      prisma.comment.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, avatarUrl: true },
      }),
      prisma.userProgress.findMany({ where: { userId: { in: ids } }, select: { userId: true, level: true } }),
    ]);

    const countBy = (rows: { userId: string; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.userId, r._count._all]));
    const epBy = countBy(episodes);
    const movieBy = countBy(movies);
    const gameBy = countBy(games);
    const commentBy = countBy(comments);
    const levelBy = new Map(progresses.map((p) => [p.userId, p.level]));

    const entries = users
      .map((u) => ({
        user: { id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl, level: levelBy.get(u.id) ?? 1 },
        weeklyXp:
          (epBy.get(u.id) ?? 0) * XP_RULES.episode +
          (movieBy.get(u.id) ?? 0) * XP_RULES.movie +
          (gameBy.get(u.id) ?? 0) * XP_RULES.gameCompleted +
          (commentBy.get(u.id) ?? 0) * XP_RULES.comment,
      }))
      .sort((a, b) => b.weeklyXp - a.weeklyXp)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    return { leaderboard: entries };
  });
}
