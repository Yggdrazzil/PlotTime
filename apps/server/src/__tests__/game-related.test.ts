import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

const tmp = mkdtempSync(path.join(tmpdir(), 'serietime-gamerel-'));
process.env.DATABASE_URL = `file:${path.join(tmp, 'gamerel.sqlite')}`;
process.env.NODE_ENV = 'test';
process.env.TMDB_API_KEY = '';
process.env.TVMAZE_ENABLED = 'false';
process.env.TVDB_ENABLED = 'false';
// IGDB « activé » avec identifiants factices : igdbQuery sert alors le cache
// ApiCache pré-rempli ci-dessous AVANT toute tentative réseau — zéro requête.
process.env.IGDB_ENABLED = 'true';
process.env.TWITCH_CLIENT_ID = 'test-client';
process.env.TWITCH_CLIENT_SECRET = 'test-secret';

let app: FastifyInstance;
let token = '';
let baseId = '';

const bearer = () => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: process.env,
    stdio: 'pipe',
  });
  const { buildApp } = await import('../app.js');
  app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { displayName: 'Gamer', email: 'gamer@example.com', password: 'secret123' },
  });
  expect(res.statusCode).toBe(200);
  token = res.json().token;

  const { prisma } = await import('../db/client.js');
  const me = await prisma.user.findFirstOrThrow();

  // Jeu de base + une ÉDITION locale (importée jadis) marquée isDlc et suivie.
  const base = await prisma.media.create({
    data: {
      type: 'game', igdbId: '100', title: 'Basegame', year: 2024, lastSyncedAt: new Date(),
      game: { create: { isDlc: false } },
    },
  });
  baseId = base.id;
  const deluxe = await prisma.media.create({
    data: {
      type: 'game', igdbId: '200', title: 'Basegame Deluxe Edition', year: 2024, lastSyncedAt: new Date(),
      game: { create: { isDlc: true } },
    },
  });
  await prisma.userMediaStatus.create({ data: { userId: me.id, mediaId: deluxe.id, status: 'wishlist' } });
  await prisma.userMediaStatus.create({ data: { userId: me.id, mediaId: base.id, status: 'playing' } });

  // Caches IGDB pré-remplis (adressés par le corps Apicalypse exact).
  const { igdbRelatedBody, gameQueryBody, searchQueryBody } = await import('../services/igdb/index.js');
  const seedCache = (body: string, data: unknown) =>
    prisma.apiCache.create({
      data: {
        source: 'igdb',
        cacheKey: `games:${body}`,
        responseJson: JSON.stringify(data),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  // Fiche du jeu de base (videoId/criticScore/rattrapage isDlc).
  await seedCache(gameQueryBody(100), [{ id: 100, name: 'Basegame', game_type: 0 }]);
  // Éditions + extensions : une édition (version_parent) + un DLC (parent_game).
  await seedCache(igdbRelatedBody(100), [
    { id: 200, name: 'Basegame Deluxe Edition', version_parent: 100, first_release_date: 1717200000 },
    { id: 300, name: 'Basegame — Extension du Désert', parent_game: 100, game_type: 1, first_release_date: 1719800000 },
  ]);
  // Recherche IGDB « Basegame » : le jeu de base + une édition + un update —
  // seuls les jeux de base doivent traverser le filtre isMainGame.
  await seedCache(searchQueryBody('Basegame'), [
    { id: 100, name: 'Basegame', game_type: 0 },
    { id: 200, name: 'Basegame Deluxe Edition', game_type: 0, version_parent: 100 },
    { id: 400, name: 'Basegame Thank You Update', game_type: 14 },
  ]);
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('Jeux : éditions/extensions hors recherche, section dédiée sur la fiche', () => {
  it('la recherche ne renvoie que le jeu de base (local + IGDB filtrés)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games/search?q=Basegame', headers: bearer() });
    expect(res.statusCode).toBe(200);
    const { results } = res.json() as { results: { title: string; igdbId: string | null }[] };
    expect(results.map((r) => r.title)).toEqual(['Basegame']);
  });

  it('la fiche expose related : édition (locale, suivie) + extension (IGDB seul)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/games/${baseId}`, headers: bearer() });
    expect(res.statusCode).toBe(200);
    const { related } = res.json() as {
      related: { igdbId: string; localId: string | null; inLibrary: boolean; kind: string; title: string }[];
    };
    expect(related).toHaveLength(2);
    const deluxe = related.find((r) => r.igdbId === '200')!;
    expect(deluxe.kind).toBe('edition');
    expect(deluxe.localId).not.toBeNull();
    expect(deluxe.inLibrary).toBe(true);
    const dlc = related.find((r) => r.igdbId === '300')!;
    expect(dlc.kind).toBe('extension');
    expect(dlc.localId).toBeNull();
    expect(dlc.inLibrary).toBe(false);
  });
});
