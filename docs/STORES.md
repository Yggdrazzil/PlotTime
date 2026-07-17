# PlotTime — Conformité stores & mode opératoire de publication

> Rédigé le 2026-07-17 (Claude), sur audit du code réel. Cible : **v1 gratuite,
> sans pub ni paiement** (décision d'équipe). À jour de `main@a436a57`.

## Partie A — Conformité : ce qui est DÉJÀ bon ✅

| Exigence | État |
|---|---|
| Suppression de compte **dans l'app** (exigée par Apple 5.1.1(v) et Google) | ✅ Paramètres → Supprimer le compte |
| Modération du contenu UGC (commentaires) | ✅ Filtre multilingue + popup de blocage |
| Signalement de contenu inapproprié (œuvres) | ✅ Menu ⋯ → Signaler |
| Identité propre (pas de copie de marque TV Time) | ✅ PlotTime, logo, icônes, thèmes |
| Icônes tous formats (iOS 1024, Play 512, adaptive, maskable) | ✅ `mobile/assets/branding/` |
| Pas de contenu porno par défaut + interrupteur 18+ | ✅ (voir réserve A7) |
| Clés API côté serveur uniquement | ✅ |
| Chiffrement classique HTTPS uniquement | ✅ (déclaration « exempt » suffira) |

## Partie A' — Ce qu'il RESTE à implémenter, par priorité

### 🔴 A1. Connexion native — BLOQUANT ABSOLU
Le SSO Google/Discord est **web-only** (`ssoWebAvailable()`), et l'inscription
e-mail est **désactivée en prod** (`ALLOW_EMAIL_SIGNUP=false`). Conséquence :
**un build natif publié aujourd'hui ne permettrait à personne de créer un
compte.** À faire :
- **Google natif** : `expo-auth-session` (client IDs Android + iOS à créer dans
  la console Google, à ajouter à `GOOGLE_CLIENT_IDS` côté serveur).
- **Discord natif** : `expo-auth-session` avec scheme custom (redirect URI à
  déclarer dans l'app Discord).
- **Sign in with Apple** : **obligatoire** (guideline Apple 4.8 : toute app qui
  propose un login social tiers DOIT offrir Sign in with Apple). Package
  `expo-apple-authentication` + vérification du jeton côté serveur (colonne
  `appleId` déjà en base, vérif à écrire dans `auth/routes.ts`).
- Estimation : le plus gros chantier restant (2-3 jours avec tests).

### 🔴 A2. Politique de confidentialité — obligatoire avant soumission
Aucune page n'existe. Les deux stores exigent une **URL publique** ; Apple exige
aussi le lien dans l'app. À faire : page web (peut être servie par le serveur,
ex. `https://serietime.studio-vives.fr/privacy`) couvrant : données collectées
(e-mail, pseudo, historique de visionnage, commentaires), finalité, durée,
droit de suppression (l'app le permet), contact. + lien dans Paramètres.
Idem une page **CGU** (exigée par Apple pour les apps UGC).

### 🔴 A3. Attributions TMDb / TheTVDB / IGDB — absentes de l'app
Les conditions TMDb **imposent** la mention « This product uses the TMDB API
but is not endorsed or certified by TMDB » + logo. TheTVDB demande une mention
d'attribution ; IGDB (Twitch) aussi. Actuellement : **aucune attribution nulle
part**. Apple/Google vérifient la propriété intellectuelle (guideline 5.2) et
TMDb peut couper la clé. À faire : bloc « Sources de données » dans Paramètres
(ou À propos) avec les 3 mentions + logos.

### 🟠 A4. Outils UGC manquants (Apple 1.2 / Google UGC policy)
Pour une app avec commentaires et profils publics, les stores exigent :
- **Signaler un commentaire** (on ne peut signaler que des œuvres aujourd'hui) ;
- **Bloquer un utilisateur** (masquer son contenu) — requis explicitement par
  Apple 1.2 ;
- Un texte de règles de communauté accessible (peut vivre dans les CGU).

### 🟠 A5. Lien web de suppression de compte (Google)
Google exige, en plus de la suppression in-app, une **URL web** de demande de
suppression (déclarée dans le formulaire Data Safety). Une page minimaliste
« connectez-vous puis Paramètres → Supprimer » ou un mailto documenté suffit
au début, mais une vraie page est plus propre.

### 🟠 A6. Identifiants d'app — À DÉCIDER AVANT le premier upload
`app.json` : `bundleIdentifier`/`package` = **`com.serietime.app`**, slug
`serietime`. Sur Google Play le package est **définitif** (impossible à changer
après le premier upload). Décision d'équipe : garder `com.serietime.app` (invisible
pour l'utilisateur) ou basculer `com.plottime.app` MAINTENANT. Recommandé :
`com.plottime.app` pour la cohérence long terme. Vérifier aussi la
disponibilité du nom « PlotTime » sur les deux stores.

### 🟡 A7. Classification d'âge et interrupteur 18+
Avec commentaires (UGC) + l'interrupteur « Contenu 18+ », viser une
classification **17+ (Apple) / IARC 16-18 (Google)**. Réserve : Apple est
très strict sur le contenu sexuellement explicite même opt-in (guideline
1.1.4). Recommandation v1 : **masquer l'interrupteur 18+ sur les builds iOS**
(une ligne : `Platform.OS === 'ios'`) et le garder sur web/Android, OU assumer
le 17+ et voir la review. À trancher en équipe.

### 🟡 A8. Divers soumission
- **Compte de démo pour la review Apple** (l'app exige un login) : un compte
  e-mail de test (le login e-mail existe toujours) + le noter dans « Notes for
  Review ».
- URL de support (page contact ou mailto) — champ obligatoire.
- `ITSAppUsesNonExemptEncryption = false` dans app.json (HTTPS only).
- Play Console (compte personnel) : **test fermé ~12-20 testeurs pendant
  14 jours obligatoire** avant la production — prévoir le délai, vos comptes
  Discord d'amis feront l'affaire.

## Partie B — Mode opératoire de publication (cross-platform, via EAS)

Un seul code (Expo) → deux binaires. Tout se fait avec **EAS Build/Submit**
(cloud Expo, pas besoin de Xcode/Android Studio en local).

### B0. Prérequis (une fois)
1. **Apple Developer Program** : 99 $/an — compte individuel OK.
   developer.apple.com → inscription (24-48 h de validation).
2. **Google Play Console** : 25 $ une fois — play.google.com/console.
3. `npm i -g eas-cli && eas login` (compte Expo gratuit).
4. Trancher A6 (package name) et faire A1-A3 avant.

### B1. Configuration du projet
```bash
cd mobile
eas build:configure          # crée eas.json (profils development/preview/production)
```
Dans `app.json` : version `1.0.0`, `android.versionCode`/`ios.buildNumber` = 1,
package/bundle définitifs, `ITSAppUsesNonExemptEncryption: false`,
permissions minimales. L'URL serveur est déjà bakée via `extra.serverUrl`.

### B2. Builds
```bash
eas build -p android --profile production   # → .aab signé (EAS gère le keystore)
eas build -p ios --profile production       # → .ipa (EAS crée certs/profils via ton compte Apple)
```
Première fois iOS : répondre aux questions d'authentification Apple (EAS crée
les certificats et provisioning profiles automatiquement).

### B3. Fiches store (préparer en parallèle des builds)
- **Commun** : description FR (+EN si visé), captures d'écran par taille
  d'appareil (6,7" et 5,5" iPhone ; téléphone + éventuellement 7"/10" Android),
  icône, URL politique de confidentialité, URL support, catégorie
  (Divertissement), classification d'âge (questionnaires — cf. A7).
- **Play spécifique** : bannière « feature graphic » 1024×500, formulaire
  **Data Safety** (données : e-mail, contenu utilisateur, identifiants —
  collectées, non partagées, chiffrées en transit, suppression possible),
  lien web de suppression (A5).
- **Apple spécifique** : questionnaire App Privacy (mêmes réponses), notes de
  review + **compte de démo** (A8).

### B4. Soumission
```bash
eas submit -p ios       # envoie le build sur App Store Connect → TestFlight
eas submit -p android   # envoie le .aab sur la Play Console (piste interne)
```
- **iOS** : TestFlight (vous deux + amis) → quand stable, « Soumettre pour
  review ». Review Apple : 1-3 jours en général. Rejets fréquents pour : 4.8
  (Sign in with Apple manquant), 1.2 (pas de blocage utilisateur), 5.1.1
  (privacy policy) — d'où les priorités de la partie A.
- **Android** : piste interne → **test fermé 14 jours avec ~12-20 testeurs**
  (obligation compte personnel) → production. Review Google : quelques heures
  à 2 jours.

### B5. Après publication
- Correctifs JS/UI : `eas update` (OTA, sans repasser par les stores, pour les
  changements non-natifs).
- Changement natif (nouveau package, permission…) : nouveau build + review.
- Chaque release : incrémenter `versionCode`/`buildNumber`.

### Ordre de bataille proposé
1. A6 (décision package) — 5 min de discussion
2. A2 + A3 + A5 (privacy, CGU, attributions, page suppression) — 1 journée
3. A1 (auth native Google/Discord/Apple) — 2-3 jours, LE chantier
4. A4 (signaler commentaire + bloquer utilisateur) — ½ journée
5. A7 (décision 18+ iOS) — 5 min de discussion
6. B0→B4 : comptes, builds, TestFlight/test fermé (compter les 14 jours Google)

**Réaliste : ~1 semaine de dev + les délais d'inscription et de test fermé.**
