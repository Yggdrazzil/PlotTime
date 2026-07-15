# Onglet Jeux vidéo — spec de conception (V1)

Date : 2026-07-15

## Objectif

Ajouter à SerieTime un **domaine « Jeux vidéo »** avec le **même système de suivi** que
les séries/films : bibliothèque (Voulus / En cours / Terminés / Abandonnés), fiche jeu,
**sorties à venir** et **DLC à venir**, découverte, et **import de la bibliothèque Steam**.
Structuré **à l'identique du côté séries** (mêmes patterns provider / modèle / modules / UI).

Objectif produit : **un truc fonctionnel et en ligne rapidement**, qu'on améliorera ensuite.

## Décisions actées (cadrage)

| Sujet | Décision |
|---|---|
| Sources de données V1 | **IGDB** (métadonnées : fiches, sorties, DLC) + **Steam** (import biblio + temps de jeu). HowLongToBeat et PlayStation = **hors V1**. |
| Structure | **Calquée sur les séries/films** : `Media.type = "game"` + sous-table `Game` + provider `igdb` + module `games` + réutilisation de `UserMediaStatus`. |
| Navigation | **Nouvel onglet « Jeux »** (5e onglet : Séries / Films / Jeux / Explorer / Profil). |
| Statuts de suivi | **Voulus** (wishlist) · **En cours** (playing) · **Terminés** (completed) · **Abandonnés** (abandoned). |
| Découverte | **Oui en V1**, basique : Populaires + À venir (IGDB) + reco simple. |
| Temps de jeu Steam | Champ **`playtimeMinutes`** (optionnel) sur `UserMediaStatus`. |
| Social | Notes/commentaires **réutilisés tels quels** (déjà génériques par `mediaId`). |

## Rappel des patterns existants (à imiter)

- **Provider** : `apps/server/src/services/tmdb/` (client + fonctions) → on crée `services/igdb/`.
- **Module** : `apps/server/src/modules/shows/routes.ts` (search, add-from-*, library, upcoming,
  status, detail) → on crée `modules/games/routes.ts`.
- **Modèle** : `Media` (champs communs) + `Show` (sous-table) + `UserMediaStatus` (suivi par
  utilisateur, `status` string) → on ajoute `Game` + un statut jeux + `playtimeMinutes`.
- **Sorties** : `GET /api/shows/upcoming` groupe par date → `GET /api/games/upcoming`.
- **UI biblio** : `mobile/app/library/shows.tsx` → `mobile/app/library/games.tsx` ; fiche
  `mobile/app/show/[id].tsx` → `mobile/app/game/[id].tsx` ; onglet dans `mobile/app/(tabs)/`.
- **Notifications** : modèle `Notification` réutilisé pour les sorties/DLC.

## Modèle de données (Prisma — `apps/server/prisma/schema.prisma`)

1. **`Media`** : ajouter `igdbId String?` (à côté de `tmdbId`/`tvdbId`/`imdbId`). `type` accepte
   désormais aussi `"game"`. Champs réutilisés : `title`, `overview`, `posterPath` (jaquette IGDB),
   `backdropPath` (artwork/screenshot IGDB), `releaseDate`, `year`, `genres`, `voteAverage`,
   `popularity`.

2. **Nouvelle sous-table `Game`** (miroir de `Show`) :
   ```prisma
   model Game {
     id           String   @id @default(cuid())
     mediaId      String   @unique
     media        Media    @relation(fields: [mediaId], references: [id], onDelete: Cascade)
     platforms    String?  // CSV noms de plateformes (PC, PS5, Switch…)
     developer    String?
     publisher    String?
     gameModes    String?  // CSV (Solo, Multi, Coop…)
     steamAppId   String?  // si connu (import Steam / matching)
     parentGameId String?  // si ce media est un DLC/expansion → media.id du jeu parent
     parentGame   Media?   @relation("GameDlc", fields: [parentGameId], references: [id], onDelete: SetNull)
     dlcs         Media[]  @relation("GameDlc")
     isDlc        Boolean  @default(false)
     createdAt    DateTime @default(now())
     updatedAt    DateTime @updatedAt
   }
   ```
   (relation `game Game?` ajoutée sur `Media`, comme `show`/`movie`).

3. **`UserMediaStatus`** : ajouter `playtimeMinutes Int?` (rempli par l'import Steam, uniquement
   pour les jeux ; nul ailleurs). Statuts jeux stockés dans le champ `status` existant :
   `wishlist` (Voulus), `playing` (En cours), `completed` (Terminé), `abandoned` (Abandonné).
   *(Note : `wishlist`/`completed`/`abandoned` existent déjà pour les autres types ; c'est le
   couple `(type='game', status)` qui définit le sens côté écran Jeux. `playing` est nouveau.)*

**Migration Prisma** : une migration additive (nouvelle table `Game`, colonnes `Media.igdbId`,
`UserMediaStatus.playtimeMinutes`, relation self `GameDlc`). Aucune donnée existante impactée.

## Serveur

### Provider IGDB — `apps/server/src/services/igdb/`

- `client.ts` : auth **Twitch OAuth client credentials** (`POST https://id.twitch.tv/oauth2/token`
  avec `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`, `grant_type=client_credentials`) → jeton bearer
  mis en cache (avec expiration). Requêtes : `POST https://api.igdb.com/v4/{endpoint}` avec en-têtes
  `Client-ID` + `Authorization: Bearer` et un corps **Apicalypse** (langage de requête IGDB).
- Fonctions (miroir de `tmdb`): `igdbSearch(q)`, `igdbGame(id)` (fields: name, summary, cover,
  artworks, genres, platforms, involved_companies (dev/publisher), game_modes, first_release_date,
  `release_dates.*`, `dlcs.*`, `expansions.*`, `total_rating`, `total_rating_count`),
  `igdbPopular()` / `igdbUpcoming()` (via `where first_release_date > now` trié).
- `igdbEnabled()` (comme `tmdbEnabled()`) : vrai si les creds Twitch sont configurés.
- Un mapper `igdbToMedia()` : convertit un jeu IGDB en `{ Media + Game }` (jaquette
  `cover.image_id` → URL IGDB `t_cover_big`/`t_1080p`, plateformes/dev/éditeur en CSV, DLCs listés).

### Import Steam — `apps/server/src/services/steam/`

- `steam.ts` : `steamResolveVanity(vanityOrId)` (`ISteamUser/ResolveVanityURL`) →
  `steamOwnedGames(steamId)` (`IPlayerService/GetOwnedGames` avec `STEAM_API_KEY`,
  `include_appinfo=1`, `include_played_free_games=1`) → liste `{ appid, name, playtime_forever,
  img_icon_url }`. **Profil Steam public requis** (sinon liste vide → message clair).
- Pas de matching IGDB lourd à l'import : on crée des `Media(type='game')` depuis les données
  Steam (nom, `steamAppId`, jaquette Steam `header.jpg`), statut à l'import : **`playing`** si
  `playtime_forever > 0`, sinon **`wishlist`** (un statut « backlog / à jouer » dédié pour les jeux
  possédés-non-joués est une amélioration V2). `playtimeMinutes` toujours renseigné. L'**enrichissement IGDB est paresseux** à l'ouverture de la fiche
  (résolution par nom → complète plateformes/DLC/note, comme le flux Explorer résout le mediaId).

### Module `apps/server/src/modules/games/routes.ts` (miroir `shows`)

- `GET /api/games/search?q=` → résultats IGDB.
- `POST /api/games/add-from-igdb { igdbId, status? }` → crée/upsert `Media`+`Game`, renvoie `mediaId`.
- `GET /api/games` → bibliothèque de l'utilisateur, groupée par statut (Voulus/En cours/Terminés/
  Abandonnés), comme `/api/shows`.
- `POST /api/games/:id/status { status }` → change le statut (mêmes valeurs jeux).
- `GET /api/games/:id` → fiche complète (média + Game + DLCs + où le suivre) ; enrichit via IGDB
  si pas encore fait.
- `GET /api/games/upcoming` → sorties + DLC à venir des jeux suivis, groupés par date (réutilise le
  regroupement par date des séries).
- `GET /api/games/discover` → `{ popular: [], upcoming: [] }` depuis IGDB (+ reco simple basée sur
  les jeux « Terminés/En cours » via genres/franchises IGDB, best-effort).
- `POST /api/games/steam/connect { steamId }` + `POST /api/games/steam/import` → import Steam.
- `DELETE /api/games/:id/tracking` → retire le jeu du suivi (comme films/séries).

### Notifications sorties/DLC

Un balayage (réutilise le worker de fond `sync-worker` ou un cron léger) : pour chaque jeu suivi
dont une **sortie/DLC** arrive, crée une `Notification` (type `game_release`). Hors-chemin critique.

## Mobile (miroir séries)

- **Onglet** : `mobile/app/(tabs)/games.tsx` + entrée dans `mobile/app/(tabs)/_layout.tsx`
  (titre « Jeux », icône manette). Ordre : Séries / Films / **Jeux** / Explorer / Profil.
- **Bibliothèque** : `mobile/app/library/games.tsx` — sections Voulus / En cours / Terminés /
  Abandonnés (grille de jaquettes, comme `shows.tsx`), pull-to-refresh.
- **Découverte** (dans l'onglet Jeux) : « Populaires » + « À venir » (IGDB) + « Pour vous » (reco
  simple) ; taper une carte → fiche.
- **Fiche jeu** : `mobile/app/game/[id].tsx` — jaquette, résumé, plateformes, dev/éditeur, note,
  **DLC** (liste + à venir), bouton de suivi (Voulus/En cours/Terminé/Abandonné), temps de jeu si
  importé, section commentaires (composant partagé `CommentsRowLink` → `/comments/:mediaId`, déjà
  générique).
- **Sorties à venir** : section « À venir » **dans l'onglet Jeux** (sorties + DLC des jeux suivis,
  groupés par date) alimentée par `/api/games/upcoming`.
- **Réglages** : écran/section « Connecter Steam » (saisie SteamID/URL, bouton importer, retour du
  nombre de jeux importés).
- **API client** : `mobile/lib/api.ts` déjà générique ; ajouter les appels `games` dans les écrans.
- **Recherche** : l'Explorer/recherche peut, en V2, inclure les jeux ; **hors V1** (la recherche
  jeux vit dans l'onglet Jeux).

## Configuration (`apps/server/.env`)

- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (IGDB via Twitch), `IGDB_ENABLED=true`.
- `STEAM_API_KEY` (import Steam).
- Documenté dans `docs/ONBOARDING.md` + `CLAUDE.md` (comme la clé TVDB).

## Compatibilité web (règle produit)

Tout doit marcher sur l'export web (l'onglet Jeux, la fiche, l'import Steam via formulaire). Aucun
module natif obligatoire. Tester via `npx expo start --web`.

## Découpage en unités (pour le plan)

1. Migration Prisma (`Game`, `Media.igdbId`, `UserMediaStatus.playtimeMinutes`).
2. Provider IGDB (`services/igdb/` + `igdbToMedia`) — testable isolément (vitest, mock HTTP).
3. Module `games` — search / add-from-igdb / library / status / detail (TDD serveur).
4. `GET /api/games/upcoming` + `/discover`.
5. Import Steam (`services/steam/` + endpoints connect/import) — TDD serveur (mock HTTP).
6. Mobile : onglet Jeux + bibliothèque.
7. Mobile : fiche jeu + suivi + DLC.
8. Mobile : découverte + à venir.
9. Mobile : connexion/import Steam (réglages).
10. Notifications sorties/DLC + AVANCEMENT.

## Hors V1 (V2+)

- HowLongToBeat (durées), import **PlayStation** (psn-api + NPSSO).
- Jeux dans l'Explorer/recherche globale et dans le flux TikTok.
- Trophées/succès Steam, statistiques jeux, classements amis sur les jeux.

## Suivi d'avancement

Mettre à jour `docs/AVANCEMENT.md` (tableau + entrée datée) au fil de l'implémentation.
