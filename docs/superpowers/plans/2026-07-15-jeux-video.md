# Onglet Jeux vidéo (V1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un domaine « Jeux vidéo » à SerieTime (suivi, sorties/DLC à venir, découverte, import Steam), calqué sur le côté séries/films, avec IGDB comme source de métadonnées.

**Architecture:** `Media.type="game"` + sous-table `Game` + provider `services/igdb/` (auth Twitch OAuth, requêtes Apicalypse, cache `ApiCache`) + module `modules/games/routes.ts` (mirroir de `shows`) + réutilisation de `UserMediaStatus` (statuts jeux + `playtimeMinutes`). Import Steam via `services/steam/`. Mobile : onglet « Jeux » (biblio + découverte + à venir), fiche `/game/[id]`, connexion Steam en réglages.

**Tech Stack:** Fastify + Prisma (SQLite) + vitest côté serveur ; React Native + Expo Router + react-query côté mobile (pas de test runner → `npm run typecheck` + vérif manuelle web).

## Global Constraints

- Police **Mulish** via `FONTS.x` uniquement — jamais `fontWeight`.
- Compatibilité **web ET natif** (la web app est l'export web du même projet Expo). Tester web via `cd mobile && npm run web`.
- Gestionnaires : **`corepack pnpm`** pour le serveur, **`npm`** pour `mobile/`.
- Serveur : TDD **vitest** (`cd apps/server && corepack pnpm test`). Mobile : `cd mobile && npm run typecheck` (doit passer, zéro erreur, pas d'import inutilisé).
- Imports relatifs serveur en ESM : garder l'extension `.js`. Alias mobile `@/` = racine `mobile/`.
- Statuts jeux (`UserMediaStatus.status`) : `wishlist` (Voulus) · `playing` (En cours) · `completed` (Terminé) · `abandoned` (Abandonné).
- Provider IGDB derrière `igdbEnabled()` ; cache obligatoire via `prisma.apiCache` (source `'igdb'`), jamais d'appel live à chaque affichage (comme TMDb).
- Mettre à jour `docs/AVANCEMENT.md` (tableau + entrée datée 2026-07-15) dans le dernier commit.
- Commits fréquents, un par tâche.

---

### Task 1: Modèle de données (migration Prisma)

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (modèles `Media`, `UserMediaStatus` ; nouveau modèle `Game`)
- Create (généré) : `apps/server/prisma/migrations/<timestamp>_add_games/migration.sql`

**Interfaces:**
- Produces: table `Game { id, mediaId (unique), platforms?, developer?, publisher?, gameModes?, steamAppId?, parentGameId?, isDlc }`; colonnes `Media.igdbId?`, `UserMediaStatus.playtimeMinutes?`; relations `Media.game Game?` et self-relation `GameDlc`.

- [ ] **Step 1: Ajouter les champs au schéma**

Dans `apps/server/prisma/schema.prisma` :

1. Dans `model Media`, après `imdbId String?` ajouter :
```prisma
  igdbId            String?
```
et dans la liste des relations (près de `show Show?` / `movie Movie?`) ajouter :
```prisma
  game              Game?
  dlcParents        Game[]    @relation("GameDlc")
```

2. Dans `model UserMediaStatus`, après `rating Float?` ajouter :
```prisma
  playtimeMinutes Int?
```

3. Nouveau modèle (après `model Movie`) :
```prisma
model Game {
  id           String   @id @default(cuid())
  mediaId      String   @unique
  media        Media    @relation(fields: [mediaId], references: [id], onDelete: Cascade)

  platforms    String?
  developer    String?
  publisher    String?
  gameModes    String?
  steamAppId   String?
  isDlc        Boolean  @default(false)

  parentGameId String?
  parentGame   Media?   @relation("GameDlc", fields: [parentGameId], references: [id], onDelete: SetNull)

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([steamAppId])
  @@index([parentGameId])
}
```

- [ ] **Step 2: Générer la migration**

Run: `cd apps/server && corepack pnpm exec prisma migrate dev --name add_games`
Expected: crée `migrations/<ts>_add_games/`, applique sur la DB de dev, régénère le client Prisma sans erreur.

- [ ] **Step 3: Vérifier la compilation du client**

Run: `cd apps/server && corepack pnpm exec tsc --noEmit`
Expected: 0 erreur (les nouveaux champs/relations existent dans `@prisma/client`).

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(games): modèle Game + Media.igdbId + UserMediaStatus.playtimeMinutes"
```

---

### Task 2: Config env (Twitch/IGDB + Steam)

**Files:**
- Modify: `apps/server/src/config/env.ts` (schéma zod)
- Modify: `apps/server/.env.example` (si présent) + `docs/ONBOARDING.md` (doc des clés)

**Interfaces:**
- Produces: `env.TWITCH_CLIENT_ID`, `env.TWITCH_CLIENT_SECRET`, `env.IGDB_ENABLED` (string `'true'`/`'false'`), `env.STEAM_API_KEY`.

- [ ] **Step 1: Ajouter les variables au schéma**

Dans `apps/server/src/config/env.ts`, dans `envSchema` (près de `TVDB_API_KEY`) ajouter :
```ts
  TWITCH_CLIENT_ID: z.string().default(''),
  TWITCH_CLIENT_SECRET: z.string().default(''),
  IGDB_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  STEAM_API_KEY: z.string().default(''),
```
(Suivre exactement le style de `TVDB_ENABLED` pour le parse booléen explicite.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/server && corepack pnpm exec tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 3: Documenter**

Dans `docs/ONBOARDING.md` (section clés API) et `CLAUDE.md` (bloc TVDB), ajouter une ligne :
```
Jeux : TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (IGDB via Twitch, IGDB_ENABLED=true) ; STEAM_API_KEY (import Steam). Voir docs/superpowers/specs/2026-07-15-jeux-video-design.md.
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/config/env.ts docs/ONBOARDING.md CLAUDE.md
git commit -m "feat(games): variables d'env IGDB (Twitch) + Steam"
```

---

### Task 3: Provider IGDB — client + mapper

**Files:**
- Create: `apps/server/src/services/igdb/client.ts`
- Create: `apps/server/src/services/igdb/index.ts`
- Test: `apps/server/src/__tests__/igdb-mapper.test.ts`

**Interfaces:**
- Consumes: `env` (`../../config/env.js`), `prisma` (`../../db/client.js`).
- Produces:
  ```ts
  export function igdbEnabled(): boolean;
  export type IgdbGame = { id: number; name: string; summary?: string; first_release_date?: number;
    cover?: { image_id: string }; artworks?: { image_id: string }[]; genres?: { name: string }[];
    platforms?: { name: string }[]; involved_companies?: { developer: boolean; publisher: boolean; company: { name: string } }[];
    game_modes?: { name: string }[]; total_rating?: number; total_rating_count?: number;
    release_dates?: { date?: number; human?: string; platform?: { name: string } }[];
    dlcs?: { id: number; name: string }[]; expansions?: { id: number; name: string }[] };
  export async function igdbSearch(q: string): Promise<IgdbGame[]>;
  export async function igdbGame(id: number): Promise<IgdbGame | null>;
  export async function igdbPopular(): Promise<IgdbGame[]>;
  export async function igdbUpcoming(): Promise<IgdbGame[]>;
  export function igdbImageUrl(imageId: string, size?: string): string; // t_cover_big par défaut
  export function igdbToMedia(g: IgdbGame): { media: {...}; game: {...}; dlcNames: string[] };
  ```

- [ ] **Step 1: Écrire le test du mapper (pur, sans réseau)**

Créer `apps/server/src/__tests__/igdb-mapper.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { igdbToMedia, igdbImageUrl } from '../services/igdb/index.js';

describe('igdbToMedia', () => {
  it('mappe un jeu IGDB vers Media + Game', () => {
    const g = {
      id: 1942,
      name: 'The Witcher 3',
      summary: 'RPG',
      first_release_date: 1431993600, // 2015-05-19
      cover: { image_id: 'co1wyy' },
      genres: [{ name: 'RPG' }, { name: 'Adventure' }],
      platforms: [{ name: 'PC' }, { name: 'PS4' }],
      involved_companies: [
        { developer: true, publisher: false, company: { name: 'CD Projekt RED' } },
        { developer: false, publisher: true, company: { name: 'CD Projekt' } },
      ],
      game_modes: [{ name: 'Single player' }],
      total_rating: 93.2,
      total_rating_count: 4000,
      dlcs: [{ id: 55, name: 'Hearts of Stone' }],
    };
    const out = igdbToMedia(g);
    expect(out.media.igdbId).toBe('1942');
    expect(out.media.title).toBe('The Witcher 3');
    expect(out.media.year).toBe(2015);
    expect(out.media.posterPath).toBe(igdbImageUrl('co1wyy'));
    expect(out.media.genres).toBe('RPG, Adventure');
    expect(Math.round(out.media.voteAverage!)).toBe(93);
    expect(out.game.platforms).toBe('PC, PS4');
    expect(out.game.developer).toBe('CD Projekt RED');
    expect(out.game.publisher).toBe('CD Projekt');
    expect(out.game.gameModes).toBe('Single player');
    expect(out.dlcNames).toEqual(['Hearts of Stone']);
  });

  it('gère les champs manquants sans planter', () => {
    const out = igdbToMedia({ id: 7, name: 'Minimal' });
    expect(out.media.igdbId).toBe('7');
    expect(out.media.posterPath).toBeNull();
    expect(out.game.platforms).toBeNull();
    expect(out.dlcNames).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `cd apps/server && corepack pnpm exec vitest run src/__tests__/igdb-mapper.test.ts`
Expected: FAIL — module `../services/igdb/index.js` introuvable.

- [ ] **Step 3: Écrire le client + mapper**

Créer `apps/server/src/services/igdb/client.ts` :
```ts
import { env } from '../../config/env.js';
import { prisma } from '../../db/client.js';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_BASE = 'https://api.igdb.com/v4';

export function igdbEnabled(): boolean {
  return env.IGDB_ENABLED && Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);
}

// Jeton d'app Twitch (client credentials) mis en cache mémoire jusqu'à expiration.
let cachedToken: { value: string; expiresAt: number } | null = null;
async function twitchToken(): Promise<string | null> {
  if (!igdbEnabled()) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const body = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  try {
    const res = await fetch(TOKEN_URL, { method: 'POST', body });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedToken.value;
  } catch {
    return null;
  }
}

// Requête Apicalypse POST + cache ApiCache (source 'igdb'), TTL configurable.
export async function igdbQuery<T>(endpoint: string, apicalypse: string, ttlMs: number): Promise<T | null> {
  if (!igdbEnabled()) return null;
  const cacheKey = `${endpoint}:${apicalypse}`;
  const cached = await prisma.apiCache.findUnique({
    where: { source_cacheKey: { source: 'igdb', cacheKey } },
  });
  if (cached && cached.expiresAt > new Date()) return JSON.parse(cached.responseJson) as T;

  const token = await twitchToken();
  if (!token) return cached ? (JSON.parse(cached.responseJson) as T) : null;
  try {
    const res = await fetch(`${IGDB_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Client-ID': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
      body: apicalypse,
    });
    if (!res.ok) return cached ? (JSON.parse(cached.responseJson) as T) : null;
    const data = (await res.json()) as T;
    await prisma.apiCache.upsert({
      where: { source_cacheKey: { source: 'igdb', cacheKey } },
      create: { source: 'igdb', cacheKey, responseJson: JSON.stringify(data), expiresAt: new Date(Date.now() + ttlMs) },
      update: { responseJson: JSON.stringify(data), expiresAt: new Date(Date.now() + ttlMs) },
    });
    return data;
  } catch {
    return cached ? (JSON.parse(cached.responseJson) as T) : null;
  }
}
```

Créer `apps/server/src/services/igdb/index.ts` :
```ts
import { igdbQuery, igdbEnabled } from './client.js';
export { igdbEnabled };

const DAY = 86_400_000;

export type IgdbGame = {
  id: number;
  name: string;
  summary?: string;
  first_release_date?: number;
  cover?: { image_id: string };
  artworks?: { image_id: string }[];
  genres?: { name: string }[];
  platforms?: { name: string }[];
  involved_companies?: { developer: boolean; publisher: boolean; company: { name: string } }[];
  game_modes?: { name: string }[];
  total_rating?: number;
  total_rating_count?: number;
  release_dates?: { date?: number; human?: string; platform?: { name: string } }[];
  dlcs?: { id: number; name: string }[];
  expansions?: { id: number; name: string }[];
};

// Champs demandés à IGDB (Apicalypse). Réutilisé par search/game/popular/upcoming.
const FIELDS =
  'fields name,summary,first_release_date,cover.image_id,artworks.image_id,genres.name,' +
  'platforms.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,' +
  'game_modes.name,total_rating,total_rating_count,release_dates.date,release_dates.human,release_dates.platform.name,' +
  'dlcs.name,expansions.name';

export function igdbImageUrl(imageId: string, size = 't_cover_big'): string {
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

export async function igdbSearch(q: string): Promise<IgdbGame[]> {
  const body = `search "${q.replace(/"/g, '')}"; ${FIELDS}; where category = 0; limit 30;`;
  return (await igdbQuery<IgdbGame[]>('games', body, DAY)) ?? [];
}

export async function igdbGame(id: number): Promise<IgdbGame | null> {
  const body = `${FIELDS}; where id = ${id};`;
  const r = await igdbQuery<IgdbGame[]>('games', body, 7 * DAY);
  return r && r.length ? r[0]! : null;
}

export async function igdbPopular(): Promise<IgdbGame[]> {
  const body = `${FIELDS}; where total_rating_count > 200 & category = 0; sort total_rating desc; limit 30;`;
  return (await igdbQuery<IgdbGame[]>('games', body, DAY)) ?? [];
}

export async function igdbUpcoming(): Promise<IgdbGame[]> {
  const now = Math.floor(Date.now() / 1000);
  const body = `${FIELDS}; where first_release_date > ${now} & category = 0; sort first_release_date asc; limit 30;`;
  return (await igdbQuery<IgdbGame[]>('games', body, DAY)) ?? [];
}

export function igdbToMedia(g: IgdbGame) {
  const norm = (arr?: { name: string }[]) => (arr && arr.length ? arr.map((x) => x.name).join(', ') : null);
  const dev = g.involved_companies?.find((c) => c.developer)?.company.name ?? null;
  const pub = g.involved_companies?.find((c) => c.publisher)?.company.name ?? null;
  const release = g.first_release_date ? new Date(g.first_release_date * 1000) : null;
  return {
    media: {
      type: 'game' as const,
      igdbId: String(g.id),
      title: g.name,
      overview: g.summary ?? null,
      posterPath: g.cover ? igdbImageUrl(g.cover.image_id) : null,
      backdropPath: g.artworks?.length ? igdbImageUrl(g.artworks[0]!.image_id, 't_1080p') : null,
      releaseDate: release,
      year: release ? release.getFullYear() : null,
      genres: norm(g.genres),
      voteAverage: typeof g.total_rating === 'number' ? g.total_rating : null,
      voteCount: typeof g.total_rating_count === 'number' ? g.total_rating_count : null,
    },
    game: {
      platforms: norm(g.platforms),
      developer: dev,
      publisher: pub,
      gameModes: norm(g.game_modes),
    },
    dlcNames: (g.dlcs ?? []).map((d) => d.name),
  };
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `cd apps/server && corepack pnpm exec vitest run src/__tests__/igdb-mapper.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/igdb/ apps/server/src/__tests__/igdb-mapper.test.ts
git commit -m "feat(games): provider IGDB (auth Twitch, requêtes Apicalypse, mapper)"
```

---

### Task 4: Module games — ensureGameFromIgdb + search/add/library/status/detail

**Files:**
- Create: `apps/server/src/modules/games/routes.ts`
- Modify: `apps/server/src/app.ts` (enregistrer `gamesRoutes`)
- Test: `apps/server/src/__tests__/games.test.ts`

**Interfaces:**
- Consumes: `igdbGame`, `igdbSearch`, `igdbToMedia` (Task 3), `prisma`, `requireAuth`.
- Produces: routes `GET /api/games/search`, `POST /api/games/add-from-igdb`, `GET /api/games`, `POST /api/games/:id/status`, `GET /api/games/:id`, `DELETE /api/games/:id/tracking`. Helper `ensureGameFromIgdb(igdbId: string)` créant/à-jour `Media`+`Game`.

- [ ] **Step 1: Test (bibliothèque groupée par statut)**

Créer `apps/server/src/__tests__/games.test.ts` (bootstrap identique à `social.test.ts` : migrate deploy + `buildApp`, TMDB/TVDB off). Le test crée directement un jeu local et vérifie le regroupement de `/api/games` :
```ts
// … bootstrap register('Alice', …) …
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
  const res = await app.inject({ method: 'POST', url: `/api/games/${g.id}/status`, payload: { status: 'completed' }, headers: bearer('Alice') });
  expect(res.statusCode).toBe(200);
  const lib = await app.inject({ method: 'GET', url: '/api/games', headers: bearer('Alice') });
  expect(lib.json().completed.map((m: { title: string }) => m.title)).toContain('Halo');
  expect(lib.json().playing).toEqual([]);
});
```

- [ ] **Step 2: Lancer → échec**

Run: `cd apps/server && corepack pnpm exec vitest run src/__tests__/games.test.ts`
Expected: FAIL — routes 404 (module non enregistré).

- [ ] **Step 3: Écrire le module**

Créer `apps/server/src/modules/games/routes.ts` :
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { requireAuth } from '../auth/middleware.js'; // ADAPTER au chemin réel de requireAuth (voir shows/routes.ts)
import { igdbGame, igdbSearch, igdbToMedia, igdbImageUrl } from '../../services/igdb/index.js';

const GAME_STATUSES = ['wishlist', 'playing', 'completed', 'abandoned'] as const;

// Crée/à-jour le Media (type game) + Game à partir d'un id IGDB. Miroir de ensureMediaFromTmdb.
export async function ensureGameFromIgdb(igdbId: string) {
  const existing = await prisma.media.findFirst({ where: { type: 'game', igdbId }, include: { game: true } });
  const g = await igdbGame(Number(igdbId));
  if (!g) return existing; // offline/quota → renvoie l'existant si on l'a déjà
  const { media, game } = igdbToMedia(g);
  if (existing) {
    await prisma.media.update({ where: { id: existing.id }, data: { ...media, lastSyncedAt: new Date() } });
    await prisma.game.upsert({ where: { mediaId: existing.id }, create: { mediaId: existing.id, ...game }, update: game });
    return prisma.media.findUnique({ where: { id: existing.id }, include: { game: true } });
  }
  const created = await prisma.media.create({ data: { ...media, lastSyncedAt: new Date(), game: { create: game } }, include: { game: true } });
  return created;
}

function serializeGame(m: { id: string; title: string; posterPath: string | null; year: number | null; voteAverage: number | null; igdbId: string | null; game?: { platforms: string | null } | null }, status?: { status: string; playtimeMinutes: number | null } | null) {
  return {
    id: m.id, title: m.title, posterPath: m.posterPath, year: m.year,
    voteAverage: m.voteAverage, igdbId: m.igdbId,
    platforms: m.game?.platforms ?? null,
    userStatus: status?.status ?? null,
    playtimeMinutes: status?.playtimeMinutes ?? null,
  };
}

export async function gamesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/games/search', async (request) => {
    const { q } = z.object({ q: z.string().default('') }).parse(request.query ?? {});
    if (q.trim().length < 2) return { results: [] };
    const games = await igdbSearch(q.trim());
    return {
      results: games.map((g) => ({
        igdbId: String(g.id), title: g.name,
        year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
        posterPath: g.cover ? igdbImageUrl(g.cover.image_id) : null,
      })),
    };
  });

  app.post('/api/games/add-from-igdb', async (request) => {
    const { igdbId, status } = z.object({ igdbId: z.string(), status: z.enum(GAME_STATUSES).optional() }).parse(request.body);
    const media = await ensureGameFromIgdb(igdbId);
    if (!media) return { mediaId: null };
    if (status) {
      await prisma.userMediaStatus.upsert({
        where: { userId_mediaId: { userId: request.userId, mediaId: media.id } },
        create: { userId: request.userId, mediaId: media.id, status },
        update: { status },
      });
    }
    return { mediaId: media.id };
  });

  app.get('/api/games', async (request) => {
    const rows = await prisma.userMediaStatus.findMany({
      where: { userId: request.userId, media: { type: 'game' }, isHidden: false },
      include: { media: { include: { game: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const groups: Record<string, ReturnType<typeof serializeGame>[]> = { wishlist: [], playing: [], completed: [], abandoned: [] };
    for (const r of rows) {
      const bucket = groups[r.status];
      if (bucket) bucket.push(serializeGame(r.media, r));
    }
    return groups;
  });

  app.post('/api/games/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = z.object({ status: z.enum(GAME_STATUSES) }).parse(request.body);
    const media = await prisma.media.findFirst({ where: { id, type: 'game' } });
    if (!media) return reply.code(404).send({ error: 'not_found' });
    await prisma.userMediaStatus.upsert({
      where: { userId_mediaId: { userId: request.userId, mediaId: id } },
      create: { userId: request.userId, mediaId: id, status },
      update: { status },
    });
    return { ok: true };
  });

  app.delete('/api/games/:id/tracking', async (request) => {
    const { id } = request.params as { id: string };
    await prisma.userMediaStatus.deleteMany({ where: { userId: request.userId, mediaId: id } });
    return { ok: true };
  });

  app.get('/api/games/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const media = await prisma.media.findFirst({ where: { id, type: 'game' }, include: { game: true } });
    if (!media) return reply.code(404).send({ error: 'not_found' });
    // Enrichissement paresseux : si jamais synchronisé, on complète via IGDB.
    if (media.igdbId && !media.lastSyncedAt) await ensureGameFromIgdb(media.igdbId);
    const fresh = await prisma.media.findUnique({ where: { id }, include: { game: true } });
    const status = await prisma.userMediaStatus.findUnique({ where: { userId_mediaId: { userId: request.userId, mediaId: id } } });
    return {
      ...serializeGame(fresh!, status),
      overview: fresh!.overview, backdropPath: fresh!.backdropPath,
      developer: fresh!.game?.developer ?? null, publisher: fresh!.game?.publisher ?? null,
      gameModes: fresh!.game?.gameModes ?? null, releaseDate: fresh!.releaseDate?.toISOString() ?? null,
    };
  });
}
```
> **Note d'implémentation :** vérifier le chemin exact de `requireAuth` (regarder l'import en tête de `apps/server/src/modules/shows/routes.ts`) et l'adapter. Vérifier aussi que `Media.voteCount`/`lastSyncedAt` existent (ils existent, cf. schéma).

- [ ] **Step 4: Enregistrer le module**

Dans `apps/server/src/app.ts`, à côté des autres `await app.register(...)` (ex. `showsRoutes`), ajouter :
```ts
import { gamesRoutes } from './modules/games/routes.js';
// …
await app.register(gamesRoutes);
```

- [ ] **Step 5: Lancer → succès + suite complète**

Run: `cd apps/server && corepack pnpm exec vitest run src/__tests__/games.test.ts` puis `corepack pnpm test`
Expected: nouveaux tests PASS, aucune régression.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/games/ apps/server/src/app.ts apps/server/src/__tests__/games.test.ts
git commit -m "feat(games): module games (search/add/library/status/detail)"
```

---

### Task 5: Découverte + sorties/DLC à venir

**Files:**
- Modify: `apps/server/src/modules/games/routes.ts` (2 routes)
- Test: `apps/server/src/__tests__/games.test.ts` (ajout : `/upcoming` renvoie une structure vide sans planter quand IGDB off)

**Interfaces:**
- Produces: `GET /api/games/discover` → `{ popular: GameCard[]; upcoming: GameCard[] }` ; `GET /api/games/upcoming` → `{ groups: { label: string; items: GameCard[] }[] }` (jeux suivis dont une sortie/DLC arrive).

- [ ] **Step 1: Test (structure /upcoming sans IGDB)**

Ajouter à `games.test.ts` :
```ts
it('/api/games/upcoming renvoie des groupes (vide si aucun suivi à venir)', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/games/upcoming', headers: bearer('Alice') });
  expect(res.statusCode).toBe(200);
  expect(Array.isArray(res.json().groups)).toBe(true);
});
```

- [ ] **Step 2: Lancer → échec** (`/upcoming` 404). Run identique à Task 4 Step 5.

- [ ] **Step 3: Implémenter les 2 routes**

Dans `gamesRoutes`, ajouter :
```ts
  app.get('/api/games/discover', async () => {
    const { igdbPopular, igdbUpcoming, igdbImageUrl } = await import('../../services/igdb/index.js');
    const card = (g: { id: number; name: string; first_release_date?: number; cover?: { image_id: string } }) => ({
      igdbId: String(g.id), title: g.name,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
      posterPath: g.cover ? igdbImageUrl(g.cover.image_id) : null,
    });
    const [popular, upcoming] = await Promise.all([igdbPopular(), igdbUpcoming()]);
    return { popular: popular.map(card), upcoming: upcoming.map(card) };
  });

  // Sorties + DLC à venir des jeux SUIVIS, groupés par date (miroir de /api/shows/upcoming).
  app.get('/api/games/upcoming', async (request) => {
    const rows = await prisma.userMediaStatus.findMany({
      where: { userId: request.userId, media: { type: 'game' }, isHidden: false },
      include: { media: { include: { game: true } } },
    });
    const now = Date.now();
    const upcoming = rows
      .map((r) => r.media)
      .filter((m) => m.releaseDate && m.releaseDate.getTime() > now)
      .sort((a, b) => (a.releaseDate!.getTime() - b.releaseDate!.getTime()));
    // Groupage simple par mois (JJ/MM/AAAA détaillé côté client).
    const groups = new Map<string, { id: string; title: string; posterPath: string | null; releaseDate: string }[]>();
    for (const m of upcoming) {
      const d = m.releaseDate!;
      const label = `${d.toLocaleString('fr-FR', { month: 'long' })} ${d.getFullYear()}`;
      const arr = groups.get(label) ?? [];
      arr.push({ id: m.id, title: m.title, posterPath: m.posterPath, releaseDate: d.toISOString() });
      groups.set(label, arr);
    }
    return { groups: [...groups.entries()].map(([label, items]) => ({ label, items })) };
  });
```
> DLC à venir : en V1, les DLC suivis (créés comme `Media type=game`, `Game.isDlc=true`, `parentGameId`) remontent naturellement via leur `releaseDate`. L'extraction/rattachement des DLC IGDB au moment de l'ajout d'un jeu est V2 (les noms de DLC sont déjà affichés sur la fiche via `igdbToMedia().dlcNames`).

- [ ] **Step 4: Lancer → succès.** Run identique. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/games/routes.ts apps/server/src/__tests__/games.test.ts
git commit -m "feat(games): découverte (populaires/à venir) + sorties suivies à venir"
```

---

### Task 6: Import Steam (service + endpoints)

**Files:**
- Create: `apps/server/src/services/steam/steam.ts`
- Modify: `apps/server/src/modules/games/routes.ts` (2 routes Steam)
- Test: `apps/server/src/__tests__/steam-import.test.ts`

**Interfaces:**
- Consumes: `env.STEAM_API_KEY`, `prisma`.
- Produces: `steamEnabled()`, `steamResolveVanity(input)`, `steamOwnedGames(steamId)` → `{ appid: number; name: string; playtime_forever: number; img_icon_url: string }[]` ; routes `POST /api/games/steam/import { steamId }` → `{ imported: number }`.

- [ ] **Step 1: Test (mapping owned→Media, sans réseau)**

L'import est testé via un helper pur `steamGameToMedia(g)` (créé dans le service) pour éviter le réseau :
```ts
import { describe, expect, it } from 'vitest';
import { steamGameToMedia } from '../services/steam/steam.js';

describe('steamGameToMedia', () => {
  it('mappe un jeu Steam possédé vers Media+Game (statut selon temps de jeu)', () => {
    const played = steamGameToMedia({ appid: 570, name: 'Dota 2', playtime_forever: 120, img_icon_url: 'abc' });
    expect(played.media.title).toBe('Dota 2');
    expect(played.media.type).toBe('game');
    expect(played.game.steamAppId).toBe('570');
    expect(played.status).toBe('playing');
    expect(played.playtimeMinutes).toBe(120);
    const unplayed = steamGameToMedia({ appid: 999, name: 'Never Played', playtime_forever: 0, img_icon_url: '' });
    expect(unplayed.status).toBe('wishlist');
  });
});
```

- [ ] **Step 2: Lancer → échec.** Run: `cd apps/server && corepack pnpm exec vitest run src/__tests__/steam-import.test.ts` → FAIL (module absent).

- [ ] **Step 3: Écrire le service Steam**

Créer `apps/server/src/services/steam/steam.ts` :
```ts
import { env } from '../../config/env.js';

export function steamEnabled(): boolean {
  return Boolean(env.STEAM_API_KEY);
}

export type SteamOwnedGame = { appid: number; name: string; playtime_forever: number; img_icon_url: string };

// Header Steam d'un jeu (jaquette). Fiable sans clé.
export function steamHeader(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

export function steamGameToMedia(g: SteamOwnedGame) {
  return {
    media: { type: 'game' as const, title: g.name, posterPath: steamHeader(g.appid) },
    game: { steamAppId: String(g.appid) },
    status: g.playtime_forever > 0 ? ('playing' as const) : ('wishlist' as const),
    playtimeMinutes: g.playtime_forever,
  };
}

// Accepte un SteamID64 ou une URL/pseudo vanity (steamcommunity.com/id/xxx). Renvoie le SteamID64.
export async function steamResolveVanity(input: string): Promise<string | null> {
  if (!steamEnabled()) return null;
  const raw = input.trim().replace(/\/+$/, '');
  const idMatch = raw.match(/(\d{17})$/);
  if (idMatch) return idMatch[1]!;
  const vanity = raw.split('/').pop() ?? raw;
  try {
    const res = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${env.STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { response: { success: number; steamid?: string } };
    return data.response.success === 1 ? data.response.steamid ?? null : null;
  } catch {
    return null;
  }
}

export async function steamOwnedGames(steamId: string): Promise<SteamOwnedGame[]> {
  if (!steamEnabled()) return [];
  try {
    const res = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${env.STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { response: { games?: SteamOwnedGame[] } };
    return data.response.games ?? [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Lancer → succès.** Run identique → PASS.

- [ ] **Step 5: Endpoints d'import**

Dans `gamesRoutes` (Task 4 file), ajouter :
```ts
  app.post('/api/games/steam/import', async (request) => {
    const { steamId } = z.object({ steamId: z.string().min(2) }).parse(request.body);
    const { steamResolveVanity, steamOwnedGames, steamGameToMedia } = await import('../../services/steam/steam.js');
    const id64 = await steamResolveVanity(steamId);
    if (!id64) return { imported: 0, error: 'steam_id_invalide' };
    const owned = await steamOwnedGames(id64);
    let imported = 0;
    for (const g of owned) {
      const mapped = steamGameToMedia(g);
      // Un jeu par steamAppId (via Game). Cherche l'existant, sinon crée.
      const existingGame = await prisma.game.findFirst({ where: { steamAppId: mapped.game.steamAppId } });
      let mediaId = existingGame?.mediaId ?? null;
      if (!mediaId) {
        const created = await prisma.media.create({ data: { ...mapped.media, game: { create: mapped.game } } });
        mediaId = created.id;
      }
      await prisma.userMediaStatus.upsert({
        where: { userId_mediaId: { userId: request.userId, mediaId } },
        create: { userId: request.userId, mediaId, status: mapped.status, playtimeMinutes: mapped.playtimeMinutes },
        update: { playtimeMinutes: mapped.playtimeMinutes },
      });
      imported += 1;
    }
    return { imported };
  });
```
> Note : on ne remplace pas un statut déjà posé par l'utilisateur (update ne touche que `playtimeMinutes`). Enrichissement IGDB paresseux à l'ouverture de la fiche (le nom Steam permettra un matching IGDB en V2 ; en V1 la fiche affiche les données Steam).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/steam/ apps/server/src/modules/games/routes.ts apps/server/src/__tests__/steam-import.test.ts
git commit -m "feat(games): import bibliothèque Steam (owned games + temps de jeu)"
```

---

### Task 7: Mobile — onglet « Jeux » + bibliothèque

**Files:**
- Create: `mobile/app/(tabs)/games.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` (ajouter l'onglet, ordre Séries/Films/Jeux/Explorer/Profil)

**Interfaces:**
- Consumes: `GET /api/games`, `GET /api/games/discover` (Task 4/5) ; `api`, `tmdbImage` (posterPath est déjà une URL absolue IGDB/Steam → `tmdbImage` la renvoie telle quelle).
- Produces: écran onglet Jeux (bibliothèque groupée + accès découverte).

- [ ] **Step 1: Enregistrer l'onglet**

Dans `mobile/app/(tabs)/_layout.tsx`, ajouter entre `movies` et `explore` :
```tsx
      <Tabs.Screen name="games" options={{ title: 'Jeux' }} />
```
(Vérifier l'icône : ces `Tabs.Screen` reçoivent probablement une icône via `screenOptions`/`tabBarIcon` ailleurs — suivre le même mécanisme que `movies`. Utiliser l'icône Feather la plus proche d'une manette, ex. `"target"` ou, si dispo, un set incluant `gamepad`. À défaut, réutiliser un ionicon `game-controller` comme le fait déjà l'app si elle mélange les sets.)

- [ ] **Step 2: Écran Jeux (bibliothèque + entrée découverte)**

Créer `mobile/app/(tabs)/games.tsx` en **miroir de `mobile/app/(tabs)/movies.tsx`** (même structure d'écran : header, sections, grille de jaquettes, pull-to-refresh). Adaptations :
- Requête : `useQuery(['games','library'], () => api.get('/api/games'))` → sections **VOULUS** (`wishlist`), **EN COURS** (`playing`), **TERMINÉS** (`completed`), **ABANDONNÉS** (`abandoned`).
- Chaque carte = jaquette (`tmdbImage(posterPath)`, ratio 2/3, `RADIUS.poster`) + titre ; tap → `router.push('/game/'+id)`.
- Bouton/section « Découvrir » en tête → `router.push` vers un sous-écran ou affiche `GET /api/games/discover` (Populaires / À venir) sous la bibliothèque quand elle est vide.
- Utiliser `FONTS.x`, `COLORS.x` ; **jamais** `fontWeight`.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck` → 0 erreur.

- [ ] **Step 4: Vérif manuelle (web)**

Run: `cd mobile && npm run web` → l'onglet « Jeux » apparaît ; la bibliothèque se charge (vide au début) ; la découverte liste des jeux (si les clés IGDB sont configurées côté serveur).

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(tabs)/games.tsx" "mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(games): onglet Jeux + bibliothèque (Voulus/En cours/Terminés/Abandonnés)"
```

---

### Task 8: Mobile — fiche jeu + suivi + recherche

**Files:**
- Create: `mobile/app/game/[id].tsx`
- Modify: `mobile/app/(tabs)/games.tsx` (barre de recherche → `GET /api/games/search`)

**Interfaces:**
- Consumes: `GET /api/games/:id`, `POST /api/games/add-from-igdb`, `POST /api/games/:id/status`, `DELETE /api/games/:id/tracking`, `GET /api/games/search`.
- Produces: fiche jeu avec actions de suivi.

- [ ] **Step 1: Fiche jeu**

Créer `mobile/app/game/[id].tsx` en **miroir simplifié de `mobile/app/show/[id].tsx`** (header jaquette + infos + actions + `CommentsRowLink`). Contenu : titre, jaquette, résumé, plateformes, dev/éditeur, note, temps de jeu si présent, DLC (noms), sélecteur de statut (Voulus/En cours/Terminé/Abandonné → `POST /api/games/:id/status`), bouton « Retirer » (`DELETE …/tracking`), et `<CommentsRowLink mediaId={id} title={title} />` (composant existant, déjà générique). Optimiste + rollback comme les autres écrans.

- [ ] **Step 2: Recherche jeux dans l'onglet**

Dans `games.tsx`, ajouter une barre de recherche (réutiliser le style `searchbar` de `explore.tsx`) : `GET /api/games/search?q=` → liste de résultats ; taper un résultat → `POST /api/games/add-from-igdb { igdbId, status:'wishlist' }` puis `router.push('/game/'+mediaId)`.

- [ ] **Step 3: Typecheck** → `cd mobile && npm run typecheck` → 0 erreur.

- [ ] **Step 4: Vérif manuelle (web)** : rechercher un jeu → l'ajouter → il apparaît en Voulus → ouvrir la fiche → changer le statut → il change de section.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/game/[id].tsx" "mobile/app/(tabs)/games.tsx"
git commit -m "feat(games): fiche jeu + suivi + recherche/ajout depuis IGDB"
```

---

### Task 9: Mobile — découverte, à venir, connexion Steam

**Files:**
- Modify: `mobile/app/(tabs)/games.tsx` (sections Découverte + À venir)
- Modify: `mobile/app/settings.tsx` (bloc « Connecter Steam »)

**Interfaces:**
- Consumes: `GET /api/games/discover`, `GET /api/games/upcoming`, `POST /api/games/steam/import`.

- [ ] **Step 1: Découverte + À venir dans l'onglet Jeux**

Dans `games.tsx`, sous la bibliothèque : section **« Populaires »** + **« À venir »** (`GET /api/games/discover`) en carrousels horizontaux de jaquettes (taper → ajoute/ouvre la fiche) ; section **« Sorties à venir »** (`GET /api/games/upcoming`, groupée par `label`) pour les jeux suivis.

- [ ] **Step 2: Connexion Steam (réglages)**

Dans `mobile/app/settings.tsx`, ajouter un bloc « Jeux — Steam » : un `TextInput` (SteamID ou URL de profil) + bouton **« Importer ma bibliothèque »** → `POST /api/games/steam/import { steamId }` → afficher « N jeux importés » (ou l'erreur `steam_id_invalide`). Invalider `['games','library']` au succès.

- [ ] **Step 3: Typecheck** → 0 erreur.

- [ ] **Step 4: Vérif manuelle (web)** : Découverte/À venir s'affichent ; l'import Steam renvoie un compte (profil public requis).

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(tabs)/games.tsx" mobile/app/settings.tsx
git commit -m "feat(games): découverte + à venir + connexion/import Steam"
```

---

### Task 10: Notifications sorties/DLC + AVANCEMENT

**Files:**
- Modify: `apps/server/src/services/sync-worker.ts` (ou un balayage léger) — créer une `Notification` quand une sortie/DLC de jeu suivi arrive
- Modify: `docs/AVANCEMENT.md`

**Interfaces:**
- Consumes: modèle `Notification`, `UserMediaStatus` (jeux suivis avec `releaseDate` future proche).

- [ ] **Step 1: Balayage notifications sorties**

Dans le worker existant (`sync-worker.ts`), ajouter une passe : pour chaque `UserMediaStatus` d'un jeu (`media.type='game'`) dont `media.releaseDate` tombe **aujourd'hui**, créer une `Notification` (type `game_release`, message « <titre> sort aujourd'hui ») si elle n'existe pas déjà (dédupliquer par `(userId, mediaId, type)`). Suivre le format des notifications d'épisodes existantes (regarder comment les notifs séries sont créées).

- [ ] **Step 2: Typecheck serveur** → `cd apps/server && corepack pnpm exec tsc --noEmit` → 0 erreur.

- [ ] **Step 3: Mettre à jour AVANCEMENT**

Dans `docs/AVANCEMENT.md` : passer/ajouter une ligne « Jeux vidéo » au tableau « État par domaine » et une entrée datée :
```markdown
### 2026-07-15 — Onglet Jeux vidéo (V1)
- Domaine jeux calqué sur séries : Media.type=game + sous-table Game + provider IGDB + module games + UserMediaStatus (Voulus/En cours/Terminés/Abandonnés, temps de jeu).
- Fiche jeu, recherche/ajout IGDB, découverte (populaires/à venir), sorties & DLC à venir, import bibliothèque Steam, notifications de sortie.
- Config : TWITCH_CLIENT_ID/SECRET (IGDB), STEAM_API_KEY. HowLongToBeat & PlayStation = V2.
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/services/sync-worker.ts docs/AVANCEMENT.md
git commit -m "feat(games): notifications de sortie + journal d'avancement"
```

---

## Self-Review (effectuée)

**Couverture de la spec :**
- Modèle `Game` + `Media.igdbId` + `playtimeMinutes` → Task 1. ✅
- Config Twitch/Steam → Task 2. ✅
- Provider IGDB (auth, requêtes, mapper) → Task 3. ✅
- Module games (search/add/library/status/detail) → Task 4. ✅
- Découverte + sorties/DLC à venir → Task 5. ✅
- Import Steam → Task 6. ✅
- Onglet Jeux + biblio → Task 7. ✅
- Fiche jeu + suivi + recherche → Task 8. ✅
- Découverte/à venir/Steam UI → Task 9. ✅
- Notifications + AVANCEMENT → Task 10. ✅
- Statuts `wishlist/playing/completed/abandoned` cohérents Tasks 1/4/6/7/8. ✅
- Social réutilisé (`CommentsRowLink`) → Task 8. ✅

**Cohérence des types :** `igdbToMedia` (Task 3) consommé par `ensureGameFromIgdb` (Task 4) et le mapping `{media, game, dlcNames}` est stable. `steamGameToMedia` renvoie `{media, game, status, playtimeMinutes}` (Task 6) consommé par l'endpoint import. Les statuts jeux sont la même énumération partout.

**Points de vigilance (documentés) :** chemin exact de `requireAuth` à confirmer (Task 4) ; icône d'onglet à aligner sur le mécanisme réel du `_layout` (Task 7) ; rattachement des DLC IGDB = V2 (les noms de DLC sont affichés, mais leur suivi comme entités séparées viendra après). Matching Steam→IGDB = V2 (V1 affiche les données Steam + enrichit à l'ouverture).
