import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { BADGES } from '@serietime/core';

const tmp = mkdtempSync(path.join(tmpdir(), 'serietime-gamification-'));
process.env.DATABASE_URL = `file:${path.join(tmp, 'gamification.sqlite')}`;
process.env.NODE_ENV = 'test';
process.env.TMDB_API_KEY = '';
process.env.TVMAZE_ENABLED = 'false';
process.env.TVDB_ENABLED = 'false';

let app: FastifyInstance;
let prisma: (typeof import('../db/client.js'))['prisma'];
let gamification: typeof import('../modules/gamification/service.js');

const users: Record<string, { token: string; id: string }> = {};
const episodeIds: string[] = [];

function acc(name: string) {
  const u = users[name];
  if (!u) throw new Error(`utilisateur inconnu: ${name}`);
  return u;
}
const bearer = (name: string) => ({ authorization: `Bearer ${acc(name).token}` });
const uid = (name: string) => acc(name).id;

const GAMIFICATION_NOTIF_TYPES = ['badge_unlocked', 'level_up', 'challenge_completed'];

async function register(name: string, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { displayName: name, email, password: 'secret123' },
  });
  expect(res.statusCode).toBe(200);
  users[name] = { token: res.json().token, id: res.json().user.id };
}

async function watch(name: string, episodeId: string) {
  const res = await app.inject({ method: 'POST', url: `/api/episodes/${episodeId}/watched`, headers: bearer(name) });
  expect(res.statusCode).toBe(200);
}

async function gamificationNotifs(userId: string) {
  return prisma.notification.findMany({ where: { userId, type: { in: GAMIFICATION_NOTIF_TYPES } } });
}

beforeAll(async () => {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: process.env,
    stdio: 'pipe',
  });
  const { buildApp } = await import('../app.js');
  app = await buildApp();
  prisma = (await import('../db/client.js')).prisma;
  gamification = await import('../modules/gamification/service.js');

  await register('Alice', 'alice@example.com');
  await register('Bob', 'bob@example.com');

  // Une série de 40 épisodes (airDate null : cochables, jamais « jour J »).
  const media = await prisma.media.create({
    data: {
      type: 'show',
      title: 'Test Show',
      genres: 'Drame, Comédie',
      show: {
        create: {
          episodes: {
            create: Array.from({ length: 40 }, (_, i) => ({
              seasonNumber: 1,
              episodeNumber: i + 1,
              title: `Épisode ${i + 1}`,
            })),
          },
        },
      },
    },
    include: { show: { include: { episodes: true } } },
  });
  const episodes = [...(media.show?.episodes ?? [])].sort((a, b) => a.episodeNumber - b.episodeNumber);
  episodeIds.push(...episodes.map((e) => e.id));
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('Gamification — recompute, badges, notifications, /me, leaderboard, défis', () => {
  it('recompute pose UserProgress + badges pour un utilisateur avec des épisodes vus', async () => {
    for (const id of episodeIds.slice(0, 12)) await watch('Alice', id);
    await gamification.recomputeUser(uid('Alice'));

    const progress = await prisma.userProgress.findUnique({ where: { userId: uid('Alice') } });
    expect(progress).not.toBeNull();
    expect(progress?.xp).toBe(120); // 12 épisodes × 10
    expect(progress?.level).toBe(1);
    expect(progress?.bestStreak).toBe(1);

    const badges = await prisma.userBadge.findMany({ where: { userId: uid('Alice') } });
    const keys = badges.map((b) => `${b.badgeId}:${b.tier}`).sort();
    // 12 épisodes → Boulimique bronze + Marathonien bronze (12 en 24 h) + Pionnier.
    expect(keys).toEqual(['episodes:1', 'marathon:1', 'pioneer:1']);
  });

  it('pas de notifications au premier calcul (backfill silencieux)', async () => {
    expect(await gamificationNotifs(uid('Alice'))).toHaveLength(0);
  });

  it('nouvelles notifications au 2e recompute après de nouveaux épisodes', async () => {
    for (const id of episodeIds.slice(12, 20)) await watch('Alice', id);
    const c = await app.inject({
      method: 'POST',
      url: `/api/media/${(await prisma.media.findFirstOrThrow()).id}/comments`,
      payload: { body: 'Excellent !' },
      headers: bearer('Alice'),
    });
    expect(c.statusCode).toBe(200);
    await gamification.recomputeUser(uid('Alice'));

    // 20 épisodes ×10 + 1 commentaire ×5 = 205 XP → niveau 2.
    const notifs = await gamificationNotifs(uid('Alice'));
    const types = notifs.map((n) => n.type);
    expect(types).toContain('level_up');
    expect(types.filter((t) => t === 'badge_unlocked').length).toBeGreaterThanOrEqual(2); // marathon argent + commentateur bronze
    const badgeIds = notifs
      .filter((n) => n.type === 'badge_unlocked')
      .map((n) => JSON.parse(n.metadataJson ?? '{}').badgeId);
    expect(badgeIds).toContain('commentator');
    expect(badgeIds).toContain('marathon');

    // Idempotence : un recompute de plus ne crée AUCUNE nouvelle notification.
    await gamification.recomputeUser(uid('Alice'));
    expect(await gamificationNotifs(uid('Alice'))).toHaveLength(notifs.length);
  });

  it('GET /api/gamification/me répond avec le contrat complet', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/gamification/me', headers: bearer('Alice') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.xp).toBe(205);
    expect(body.level).toBe(2);
    expect(typeof body.levelTitle).toBe('string');
    expect(body.nextLevelXp).toBe(50 * 3 * 3);
    expect(body.currentStreak).toBe(1);
    expect(body.bestStreak).toBe(1);

    // Badges : TOUT le catalogue, débloqué ou non.
    expect(body.badges).toHaveLength(BADGES.length);
    const episodesBadge = body.badges.find((b: { id: string }) => b.id === 'episodes');
    expect(episodesBadge).toMatchObject({ tier: 1, tierCount: 4, progress: 20, nextThreshold: 100 });
    expect(episodesBadge.label).toBeTruthy();
    expect(episodesBadge.unlockedAt).toBeTruthy();
    const gamesBadge = body.badges.find((b: { id: string }) => b.id === 'games');
    expect(gamesBadge).toMatchObject({ tier: 0, unlockedAt: null, progress: 0, nextThreshold: 1 });

    // Défis du mois : 3, avec progression live.
    expect(body.challenges).toHaveLength(3);
    const marathon = body.challenges.find((c: { id: string }) => c.id.endsWith('-marathon'));
    expect(marathon).toMatchObject({ target: 30, progress: 20, completed: false });
  });

  it('le leaderboard trie par XP hebdo décroissant', async () => {
    const follow = await app.inject({
      method: 'POST',
      url: `/api/social/follow/${uid('Bob')}`,
      headers: bearer('Alice'),
    });
    expect(follow.statusCode).toBe(200);
    // Bob : 25 épisodes cette semaine = 250 XP > Alice 205 (20×10 + 1 commentaire).
    for (const id of episodeIds.slice(0, 25)) await watch('Bob', id);

    const res = await app.inject({ method: 'GET', url: '/api/gamification/leaderboard', headers: bearer('Alice') });
    expect(res.statusCode).toBe(200);
    const { leaderboard } = res.json();
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0]).toMatchObject({ rank: 1, weeklyXp: 250, user: { id: uid('Bob') } });
    expect(leaderboard[1]).toMatchObject({ rank: 2, weeklyXp: 205, user: { id: uid('Alice') } });
    expect(typeof leaderboard[0].user.level).toBe('number');
  });

  it('défi mensuel accompli → UserChallenge + XP + notification', async () => {
    for (const id of episodeIds.slice(20, 30)) await watch('Alice', id); // 30 épisodes ce mois-ci
    await gamification.recomputeUser(uid('Alice'));

    const month = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }).slice(0, 7);
    const challenge = await prisma.userChallenge.findUnique({
      where: { userId_challengeId: { userId: uid('Alice'), challengeId: `${month}-marathon` } },
    });
    expect(challenge).not.toBeNull();

    // 30 épisodes ×10 + commentaire ×5 + défi ×100 = 405 XP.
    const progress = await prisma.userProgress.findUnique({ where: { userId: uid('Alice') } });
    expect(progress?.xp).toBe(405);

    const notifs = await gamificationNotifs(uid('Alice'));
    expect(notifs.map((n) => n.type)).toContain('challenge_completed');

    // Le défi apparaît accompli dans /me.
    const me = await app.inject({ method: 'GET', url: '/api/gamification/me', headers: bearer('Alice') });
    const marathon = me.json().challenges.find((c: { id: string }) => c.id === `${month}-marathon`);
    expect(marathon).toMatchObject({ completed: true, progress: 30 });
  });
});
