import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

const tmp = mkdtempSync(path.join(tmpdir(), 'serietime-games-'));
process.env.DATABASE_URL = `file:${path.join(tmp, 'games.sqlite')}`;
process.env.NODE_ENV = 'test';
process.env.TMDB_API_KEY = '';
process.env.TVMAZE_ENABLED = 'false';
process.env.TVDB_ENABLED = 'false';

let app: FastifyInstance;
const users: Record<string, { token: string; id: string }> = {};

function acc(name: string) {
  const u = users[name];
  if (!u) throw new Error(`utilisateur inconnu: ${name}`);
  return u;
}
const bearer = (name: string) => ({ authorization: `Bearer ${acc(name).token}` });

async function register(name: string, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { displayName: name, email, password: 'secret123' },
  });
  expect(res.statusCode).toBe(200);
  users[name] = { token: res.json().token, id: res.json().user.id };
}

beforeAll(async () => {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: process.env,
    stdio: 'pipe',
  });
  const { buildApp } = await import('../app.js');
  app = await buildApp();

  await register('Alice', 'alice@test.dev');
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('Jeux vidéo — bibliothèque groupée par statut', () => {
  it('classe les jeux par statut', async () => {
    const { prisma } = await import('../db/client.js');
    const g = await prisma.media.create({ data: { type: 'game', igdbId: '42', title: 'Halo' } });
    await prisma.game.create({ data: { mediaId: g.id, platforms: 'PC' } });
    const alice = await prisma.user.findFirstOrThrow({ where: { email: 'alice@test.dev' } });
    await prisma.userMediaStatus.create({ data: { userId: alice.id, mediaId: g.id, status: 'playing' } });

    const res = await app.inject({ method: 'GET', url: '/api/games', headers: bearer('Alice') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.playing.map((m: { title: string }) => m.title)).toContain('Halo');
    expect(body.wishlist).toEqual([]);
  });

  it('change le statut d’un jeu', async () => {
    const { prisma } = await import('../db/client.js');
    const g = await prisma.media.findFirstOrThrow({ where: { igdbId: '42' } });
    const res = await app.inject({
      method: 'POST',
      url: `/api/games/${g.id}/status`,
      payload: { status: 'completed' },
      headers: bearer('Alice'),
    });
    expect(res.statusCode).toBe(200);
    const lib = await app.inject({ method: 'GET', url: '/api/games', headers: bearer('Alice') });
    expect(lib.json().completed.map((m: { title: string }) => m.title)).toContain('Halo');
    expect(lib.json().playing).toEqual([]);
  });

  it('/api/games/upcoming renvoie des groupes (vide si aucun suivi à venir)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games/upcoming', headers: bearer('Alice') });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().groups)).toBe(true);
  });
});
