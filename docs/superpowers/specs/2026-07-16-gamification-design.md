# Gamification SerieTime — spec V1+V2 (validée)

> Validée par Benjamin le 2026-07-16 (« go pour tout même V2 »).
> XP rétroactif sur l'import TV Time : OUI (validé).

## Vue d'ensemble

Système complet : **XP + niveaux + titres**, **badges à paliers**, **streaks**,
**défis mensuels**, **classement hebdo entre amis**, intégré au fil social et
aux notifications. Tout est calculé **côté serveur** (zéro triche client), en
**recompute idempotent** : la source de vérité est toujours dérivable des
données existantes (épisodes vus, films, jeux, commentaires, abonnés). Le
recompute est déclenché après chaque action pertinente (débounce par
utilisateur) et après un import.

## 1. XP

| Action | XP |
|---|---|
| Épisode vu | 10 |
| Épisode vu **le jour de sa diffusion** (même jour Europe/Paris) | 20 (10 + bonus 10) |
| Film vu (statut completed) | 30 |
| Jeu terminé (statut completed) | 100 |
| Série terminée à 100 % (statut completed) | 200 (bonus one-shot par série) |
| Commentaire posté | 5 |
| Défi mensuel accompli | 100 |

L'XP total est recalculé depuis les données (counts) — l'import TV Time donne
donc l'XP rétroactivement.

## 2. Niveaux et titres

- `level = max(1, floor(sqrt(xp / 50)))` — quadratique : niveau 10 = 5 000 XP,
  niveau 30 = 45 000 XP, niveau 60 = 180 000 XP (≈ bibliothèque Étienne).
- `nextLevelXp = 50 × (level+1)²` (pour la barre de progression).
- Titres (le titre du plus haut palier atteint) :
  1 Novice · 5 Curieux du dimanche · 10 Sérievore · 15 Accro au générique ·
  20 Binge-watcheur · 25 Boulimique d'épisodes · 30 Marathonien ·
  40 Critique confirmé · 50 Encyclopédie vivante · 60 Légende du canapé ·
  75 Maître du temps · 90 Immortel du petit écran.

## 3. Badges (paliers bronze → argent → or → platine)

Catalogue **en dur dans `packages/core`** (id stable, libellé FR, icône
Feather/Ionicons, description, seuils). `tier` = index du palier atteint.

| id | Libellé | Mesure | Seuils |
|---|---|---|---|
| episodes | Boulimique | épisodes vus | 10 / 100 / 1 000 / 10 000 |
| movies | Cinéphile | films vus | 5 / 50 / 500 |
| games | Joueur accompli | jeux terminés | 1 / 10 / 50 |
| finisher | Finisseur | séries terminées 100 % (show ended) | 1 / 10 / 50 |
| day_one | Jour J | épisodes vus le jour de leur diffusion | 1 / 10 / 100 |
| marathon | Marathonien | max d'épisodes vus en 24 h glissantes | 10 / 20 / 40 |
| explorer | Explorateur | genres distincts dans les médias vus | 5 / 10 / 20 |
| popular | Célébrité | abonnés | 1 / 10 / 100 |
| commentator | Commentateur | commentaires postés | 1 / 25 / 100 |
| beloved | Adoré | réactions reçues sur ses commentaires | 10 / 100 / 1 000 |
| streak | Assidu | meilleur streak (jours consécutifs) | 7 / 30 / 100 |
| pioneer | Pionnier | compte créé avant la sortie officielle | 1 palier (date constante `PIONEER_DEADLINE = 2026-12-31`) |

## 4. Streaks (V2)

- Un jour « actif » = ≥ 1 épisode OU film coché ce jour-là (fuseau
  **Europe/Paris**, sur `watchedAt`).
- `currentStreak` (se termine aujourd'hui ou hier), `bestStreak` (historique,
  import compris).

## 5. Défis mensuels (V2)

3 défis fixes par mois calendaire, calculés en live sur le mois en cours,
`challengeId = "YYYY-MM-<slug>"` :
- `marathon` : « Regarde 30 épisodes ce mois-ci » (30 épisodes vus ce mois)
- `finisher` : « Termine une série ce mois-ci » (1 série passée completed ce mois — `completedAt`)
- `discover` : « Ajoute 3 nouveautés à ta bibliothèque » (3 médias suivis créés ce mois — `UserMediaStatus.createdAt`)

Un défi accompli = ligne `UserChallenge` (idempotent) + 100 XP + notification.

## 6. Classement hebdo entre amis (V2)

`GET /api/gamification/leaderboard` : XP gagné **depuis lundi 00:00
Europe/Paris** pour moi + les comptes que je suis (épisodes/films/jeux/
commentaires de la semaine × barème). Trié décroissant, retourne
`[{ user: publicUser, weeklyXp, rank }]`. Calcul live, pas de table.

## 7. Stockage (Prisma)

```prisma
model UserProgress {
  userId        String  @id
  user          User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  xp            Int     @default(0)
  level         Int     @default(1)
  currentStreak Int     @default(0)
  bestStreak    Int     @default(0)
  updatedAt     DateTime @updatedAt
}
model UserBadge {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  badgeId    String
  tier       Int      // 1 = bronze … index du palier atteint
  unlockedAt DateTime @default(now())
  @@unique([userId, badgeId, tier])
  @@index([userId])
  @@index([unlockedAt])
}
model UserChallenge {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  challengeId String   // "2026-07-marathon"
  completedAt DateTime @default(now())
  @@unique([userId, challengeId])
}
```

## 8. Moteur (packages/core — fonctions pures, testées)

`packages/core/src/gamification/` :
- `xp.ts` : barème (`XP_RULES`), `totalXp(stats)`, `levelForXp`, `nextLevelXp`,
  `levelTitle(level)`.
- `badges.ts` : `BADGES` (catalogue), `evaluateBadges(stats)` →
  `{ badgeId, tier }[]` (tous paliers atteints), `badgeProgress(stats)` →
  progression vers le prochain palier.
- `streak.ts` : `computeStreaks(activeDays: string[] /* "2026-07-16" triés */)`
  → `{ current, best }` (référence = aujourd'hui Europe/Paris).
- `challenges.ts` : `monthlyChallenges(month)` → défis du mois,
  `evaluateChallenge`.
- `stats` = objet plat (episodesWatched, dayOneEpisodes, moviesWatched,
  gamesCompleted, showsCompleted, maxEpisodes24h, distinctGenres, followers,
  comments, reactionsReceived, bestStreak, accountCreatedAt, challengesDone).

## 9. Serveur

`apps/server/src/modules/gamification/` :
- `service.ts` : `collectStats(userId)` (requêtes count/select minimales — la
  bibliothèque d'Étienne fait 20 000+ épisodes vus : ne JAMAIS charger les
  lignes complètes, uniquement `watchedAt`/counts) ; `recomputeUser(userId)` :
  stats → xp/level/streak/badges/défis → diff avec l'existant → insère les
  nouveaux `UserBadge`/`UserChallenge`, met à jour `UserProgress`, crée les
  `Notification` (type `badge_unlocked` / `level_up` / `challenge_completed`).
  Débounce : `scheduleRecompute(userId)` (750 ms, Set en mémoire, fire-and-forget).
- Ganchos : épisode vu/dévu, film vu, jeu terminé, commentaire créé, follow →
  `scheduleRecompute` ; fin d'import (phase apply) → `recomputeUser` direct.
- `routes.ts` :
  - `GET /api/gamification/me` → `{ xp, level, levelTitle, nextLevelXp,
    currentStreak, bestStreak, badges: [{ id, label, description, icon, tier,
    tierCount, unlockedAt, progress, nextThreshold }], challenges: [{ id,
    label, target, progress, completed }] }`
  - `GET /api/gamification/leaderboard` (cf. §6)
- Fil social (`/api/social/feed`) : ajouter les items `kind: 'badge'` — les
  `UserBadge` récents (`unlockedAt`) des comptes suivis, avec libellé/palier.
- `publicUser` : ajouter `level` (lookup `UserProgress`, batché).
- Suppression de compte : cascade (déjà `onDelete: Cascade`).

## 10. Mobile

- **Page `/trophies`** (`mobile/app/trophies.tsx`) : PageHeader « Trophées » ;
  bloc niveau (grand rond niveau + titre + barre XP vers niveau suivant) ;
  bloc streak (flamme Ionicons + « N jours d'affilée », meilleur streak) ;
  défis du mois (3 cartes avec barre de progression) ; grille de badges
  (icône, palier coloré bronze `#CD7F32` / argent `#9AA2AA` / or `#D4A017` /
  platine `#7FDBFF`, grisé si non débloqué, « 847/1 000 » vers le prochain
  palier) ; classement hebdo (rangées avatar + pseudo + XP semaine, moi
  surligné). Densité/typo TV Time (FONTS, jamais fontWeight).
- **Profil** : pastille niveau sur l'avatar (badge circulaire jaune, chiffre
  noir) + rangée « Trophées » (icône `award`) → `/trophies`.
- **Fil social** : rendu des items `kind: 'badge'` (« a débloqué *Marathonien*
  🏆 or »).
- **Toast de déblocage** : le client invalide `['gamification','me']` après
  chaque action de visionnage ; un hook global compare l'ancien/nouveau
  `badges`/`level` et affiche un toast animé (« 🏆 Badge débloqué : … » /
  « ⬆️ Niveau 12 ! »). Réutiliser le pattern SlideUpBar/toast existant.
- Accessibilité : accessibilityLabel sur tout bouton icône-seule.

## 11. Déploiement

Backfill : au démarrage du serveur (ou script one-shot), recompute pour tous
les utilisateurs sans `UserProgress`. Migration Prisma appliquée par le
conteneur au boot. Web export à redéployer.

## Hors périmètre (plus tard)

Push notifications (dev build), classement global public, badges saisonniers,
succès secrets.
