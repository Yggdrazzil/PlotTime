# Explorer TikTok — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'onglet Explorer par un flux vertical plein écran façon TikTok, unique et social (compteurs likes / déjà vu / commentaires), images en V1.

**Architecture:** Le serveur enrichit `/api/explore/feed` avec des compteurs sociaux agrégés (toute l'app) + l'état perso, via un helper `attachSocialStats` testable. Côté mobile, `explore.tsx` devient une coquille (recherche inchangée + nouveau flux) et le flux vit dans `mobile/components/explore/` (FlatList paginée verticale, cartes plein écran, rail d'actions, overlay de description, sheet commentaires). Le composant commentaires existant est factorisé pour être réutilisé.

**Tech Stack:** Fastify + Prisma (SQLite) côté serveur (vitest) ; React Native + Expo Router + @tanstack/react-query côté mobile (pas de test runner RN → `npm run typecheck` + vérif manuelle web).

## Global Constraints

- Police **Mulish** uniquement via `FONTS.x` (`mobile/lib/theme.ts`) — **jamais** `fontWeight`.
- Compatibilité **web ET natif** : la web app est l'export web du même projet Expo. Aucun module natif obligatoire en V1 ; tester sur web (`cd mobile && npm run web`).
- Gestionnaires : **`corepack pnpm`** pour le serveur/monorepo, **`npm`** pour `mobile/`.
- Serveur : TDD avec **vitest** (`cd apps/server && corepack pnpm test`). Mobile : pas de test runner → validation par **`cd mobile && npm run typecheck`** (doit passer) + vérification manuelle décrite dans chaque tâche.
- « Like » = ajout à « À voir » = `UserMediaStatus.status = 'watchlist'`. « Déjà vu » = `status = 'completed'`. « Dislike » = `isHidden`.
- Compteurs sociaux = **toute l'app** (tous utilisateurs), affichés sur **like / commentaire / déjà vu** uniquement.
- Mettre à jour **`docs/AVANCEMENT.md`** dans le dernier commit (tableau « État par domaine » + entrée datée 2026-07-10).
- Commits fréquents, un par tâche.

---

### Task 1: Serveur — compteurs sociaux sur `/api/explore/feed`

**Files:**
- Create: `apps/server/src/modules/search/socialStats.ts`
- Modify: `apps/server/src/modules/search/routes.ts` (type `SearchResult` ~ligne 9-23 ; endpoint `/api/explore/feed` ~ligne 324 `return { feed }`)
- Test: `apps/server/src/__tests__/explore-social-stats.test.ts`

**Interfaces:**
- Consumes: `prisma` depuis `../../db/client.js`.
- Produces:
  ```ts
  export type SocialStats = { likes: number; watched: number; comments: number };
  export type SocialMe = { liked: boolean; watched: boolean };
  export async function attachSocialStats<
    T extends { tmdbId: string | null; type: 'show' | 'movie' },
  >(items: T[], userId: string): Promise<(T & { stats: SocialStats; me: SocialMe })[]>;
  ```
  Chaque `FeedItem` renvoyé par `/api/explore/feed` porte désormais `stats` et `me`.

- [ ] **Step 1: Write the failing test**

Créer `apps/server/src/__tests__/explore-social-stats.test.ts` (copie le bootstrap d'un test existant, cf. `social.test.ts` lignes 1-45 pour `beforeAll`/`register`) :

```ts
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

const tmp = mkdtempSync(path.join(tmpdir(), 'serietime-social-stats-'));
process.env.DATABASE_URL = `file:${path.join(tmp, 'db.sqlite')}`;
process.env.NODE_ENV = 'test';
process.env.TMDB_API_KEY = '';
process.env.TVMAZE_ENABLED = 'false';
process.env.TVDB_ENABLED = 'false';

let app: FastifyInstance;
const tok: Record<string, string> = {};

async function register(name: string, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { displayName: name, email, password: 'secret123' },
  });
  expect(res.statusCode).toBe(200);
  tok[name] = res.json().token;
}

beforeAll(async () => {
  execSync('corepack pnpm exec prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    stdio: 'inherit',
  });
  const { buildApp } = await import('../app.js');
  app = await buildApp();
  await app.ready();
  await register('Alice', 'alice@test.dev');
  await register('Bob', 'bob@test.dev');
});

afterAll(async () => {
  await app.close();
});

describe('attachSocialStats', () => {
  it('agrège likes/watched/comments sur toute l’app + état perso', async () => {
    const { prisma } = await import('../db/client.js');
    const { attachSocialStats } = await import('../modules/search/socialStats.js');

    // Un film local partagé, avec un tmdbId connu.
    const movie = await prisma.media.create({
      data: { type: 'movie', tmdbId: '4242', title: 'Film Test', year: 2020 },
    });
    const alice = await prisma.user.findFirstOrThrow({ where: { email: 'alice@test.dev' } });
    const bob = await prisma.user.findFirstOrThrow({ where: { email: 'bob@test.dev' } });

    // Alice : watchlist (like). Bob : completed (déjà vu). Bob : 1 commentaire.
    await prisma.userMediaStatus.create({ data: { userId: alice.id, mediaId: movie.id, status: 'watchlist' } });
    await prisma.userMediaStatus.create({ data: { userId: bob.id, mediaId: movie.id, status: 'completed' } });
    await prisma.comment.create({ data: { userId: bob.id, mediaId: movie.id, body: 'Top' } });

    const [enriched] = await attachSocialStats(
      [{ tmdbId: '4242', type: 'movie' as const, title: 'Film Test' }],
      alice.id,
    );

    expect(enriched.stats).toEqual({ likes: 1, watched: 1, comments: 1 });
    expect(enriched.me).toEqual({ liked: true, watched: false });
  });

  it('renvoie des zéros pour un item sans média local', async () => {
    const { attachSocialStats } = await import('../modules/search/socialStats.js');
    const alice = (await (await import('../db/client.js')).prisma.user.findFirstOrThrow({
      where: { email: 'alice@test.dev' },
    })).id;
    const [enriched] = await attachSocialStats([{ tmdbId: '999999', type: 'show' as const }], alice);
    expect(enriched.stats).toEqual({ likes: 0, watched: 0, comments: 0 });
    expect(enriched.me).toEqual({ liked: false, watched: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && corepack pnpm exec vitest run src/__tests__/explore-social-stats.test.ts`
Expected: FAIL — `Cannot find module '../modules/search/socialStats.js'`.

- [ ] **Step 3: Write the helper**

Créer `apps/server/src/modules/search/socialStats.ts` :

```ts
import { prisma } from '../../db/client.js';

export type SocialStats = { likes: number; watched: number; comments: number };
export type SocialMe = { liked: boolean; watched: boolean };

// Agrège, par média (matché sur tmdbId + type), les signaux sociaux de TOUTE
// l'app : likes = watchlist, watched = completed, comments = nombre de commentaires.
// `me` = l'état de l'utilisateur courant. Les cartes sans média local → zéros.
export async function attachSocialStats<
  T extends { tmdbId: string | null; type: 'show' | 'movie' },
>(items: T[], userId: string): Promise<(T & { stats: SocialStats; me: SocialMe })[]> {
  const zero = (it: T) => ({ ...it, stats: { likes: 0, watched: 0, comments: 0 }, me: { liked: false, watched: false } });

  const tmdbIds = [...new Set(items.map((i) => i.tmdbId).filter((v): v is string => Boolean(v)))];
  if (tmdbIds.length === 0) return items.map(zero);

  const medias = await prisma.media.findMany({
    where: { tmdbId: { in: tmdbIds } },
    select: { id: true, tmdbId: true, type: true },
  });
  // Clé tmdb:type → mediaId (une œuvre peut exister en show ET movie sous le même tmdbId).
  const keyOf = (tmdbId: string, type: string) => `${type}:${tmdbId}`;
  const mediaIdByKey = new Map<string, string>();
  for (const m of medias) if (m.tmdbId) mediaIdByKey.set(keyOf(m.tmdbId, m.type), m.id);
  const mediaIds = medias.map((m) => m.id);
  if (mediaIds.length === 0) return items.map(zero);

  const [likeRows, watchedRows, commentRows, mine] = await Promise.all([
    prisma.userMediaStatus.groupBy({
      by: ['mediaId'],
      where: { mediaId: { in: mediaIds }, status: 'watchlist', isHidden: false },
      _count: { _all: true },
    }),
    prisma.userMediaStatus.groupBy({
      by: ['mediaId'],
      where: { mediaId: { in: mediaIds }, status: 'completed', isHidden: false },
      _count: { _all: true },
    }),
    prisma.comment.groupBy({
      by: ['mediaId'],
      where: { mediaId: { in: mediaIds } },
      _count: { _all: true },
    }),
    prisma.userMediaStatus.findMany({
      where: { userId, mediaId: { in: mediaIds } },
      select: { mediaId: true, status: true },
    }),
  ]);

  const likeBy = new Map(likeRows.map((r) => [r.mediaId, r._count._all]));
  const watchedBy = new Map(watchedRows.map((r) => [r.mediaId, r._count._all]));
  const commentBy = new Map(commentRows.map((r) => [r.mediaId, r._count._all]));
  const myStatus = new Map(mine.map((r) => [r.mediaId, r.status]));

  return items.map((it) => {
    if (!it.tmdbId) return zero(it);
    const mediaId = mediaIdByKey.get(keyOf(it.tmdbId, it.type));
    if (!mediaId) return zero(it);
    const st = myStatus.get(mediaId);
    return {
      ...it,
      stats: {
        likes: likeBy.get(mediaId) ?? 0,
        watched: watchedBy.get(mediaId) ?? 0,
        comments: commentBy.get(mediaId) ?? 0,
      },
      me: { liked: st === 'watchlist', watched: st === 'completed' },
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && corepack pnpm exec vitest run src/__tests__/explore-social-stats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into the feed endpoint**

Dans `apps/server/src/modules/search/routes.ts` :

1. En tête de fichier, ajouter l'import :
```ts
import { attachSocialStats } from './socialStats.js';
```

2. Étendre le type `SearchResult` (bloc lignes 9-23) en ajoutant après `category?: ...` :
```ts
  // Signaux sociaux (toute l'app) + état perso — remplis par attachSocialStats sur le flux Explorer.
  stats?: { likes: number; watched: number; comments: number };
  me?: { liked: boolean; watched: boolean };
```

3. Dans `/api/explore/feed`, remplacer la dernière ligne `return { feed };` par :
```ts
    const withStats = await attachSocialStats(feed, request.userId);
    return { feed: withStats };
```

- [ ] **Step 6: Run the full server test suite**

Run: `cd apps/server && corepack pnpm test`
Expected: tous les tests passent (dont le nouveau fichier). Vérifie aussi qu'aucun test existant ne casse.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/search/socialStats.ts apps/server/src/modules/search/routes.ts apps/server/src/__tests__/explore-social-stats.test.ts
git commit -m "feat(explore): compteurs sociaux (likes/vus/commentaires) sur le flux"
```

---

### Task 2: Mobile — utilitaires `formatCount` + `shareMedia`

**Files:**
- Create: `mobile/lib/format.ts`
- Create: `mobile/lib/share.ts`

**Interfaces:**
- Produces:
  ```ts
  export function formatCount(n: number): string;                 // 0..999 → "12" ; 1200 → "1,2 K" ; 13400 → "13,4 K" ; 2_000_000 → "2 M"
  export function shareMedia(title: string, url?: string): void;  // web navigator.share/clipboard, natif Share.share
  ```

- [ ] **Step 1: Écrire `formatCount`**

Créer `mobile/lib/format.ts` :
```ts
// Compteurs sociaux compacts, format FR (séparateur virgule) façon TikTok.
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const v = n / 1000;
    return `${v.toFixed(v < 10 ? 1 : 0).replace('.', ',').replace(',0', '')} K`;
  }
  const v = n / 1_000_000;
  return `${v.toFixed(v < 10 ? 1 : 0).replace('.', ',').replace(',0', '')} M`;
}
```

- [ ] **Step 2: Écrire `shareMedia`**

Créer `mobile/lib/share.ts` (extrait du helper de `mobile/app/show/[id].tsx:132`) :
```ts
import { Platform, Share } from 'react-native';

// Partage cross-plateforme : web = Web Share API (ou copie presse-papier), natif = Share RN.
export function shareMedia(title: string, url?: string): void {
  const message = `Regarde « ${title} » — sur SerieTime 📺`;
  if (Platform.OS === 'web') {
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { share?: (d: object) => Promise<void> })
        : undefined;
    if (nav?.share) {
      nav.share({ title: 'SerieTime', text: message, url }).catch(() => undefined);
    } else if (nav?.clipboard) {
      nav.clipboard.writeText(`${message}${url ? ` ${url}` : ''}`).catch(() => undefined);
    }
    return;
  }
  Share.share({ message }).catch(() => undefined);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/format.ts mobile/lib/share.ts
git commit -m "feat(mobile): utils formatCount + shareMedia"
```

---

### Task 3: Mobile — factoriser le composant commentaires

Le flux et la fiche doivent partager le même rendu de commentaires (DRY). On extrait `CommentsTab` de `mobile/app/show/[id].tsx` vers un composant partagé.

**Files:**
- Create: `mobile/components/comments.tsx`
- Modify: `mobile/app/show/[id].tsx` (supprimer `CommentDto`, `REACT_EMOJIS`, `CommentsTab`, `cstyles` — lignes ~977-1180 ; ajouter un import ; les 2 usages `<CommentsTab mediaId=... />` restent)

**Interfaces:**
- Produces:
  ```ts
  export type CommentDto = { /* identique à l'actuel */ };
  export function CommentsTab({ mediaId }: { mediaId: string }): JSX.Element;
  ```

- [ ] **Step 1: Créer le composant partagé**

Créer `mobile/components/comments.tsx` en **déplaçant tel quel** depuis `show/[id].tsx` : le type `CommentDto`, la constante `REACT_EMOJIS`, la fonction `CommentsTab`, et le `StyleSheet` `cstyles`. Ajouter les imports nécessaires en tête :
```ts
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { COLORS, FONTS } from '@/lib/theme';
import { EmptyState, Loading } from '@/components/ui';

export type CommentDto = {
  id: string;
  body: string;
  createdAt: string;
  episodeId: string | null;
  parentId: string | null;
  user: { id: string; displayName: string; avatarUrl: string | null };
  isMine: boolean;
  reactions: { total: number; byEmoji: Record<string, number>; mine: string[] };
  replies?: CommentDto[];
};

const REACT_EMOJIS = ['❤️', '👍', '😂', '😮', '😢'];

export function CommentsTab({ mediaId }: { mediaId: string }) {
  /* corps identique à l'actuel (show/[id].tsx lignes 992-1113) */
}

const cstyles = StyleSheet.create({ /* identique à show/[id].tsx lignes 1115+ */ });
```

- [ ] **Step 2: Nettoyer `show/[id].tsx`**

Supprimer de `mobile/app/show/[id].tsx` : le type `CommentDto`, `REACT_EMOJIS`, la fonction `CommentsTab` et le `StyleSheet cstyles` (désormais dans le composant partagé). Ajouter l'import en tête :
```ts
import { CommentsTab } from '@/components/comments';
```
Vérifier que `useRouter` reste utilisé ailleurs dans le fichier ; sinon retirer l'import inutile.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: aucune erreur (les 2 `<CommentsTab mediaId=... />` résolvent l'import).

- [ ] **Step 4: Vérification manuelle**

Run: `cd mobile && npm run web`
Ouvrir une fiche série/film → onglet commentaires : la liste, la publication, les réactions et les réponses fonctionnent comme avant.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/comments.tsx "mobile/app/show/[id].tsx"
git commit -m "refactor(mobile): extraire CommentsTab dans un composant partagé"
```

---

### Task 4: Mobile — types du flux + hook `useResolveMedia`

**Files:**
- Create: `mobile/components/explore/types.ts`
- Create: `mobile/components/explore/useResolveMedia.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type FeedItem = {
    id: string | null; tmdbId: string | null; tvdbId: string | null;
    type: 'show' | 'movie'; category?: 'serie' | 'film' | 'anime';
    title: string; year: number | null;
    posterPath: string | null; backdropPath: string | null; overview: string | null;
    inLibrary: boolean;
    stats?: { likes: number; watched: number; comments: number };
    me?: { liked: boolean; watched: boolean };
  };
  export type FeedCategory = 'tout' | 'serie' | 'film' | 'anime';
  export const FEED_CATEGORIES: { key: FeedCategory; label: string }[];

  // useResolveMedia.ts
  export function useResolveMedia(): (item: FeedItem) => Promise<string>; // renvoie le mediaId local, mémoïsé
  ```

- [ ] **Step 1: Créer `types.ts`**

```ts
export type FeedItem = {
  id: string | null;
  tmdbId: string | null;
  tvdbId: string | null;
  type: 'show' | 'movie';
  category?: 'serie' | 'film' | 'anime';
  title: string;
  year: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  inLibrary: boolean;
  stats?: { likes: number; watched: number; comments: number };
  me?: { liked: boolean; watched: boolean };
};

export type FeedCategory = 'tout' | 'serie' | 'film' | 'anime';

export const FEED_CATEGORIES: { key: FeedCategory; label: string }[] = [
  { key: 'tout', label: 'TOUT' },
  { key: 'serie', label: 'SÉRIES' },
  { key: 'film', label: 'FILMS' },
  { key: 'anime', label: 'ANIMÉS' },
];

export const catOf = (f: FeedItem): FeedCategory =>
  f.category ?? (f.type === 'show' ? 'serie' : 'film');
```

- [ ] **Step 2: Créer `useResolveMedia.ts`**

Résout un item TMDb en `mediaId` local (sans le suivre), en mémoïsant par carte pour éviter les doubles résolutions lors d'actions successives.
```ts
import { useRef } from 'react';
import { api } from '@/lib/api';
import type { FeedItem } from './types';

export function useResolveMedia(): (item: FeedItem) => Promise<string> {
  // Cache clé (type:tmdbId) → mediaId, stable sur la vie du flux.
  const cache = useRef(new Map<string, string>()).current;
  const inflight = useRef(new Map<string, Promise<string>>()).current;

  return (item: FeedItem) => {
    if (item.id) return Promise.resolve(item.id);
    const key = `${item.type}:${item.tmdbId}`;
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached);
    const running = inflight.get(key);
    if (running) return running;

    const path =
      item.type === 'movie' ? '/api/movies/add-from-tmdb' : '/api/shows/add-from-tmdb';
    const p = api
      .post<{ mediaId: string }>(path, { tmdbId: item.tmdbId, follow: false })
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
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/explore/types.ts mobile/components/explore/useResolveMedia.ts
git commit -m "feat(mobile): types flux Explorer + hook useResolveMedia"
```

---

### Task 5: Mobile — `CommentsSheet`

Bottom sheet réutilisant `CommentsTab`. Résout le `mediaId` à l'ouverture.

**Files:**
- Create: `mobile/components/explore/CommentsSheet.tsx`

**Interfaces:**
- Consumes: `CommentsTab` (Task 3), `useResolveMedia` (Task 4), `FeedItem` (Task 4).
- Produces:
  ```ts
  export function CommentsSheet(props: {
    item: FeedItem | null;       // null = fermé
    onClose: () => void;
    resolveMedia: (item: FeedItem) => Promise<string>;
  }): JSX.Element;
  ```

- [ ] **Step 1: Créer le composant**

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '@/lib/theme';
import { CommentsTab } from '@/components/comments';
import type { FeedItem } from './types';

export function CommentsSheet({
  item,
  onClose,
  resolveMedia,
}: {
  item: FeedItem | null;
  onClose: () => void;
  resolveMedia: (item: FeedItem) => Promise<string>;
}) {
  const insets = useSafeAreaInsets();
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setMediaId(item.id ?? null);
    setError(false);
    if (!item.id) {
      resolveMedia(item)
        .then((id) => !cancelled && setMediaId(id))
        .catch(() => !cancelled && setError(true));
    }
    return () => {
      cancelled = true;
    };
  }, [item, resolveMedia]);

  return (
    <Modal visible={!!item} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
        <View style={styles.head}>
          <Text style={styles.title}>Commentaires</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="x" size={24} color={COLORS.black} />
          </Pressable>
        </View>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.err}>Impossible de charger les commentaires.</Text>
          </View>
        ) : mediaId ? (
          <ScrollView keyboardShouldPersistTaps="handled">
            <CommentsTab mediaId={mediaId} />
          </ScrollView>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.black} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  title: { fontFamily: FONTS.extraBold, fontSize: 18, color: COLORS.black },
  center: { padding: 40, alignItems: 'center' },
  err: { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textMuted },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/explore/CommentsSheet.tsx
git commit -m "feat(mobile): CommentsSheet (bottom sheet commentaires du flux)"
```

---

### Task 6: Mobile — `DescriptionOverlay`

Overlay semi-transparent (tap) : overview complète + infos détaillées lazy + « Voir la fiche ».

**Files:**
- Create: `mobile/components/explore/DescriptionOverlay.tsx`

**Interfaces:**
- Consumes: `SlideUpBar` (`@/components/anim`), `useResolveMedia` (Task 4), `FeedItem` (Task 4).
- Produces:
  ```ts
  export function DescriptionOverlay(props: {
    item: FeedItem;
    visible: boolean;
    onClose: () => void;
    onOpenFiche: (item: FeedItem) => void;
    resolveMedia: (item: FeedItem) => Promise<string>;
  }): JSX.Element;
  ```

- [ ] **Step 1: Créer le composant**

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { COLORS, FONTS } from '@/lib/theme';
import { SlideUpBar } from '@/components/anim';
import type { FeedItem } from './types';

type DetailInfo = {
  media?: { genres?: string | null };
  show?: { network?: string | null; platform?: string | null } | null;
  cast?: { name: string }[];
  providers?: { name: string }[];
  creators?: string[];
};

function InfoLine({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <Text style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label} : </Text>
      {value}
    </Text>
  );
}

export function DescriptionOverlay({
  item,
  visible,
  onClose,
  onOpenFiche,
  resolveMedia,
}: {
  item: FeedItem;
  visible: boolean;
  onClose: () => void;
  onOpenFiche: (item: FeedItem) => void;
  resolveMedia: (item: FeedItem) => Promise<string>;
}) {
  const [info, setInfo] = useState<DetailInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setInfo(null);
    setLoading(true);
    (async () => {
      try {
        const mediaId = await resolveMedia(item);
        const d = await api.get<DetailInfo>(
          item.type === 'movie' ? `/api/movies/${mediaId}` : `/api/shows/${mediaId}`,
        );
        if (!cancelled) setInfo(d);
      } catch {
        if (!cancelled) setInfo(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, item, resolveMedia]);

  const meta = [
    item.year,
    item.category === 'anime' ? 'Animé' : item.type === 'show' ? 'Série' : 'Film',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SlideUpBar visible={visible} style={styles.sheet} distance={160}>
      <Pressable style={styles.grip} onPress={onClose} hitSlop={10}>
        <Feather name="chevron-down" size={26} color="#fff" />
      </Pressable>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta}>{meta}</Text>
        <Text style={styles.desc}>{item.overview || 'Pas de description disponible.'}</Text>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 16, alignSelf: 'flex-start' }} color="#fff" />
        ) : info ? (
          <View style={{ marginTop: 14, gap: 8 }}>
            <InfoLine label="Genres" value={info.media?.genres ?? undefined} />
            <InfoLine
              label={item.type === 'movie' ? 'Réalisation' : 'Création'}
              value={info.creators?.join(', ')}
            />
            <InfoLine label="Diffusion" value={info.show?.network ?? info.show?.platform ?? undefined} />
            <InfoLine label="Casting" value={info.cast?.slice(0, 6).map((c) => c.name).join(', ')} />
            <InfoLine label="Où regarder" value={info.providers?.map((p) => p.name).join(', ')} />
          </View>
        ) : null}
        <Pressable style={styles.ficheBtn} onPress={() => onOpenFiche(item)}>
          <Feather name="external-link" size={18} color={COLORS.black} />
          <Text style={styles.ficheText}>VOIR LA FICHE</Text>
        </Pressable>
      </ScrollView>
    </SlideUpBar>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '32%',
    bottom: 0,
    backgroundColor: 'rgba(8,8,12,0.94)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    zIndex: 20,
  },
  grip: { alignSelf: 'center', paddingTop: 8, paddingBottom: 6 },
  title: { color: '#fff', fontSize: 25, fontFamily: FONTS.extraBold },
  meta: { color: 'rgba(255,255,255,0.8)', fontFamily: FONTS.bold, fontSize: 14, marginTop: 5 },
  desc: { color: 'rgba(255,255,255,0.92)', fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, marginTop: 14 },
  infoLine: { color: 'rgba(255,255,255,0.9)', fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20 },
  infoLabel: { color: COLORS.yellow, fontFamily: FONTS.bold },
  ficheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.yellow,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 22,
  },
  ficheText: { fontFamily: FONTS.extraBold, fontSize: 13, letterSpacing: 0.5, color: COLORS.black },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/explore/DescriptionOverlay.tsx
git commit -m "feat(mobile): DescriptionOverlay (panneau détails au tap)"
```

---

### Task 7: Mobile — `ActionRail`

Rail vertical d'actions + compteurs, avec état optimiste géré par le parent.

**Files:**
- Create: `mobile/components/explore/ActionRail.tsx`

**Interfaces:**
- Consumes: `formatCount` (Task 2), `tmdbImage` (`@/lib/api`), `PopIn` (`@/components/anim`), `FeedItem` (Task 4).
- Produces:
  ```ts
  export type RailState = { liked: boolean; watched: boolean; likes: number; watchedCount: number; comments: number };
  export function ActionRail(props: {
    item: FeedItem;
    state: RailState;
    onLike: () => void;
    onDislike: () => void;
    onWatched: () => void;
    onComment: () => void;
    onShare: () => void;
    onFiche: () => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Créer le composant**

```tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tmdbImage } from '@/lib/api';
import { COLORS, FONTS } from '@/lib/theme';
import { PopIn } from '@/components/anim';
import { formatCount } from '@/lib/format';
import type { FeedItem } from './types';

export type RailState = {
  liked: boolean;
  watched: boolean;
  likes: number;
  watchedCount: number;
  comments: number;
};

function RailButton({
  icon,
  active,
  activeColor,
  count,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  active?: boolean;
  activeColor?: string;
  count?: number;
  onPress: () => void;
}) {
  const color = active ? activeColor ?? COLORS.yellow : '#fff';
  return (
    <Pressable style={styles.btn} onPress={onPress} hitSlop={8}>
      <PopIn key={String(active)} style={styles.iconWrap}>
        <Feather name={icon} size={30} color={color} />
      </PopIn>
      {count != null ? <Text style={styles.count}>{formatCount(count)}</Text> : null}
    </Pressable>
  );
}

export function ActionRail({
  item,
  state,
  onLike,
  onDislike,
  onWatched,
  onComment,
  onShare,
  onFiche,
}: {
  item: FeedItem;
  state: RailState;
  onLike: () => void;
  onDislike: () => void;
  onWatched: () => void;
  onComment: () => void;
  onShare: () => void;
  onFiche: () => void;
}) {
  const poster = tmdbImage(item.posterPath, 'w185');
  return (
    <View style={styles.rail}>
      <Pressable style={styles.posterBtn} onPress={onFiche} hitSlop={6}>
        {poster ? (
          <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" />
        ) : (
          <View style={[styles.poster, styles.posterEmpty]}>
            <Feather name="film" size={18} color="#fff" />
          </View>
        )}
      </Pressable>
      <RailButton icon="heart" active={state.liked} activeColor={COLORS.yellow} count={state.likes} onPress={onLike} />
      <RailButton icon="thumbs-down" activeColor={COLORS.red} onPress={onDislike} />
      <RailButton icon="eye" active={state.watched} activeColor={COLORS.green} count={state.watchedCount} onPress={onWatched} />
      <RailButton icon="message-circle" count={state.comments} onPress={onComment} />
      <RailButton icon="share-2" onPress={onShare} />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { position: 'absolute', right: 10, bottom: 120, alignItems: 'center', gap: 20 },
  posterBtn: { marginBottom: 4 },
  poster: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#fff', backgroundColor: '#26262e' },
  posterEmpty: { alignItems: 'center', justifyContent: 'center' },
  btn: { alignItems: 'center', gap: 4 },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  count: { color: '#fff', fontFamily: FONTS.bold, fontSize: 12, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/explore/ActionRail.tsx
git commit -m "feat(mobile): ActionRail (rail d'actions + compteurs sociaux)"
```

---

### Task 8: Mobile — `TikTokCard`

Carte plein écran : image de fond, scrims, légende, `ActionRail`, `DescriptionOverlay`. Gère l'état optimiste local des actions et résout le `mediaId` à la demande.

**Files:**
- Create: `mobile/components/explore/TikTokCard.tsx`

**Interfaces:**
- Consumes: `ActionRail` + `RailState` (Task 7), `DescriptionOverlay` (Task 6), `useResolveMedia` result (Task 4), `shareMedia` (Task 2), `FeedItem` (Task 4), `api`, `tmdbImage`.
- Produces:
  ```ts
  export function TikTokCard(props: {
    item: FeedItem;
    height: number;                          // hauteur exacte d'un écran de flux
    resolveMedia: (item: FeedItem) => Promise<string>;
    onOpenComments: (item: FeedItem) => void;
    onDisliked: () => void;                  // demande au flux d'avancer à la carte suivante
    onInvalidateLibrary: () => void;         // rafraîchit shows/movies/profile après une action
  }): JSX.Element;
  ```

- [ ] **Step 1: Créer le composant**

```tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, tmdbImage } from '@/lib/api';
import { COLORS, FONTS } from '@/lib/theme';
import { shareMedia } from '@/lib/share';
import { ActionRail, type RailState } from './ActionRail';
import { DescriptionOverlay } from './DescriptionOverlay';
import type { FeedItem } from './types';

export function TikTokCard({
  item,
  height,
  resolveMedia,
  onOpenComments,
  onDisliked,
  onInvalidateLibrary,
}: {
  item: FeedItem;
  height: number;
  resolveMedia: (item: FeedItem) => Promise<string>;
  onOpenComments: (item: FeedItem) => void;
  onDisliked: () => void;
  onInvalidateLibrary: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(false);
  // État optimiste local, initialisé depuis les stats serveur.
  const [state, setState] = useState<RailState>({
    liked: item.me?.liked ?? false,
    watched: item.me?.watched ?? false,
    likes: item.stats?.likes ?? 0,
    watchedCount: item.stats?.watched ?? 0,
    comments: item.stats?.comments ?? 0,
  });

  const image = tmdbImage(item.backdropPath, 'w780') ?? tmdbImage(item.posterPath, 'w500');
  const meta = [
    item.year,
    item.category === 'anime' ? 'Animé' : item.type === 'show' ? 'Série' : 'Film',
  ]
    .filter(Boolean)
    .join(' · ');

  const openFiche = async (f: FeedItem) => {
    try {
      const id = await resolveMedia(f);
      router.push(`/show/${id}${f.type === 'movie' ? '?type=movie' : ''}`);
    } catch {
      /* best-effort */
    }
  };

  // Like = ajoute à « À voir » (watchlist). Optimiste avec rollback.
  const onLike = async () => {
    const next = !state.liked;
    setState((s) => ({ ...s, liked: next, likes: s.likes + (next ? 1 : -1) }));
    try {
      const id = await resolveMedia(item);
      await api.post(item.type === 'movie' ? `/api/movies/${id}/watchlist` : `/api/shows/${id}/watchlater`);
      onInvalidateLibrary();
    } catch {
      setState((s) => ({ ...s, liked: !next, likes: s.likes + (next ? -1 : 1) }));
    }
  };

  const onWatched = async () => {
    const next = !state.watched;
    setState((s) => ({ ...s, watched: next, watchedCount: s.watchedCount + (next ? 1 : -1) }));
    try {
      const id = await resolveMedia(item);
      if (item.type === 'movie') {
        await api.post(`/api/movies/${id}/watched`, {});
      } else {
        await api.post(`/api/shows/${id}/mark-all-watched`, {});
        await api.post(`/api/shows/${id}/status`, { status: 'completed' });
      }
      onInvalidateLibrary();
    } catch {
      setState((s) => ({ ...s, watched: !next, watchedCount: s.watchedCount + (next ? -1 : 1) }));
    }
  };

  const onDislike = async () => {
    try {
      const id = await resolveMedia(item);
      await api.post(`/api/disliked/${id}`, { hidden: true });
    } catch {
      /* best-effort */
    }
    onDisliked(); // avance à la carte suivante (comportement « pas intéressé » TikTok)
  };

  return (
    <View style={[styles.card, { height }]}>
      {image ? (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noImg]}>
          <Feather name="image" size={48} color="#555" />
        </View>
      )}
      <View style={styles.scrimTop} pointerEvents="none" />
      <View style={styles.scrimBottom} pointerEvents="none" />

      {/* Zone tap = ouvre/ferme l'overlay de description. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetail((d) => !d)} />

      <View style={styles.caption} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name={item.type === 'show' ? 'tv' : 'film'} size={20} color="#fff" />
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
        <Text style={styles.meta}>{meta}</Text>
        {item.overview ? (
          <Text style={styles.overview} numberOfLines={2}>
            {item.overview}
          </Text>
        ) : null}
        <Text style={styles.hint}>Touche pour les détails</Text>
      </View>

      <ActionRail
        item={item}
        state={state}
        onLike={onLike}
        onDislike={onDislike}
        onWatched={onWatched}
        onComment={() => onOpenComments(item)}
        onShare={() => shareMedia(item.title)}
        onFiche={() => openFiche(item)}
      />

      <DescriptionOverlay
        item={item}
        visible={detail}
        onClose={() => setDetail(false)}
        onOpenFiche={openFiche}
        resolveMedia={resolveMedia}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: '#0d0d12', justifyContent: 'flex-end', overflow: 'hidden' },
  noImg: { alignItems: 'center', justifyContent: 'center' },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 140, backgroundColor: 'rgba(0,0,0,0.35)' },
  scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 260, backgroundColor: 'rgba(0,0,0,0.45)' },
  caption: { position: 'absolute', left: 18, right: 84, bottom: 96 },
  title: { color: '#fff', fontSize: 24, fontFamily: FONTS.extraBold, flexShrink: 1 },
  meta: { color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.bold, fontSize: 14, marginTop: 4 },
  overview: { color: 'rgba(255,255,255,0.92)', fontFamily: FONTS.regular, fontSize: 15, lineHeight: 20, marginTop: 10 },
  hint: { color: 'rgba(255,255,255,0.55)', fontFamily: FONTS.regular, fontSize: 12, marginTop: 10 },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/explore/TikTokCard.tsx
git commit -m "feat(mobile): TikTokCard (carte plein écran + actions optimistes)"
```

---

### Task 9: Mobile — `TikTokFeed`

FlatList verticale paginée, filtres catégories, flux infini, barre « Ajouter un commentaire », montage du `CommentsSheet`.

**Files:**
- Create: `mobile/components/explore/TikTokFeed.tsx`

**Interfaces:**
- Consumes: `TikTokCard` (Task 8), `CommentsSheet` (Task 5), `useResolveMedia` (Task 4), `FeedItem`/`FEED_CATEGORIES`/`FeedCategory`/`catOf` (Task 4), `api`, `EmptyState`/`Loading`.
- Produces: `export function TikTokFeed(): JSX.Element;` (autonome — récupère son propre flux).

- [ ] **Step 1: Créer le composant**

```tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image as RNImage,
  ActivityIndicator,
  type ViewToken,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tmdbImage } from '@/lib/api';
import { COLORS, FONTS } from '@/lib/theme';
import { EmptyState, Loading } from '@/components/ui';
import { TikTokCard } from './TikTokCard';
import { CommentsSheet } from './CommentsSheet';
import { useResolveMedia } from './useResolveMedia';
import { FEED_CATEGORIES, catOf, type FeedCategory, type FeedItem } from './types';

const keyOf = (f: FeedItem) => `${f.type}:${f.tmdbId ?? f.id}`;

export function TikTokFeed() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const resolveMedia = useResolveMedia();
  const listRef = useRef<FlatList<FeedItem>>(null);

  const [height, setHeight] = useState(0);
  const [cat, setCat] = useState<FeedCategory>('tout');
  const [extra, setExtra] = useState<FeedItem[]>([]); // pages ajoutées (flux infini)
  const [commentsFor, setCommentsFor] = useState<FeedItem | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const dryRef = useRef(0); // nombre de fetchs consécutifs sans nouveauté

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['explore', 'feed'],
    queryFn: () => api.get<{ feed: FeedItem[] }>('/api/explore/feed'),
    staleTime: 30 * 60_000,
  });

  const all = useMemo(() => [...(data?.feed ?? []), ...extra], [data?.feed, extra]);
  const deck = useMemo(
    () => (cat === 'tout' ? all : all.filter((f) => catOf(f) === cat)),
    [all, cat],
  );

  const invalidateLibrary = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['shows'] });
    queryClient.invalidateQueries({ queryKey: ['movies'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  }, [queryClient]);

  // Flux infini : re-tire une page et ajoute les nouveautés (dédup). 2 fetchs
  // secs consécutifs → on arrête d'essayer (garde-fou anti-boucle).
  const loadMore = useCallback(async () => {
    if (loadingMore || dryRef.current >= 2) return;
    setLoadingMore(true);
    try {
      const res = await api.get<{ feed: FeedItem[] }>('/api/explore/feed');
      const seen = new Set(all.map(keyOf));
      const fresh = res.feed.filter((f) => !seen.has(keyOf(f)));
      if (fresh.length === 0) dryRef.current += 1;
      else {
        dryRef.current = 0;
        setExtra((prev) => [...prev, ...fresh]);
      }
    } catch {
      /* best-effort */
    } finally {
      setLoadingMore(false);
    }
  }, [all, loadingMore]);

  // Prefetch des 2 backdrops suivants pour un snap fluide.
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const idx = viewableItems[0]?.index ?? 0;
    for (let i = idx + 1; i <= idx + 2; i++) {
      const it = deck[i];
      const uri = it && (tmdbImage(it.backdropPath, 'w780') ?? tmdbImage(it.posterPath, 'w500'));
      if (uri) RNImage.prefetch(uri);
    }
  }).current;

  const advance = useCallback(
    (index: number) => {
      const next = index + 1;
      if (next < deck.length) listRef.current?.scrollToIndex({ index: next, animated: true });
    },
    [deck.length],
  );

  if (isLoading) return <Loading />;

  return (
    <View style={styles.wrap} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 && deck.length > 0 ? (
        <FlatList
          ref={listRef}
          data={deck}
          keyExtractor={keyOf}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          initialNumToRender={2}
          maxToRenderPerBatch={3}
          windowSize={3}
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item, index }) => (
            <TikTokCard
              item={item}
              height={height}
              resolveMedia={resolveMedia}
              onOpenComments={setCommentsFor}
              onDisliked={() => advance(index)}
              onInvalidateLibrary={invalidateLibrary}
            />
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} color="#fff" /> : null}
        />
      ) : height > 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState title="Rien dans cette catégorie" message="Change de catégorie ou actualise." />
        </View>
      ) : null}

      {/* Barre de recherche + filtres catégories, en surimpression haute. */}
      <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <FlatList
          data={FEED_CATEGORIES}
          keyExtractor={(c) => c.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}
          renderItem={({ item: c }) => (
            <Pressable
              style={[styles.chip, cat === c.key && styles.chipOn]}
              onPress={() => {
                setCat(c.key);
                listRef.current?.scrollToOffset({ offset: 0, animated: false });
              }}
            >
              <Text style={[styles.chipText, cat === c.key && styles.chipTextOn]}>{c.label}</Text>
            </Pressable>
          )}
        />
      </View>

      {/* Barre « Ajouter un commentaire » (comme TikTok). */}
      {deck.length > 0 ? (
        <Pressable
          style={[styles.commentBar, { bottom: 12 }]}
          onPress={() => {
            const idx = 0;
            const current = deck[idx];
            if (current) setCommentsFor(current);
          }}
        >
          <Feather name="message-circle" size={18} color="rgba(255,255,255,0.9)" />
          <Text style={styles.commentBarText}>Ajouter un commentaire…</Text>
        </Pressable>
      ) : null}

      <CommentsSheet item={commentsFor} onClose={() => setCommentsFor(null)} resolveMedia={resolveMedia} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  emptyWrap: { flex: 1, backgroundColor: COLORS.white },
  top: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chip: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { backgroundColor: COLORS.yellow },
  chipText: { fontFamily: FONTS.extraBold, fontSize: 13, letterSpacing: 0.4, color: '#fff' },
  chipTextOn: { color: COLORS.black },
  commentBar: {
    position: 'absolute',
    left: 14,
    right: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  commentBarText: { color: 'rgba(255,255,255,0.9)', fontFamily: FONTS.regular, fontSize: 14 },
});
```

> **Note d'implémentation — barre de commentaire :** en V1 elle ouvre les commentaires de la **première carte visible**. Suivre la carte réellement active nécessiterait de remonter l'index visible ; c'est acceptable pour la V1 (on peut aussi retirer la barre si le comportement gêne — à valider en test manuel). Le bouton 💬 du rail, lui, cible toujours la bonne carte.

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/explore/TikTokFeed.tsx
git commit -m "feat(mobile): TikTokFeed (flux vertical paginé + infini)"
```

---

### Task 10: Mobile — brancher l'Explorer + AVANCEMENT

Remplacer le flux Parcourir/Découvrir de `explore.tsx` par `TikTokFeed`, supprimer tout le code mort.

**Files:**
- Modify: `mobile/app/(tabs)/explore.tsx` (supprimer `Feed`, `ModeBar`, `InfoLine`, `DetailAction`, le bloc `PanResponder`/`fling`/`swipeUp`/`swipeDown`, les types `DetailInfo`/`FeedMode`, les constantes `SWIPE_X`/`SWIPE_Y`/`WIN_W`/`PASTELS`, et tous les styles du deck/hero/deck/detail devenus inutiles)
- Modify: `docs/AVANCEMENT.md`

**Interfaces:**
- Consumes: `TikTokFeed` (Task 9). La partie recherche (`MediaResults`, `UserResults`, `SearchTab`, barre de recherche) reste **inchangée**.

- [ ] **Step 1: Remonter le flux TikTok dans la coquille**

Dans `mobile/app/(tabs)/explore.tsx` :

1. Ajouter l'import :
```ts
import { TikTokFeed } from '@/components/explore/TikTokFeed';
```

2. Dans `ExploreScreenInner`, supprimer le `useQuery(['explore','feed'])` (le flux gère désormais sa propre requête) et remplacer la branche non-recherche. Le rendu devient :
```tsx
      <FadeSwitch trigger={searching ? 'search' : 'feed'}>
        {searching ? (
          <>
            <View style={styles.tabs}>
              <SearchTab label="SÉRIES ET FILMS" active={tab === 'media'} onPress={() => setTab('media')} />
              <SearchTab label="UTILISATEURS" active={tab === 'users'} onPress={() => setTab('users')} />
            </View>
            <FadeSwitch trigger={tab}>
              {tab === 'media' ? <MediaResults query={debouncedQuery} rawQuery={query} /> : <UserResults query={debouncedQuery} />}
            </FadeSwitch>
          </>
        ) : (
          <TikTokFeed />
        )}
      </FadeSwitch>
```

- [ ] **Step 2: Supprimer le code mort**

Supprimer de `explore.tsx` : la fonction `Feed`, `ModeBar`, `InfoLine`, `DetailAction`, les types `DetailInfo` et `FeedMode`, les types `FeedItem`/`FeedCategory`/`FEED_CATEGORIES` locaux **s'ils ne servent plus** (les résultats de recherche utilisent `FeedItem` — dans ce cas, garder `FeedItem` local OU l'importer depuis `@/components/explore/types` ; choisir l'import pour éviter la duplication), les constantes `WIN_W`/`SWIPE_X`/`SWIPE_Y`/`PASTELS`, et tous les styles devenus inutilisés (`feedHead`, `catChip*`, `refreshBtn`, `hero*`, `plus`, `mode*`, `deck*`, `tag*`, `detail*`, `infoLine`, `infoLabel`). Garder les styles de la barre de recherche, des onglets et des résultats.

> Astuce : après suppression, `npm run typecheck` signale les symboles encore référencés — retirer au fur et à mesure jusqu'à zéro erreur et zéro import inutilisé.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: aucune erreur, aucun import/variable non utilisé.

- [ ] **Step 4: Vérification manuelle (web)**

Run: `cd mobile && npm run web`
Vérifier :
1. L'onglet Explorer affiche un flux plein écran, **défilement vertical page à page** (molette / trackpad).
2. Le rail droit montre ❤️ + nombre, 👎, 👁 + nombre, 💬 + nombre, ➤. Cliquer ❤️ → cœur jaune + compteur +1 ; le titre apparaît ensuite dans « À voir » du profil.
3. 👎 masque et **avance** à la carte suivante.
4. 👁 marque « déjà vu » (compteur +1).
5. **Tap** sur l'image → overlay description (genres/casting/où-regarder) + « Voir la fiche ».
6. 💬 et la barre du bas ouvrent le sheet commentaires ; publier un commentaire fonctionne et le compteur s'incrémente.
7. ➤ déclenche le partage (Web Share ou copie presse-papier).
8. Les filtres TOUT/SÉRIES/FILMS/ANIMÉS filtrent et remettent le flux en haut.
9. La recherche (taper > 1 caractère) fonctionne toujours (onglets Séries/Films + Utilisateurs).

- [ ] **Step 5: Mettre à jour `docs/AVANCEMENT.md`**

Passer la ligne « Explorer » du tableau « État par domaine » à jour et ajouter au « Journal des modifications » une entrée datée :
```markdown
### 2026-07-10 — Explorer refondu en flux TikTok
- Explorer unique plein écran, défilement vertical paginé (suppression PARCOURIR + deck Tinder).
- Rail social : like (= À voir) / dislike / déjà vu / commentaire / partager, avec compteurs (likes, vus, commentaires) agrégés sur toute l'app via `/api/explore/feed` (nouveau `attachSocialStats`).
- Tap = overlay description (lazy) + « Voir la fiche » ; sheet commentaires réutilisant le composant partagé `CommentsTab`.
- Images en V1 (autoplay trailer prévu en V2).
```

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(tabs)/explore.tsx" docs/AVANCEMENT.md
git commit -m "feat(explore): brancher le flux TikTok et retirer l'ancien Explorer"
```

---

## Self-Review (effectuée)

**Couverture de la spec :**
- Serveur `stats`/`me` → Task 1. ✅
- Suppression ModeBar/PARCOURIR/deck/PanResponder → Task 10. ✅
- FlatList paginée, snap, infini, prefetch → Task 9. ✅
- Rail like/dislike/déjà vu/commentaire/partager + compteurs → Tasks 7-8. ✅
- Like=watchlist, déjà vu séries `mark-all-watched` + `status completed`, dislike=hidden+avance → Task 8. ✅
- Overlay tap + Voir la fiche → Task 6. ✅
- Barre commentaire + sheet + résolution mediaId → Tasks 5, 9, `useResolveMedia` Task 4. ✅
- Factorisation commentaires (DRY) → Task 3. ✅
- Filtres catégories fins → Task 9. ✅
- Partage helper factorisé → Task 2. ✅
- Compat web (vérif manuelle) → Task 10 Step 4. ✅
- AVANCEMENT → Task 10 Step 5. ✅

**Cohérence des types :** `FeedItem` (Task 4) porte `stats?`/`me?` alignés sur le serveur (Task 1). `RailState` (Task 7) consommé identiquement par `TikTokCard` (Task 8). `resolveMedia: (item: FeedItem) => Promise<string>` identique partout (Tasks 4/5/6/8/9). `attachSocialStats` signature stable (Task 1).

**Points de vigilance connus (documentés) :** la barre « Ajouter un commentaire » cible la 1re carte visible en V1 (note Task 9) ; le compteur commentaires côté serveur compte tous les commentaires d'un média (réponses incluses) — cohérent avec un « nombre de commentaires » global.
