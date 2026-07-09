import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

const tmp = mkdtempSync(path.join(tmpdir(), 'serietime-favorites-'));
process.env.DATABASE_URL = `file:${path.join(tmp, 'favorites.sqlite')}`;
process.env.NODE_ENV = 'test';
process.env.TMDB_API_KEY = '';
process.env.TVMAZE_ENABLED = 'false';
process.env.TVDB_ENABLED = 'false';

let app: FastifyInstance;
let token = '';
const movieIds: string[] = [];

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
    payload: { displayName: 'Fav', email: 'fav@example.com', password: 'secret123' },
  });
  expect(res.statusCode).toBe(200);
  token = res.json().token;

  const { prisma } = await import('../db/client.js');
  for (const title of ['Alpha', 'Bravo', 'Charlie']) {
    const media = await prisma.media.create({ data: { type: 'movie', title, year: 2020 } });
    movieIds.push(media.id);
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('Favoris — ordre personnalisé (drag & drop façon TV Time)', () => {
  it('un nouvel ajout arrive en fin de l’ordre, horodaté', async () => {
    for (const id of movieIds) {
      const res = await app.inject({ method: 'POST', url: `/api/movies/${id}/favorite`, headers: bearer() });
      expect(res.statusCode).toBe(200);
      expect(res.json().isFavorite).toBe(true);
    }
    const favs = await app.inject({ method: 'GET', url: '/api/profile/favorites?type=movie', headers: bearer() });
    expect(favs.statusCode).toBe(200);
    const list = favs.json().favorites;
    expect(list.map((f: { title: string }) => f.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(list[0].favoriteOrder).toBe(0);
    expect(list[0].favoritedAt).toBeTruthy();
  });

  it('le réordonnancement réécrit les positions', async () => {
    const reorder = await app.inject({
      method: 'POST',
      url: '/api/profile/favorites/reorder',
      payload: { type: 'movie', ids: [movieIds[2], movieIds[0], movieIds[1]] },
      headers: bearer(),
    });
    expect(reorder.statusCode).toBe(200);
    const favs = await app.inject({ method: 'GET', url: '/api/profile/favorites?type=movie', headers: bearer() });
    expect(favs.json().favorites.map((f: { title: string }) => f.title)).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('refuse un id qui n’est pas un favori', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profile/favorites/reorder',
      payload: { type: 'movie', ids: ['inconnu'] },
      headers: bearer(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('retirer un favori libère sa place et le retire de la liste', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/movies/${movieIds[0]}/favorite`, headers: bearer() });
    expect(res.json().isFavorite).toBe(false);
    const favs = await app.inject({ method: 'GET', url: '/api/profile/favorites?type=movie', headers: bearer() });
    expect(favs.json().favorites.map((f: { title: string }) => f.title)).toEqual(['Charlie', 'Bravo']);
  });
});
