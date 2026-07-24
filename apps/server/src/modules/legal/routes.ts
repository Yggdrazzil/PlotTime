import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';

// Contact affiché sur les pages légales : mailto si SUPPORT_EMAIL est posé en
// prod, sinon repli neutre (pas de lien mort vers une page inexistante).
const CONTACT_HTML = env.SUPPORT_EMAIL
  ? `à l'adresse <a href="mailto:${env.SUPPORT_EMAIL}">${env.SUPPORT_EMAIL}</a>`
  : `depuis l'application (menu Réglages)`;

// Pages légales PUBLIQUES (pas de hook requireAuth : contrairement aux autres
// modules, tout est accessible sans compte — les stores exigent des URLs
// consultables par n'importe qui, y compris les équipes de review Apple/Google).
// HTML statique inline, sans framework : sobre, lisible sur mobile, servi par
// le même Fastify que /health (donc exposé pareil derrière Nginx en prod).

const LAST_UPDATE = '24 juillet 2026';

// Gabarit commun : design volontairement minimal (fond blanc, colonne 720 px).
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — PlotTime</title>
<style>
  body { margin: 0; background: #fff; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 20px 48px; }
  h1 { font-size: 1.7em; line-height: 1.25; margin: 0 0 4px; }
  h2 { font-size: 1.2em; margin: 32px 0 8px; }
  p, li { font-size: 0.98em; }
  ul { padding-left: 22px; }
  a { color: #0a58c2; }
  .updated { color: #666; font-size: 0.9em; margin-bottom: 24px; }
  footer { max-width: 720px; margin: 0 auto; padding: 0 20px 40px; color: #888; font-size: 0.85em; border-top: 1px solid #eee; padding-top: 20px; }
</style>
</head>
<body>
<main>
${body}
</main>
<footer>
  <p>PlotTime — service indépendant, non affilié à TV Time ni à Whip Media.</p>
  <p><a href="/legal/privacy">Politique de confidentialité</a> · <a href="/legal/terms">Conditions d'utilisation</a> · <a href="/legal/delete-account">Supprimer mon compte</a></p>
</footer>
</body>
</html>`;
}

const PRIVACY_HTML = page(
  'Politique de confidentialité',
  `<h1>Politique de confidentialité</h1>
<p class="updated">Dernière mise à jour : ${LAST_UPDATE}</p>

<p>PlotTime est une application de suivi de séries, films et jeux vidéo. La présente
politique décrit quelles données sont traitées, pourquoi, combien de temps, et
quels sont vos droits, conformément au Règlement général sur la protection des
données (RGPD).</p>

<h2>1. Responsable du traitement</h2>
<p>Le service PlotTime est édité à titre indépendant. Pour toute question relative
à vos données, contactez-nous ${CONTACT_HTML}.</p>

<h2>2. Données collectées</h2>
<ul>
  <li><strong>Compte</strong> : nom d'affichage, adresse e-mail (facultative si vous
  vous connectez via Google ou Discord), mot de passe (stocké uniquement sous forme
  hachée, jamais en clair), avatar et bannière éventuels.</li>
  <li><strong>Utilisation du service</strong> : historique de visionnage (séries,
  films, jeux), favoris et listes, notes, commentaires et réponses, réactions,
  abonnements entre utilisateurs, réglages de l'application.</li>
  <li><strong>Données techniques minimales</strong> : journaux serveur temporaires
  (adresse IP, horodatage) nécessaires à la sécurité et au bon fonctionnement.</li>
</ul>
<p>Aucune autre donnée n'est collectée : pas de géolocalisation, pas de contacts,
pas de données publicitaires.</p>

<h2>3. Finalités et base légale</h2>
<p>Les données sont traitées uniquement pour <strong>fournir le service</strong> :
tenir votre bibliothèque, afficher votre progression, permettre les fonctions
sociales (profils, fil d'activité, commentaires) et sécuriser votre compte.
La base légale est <strong>l'exécution du contrat</strong> (article 6.1.b du RGPD) :
sans ces données, le service ne peut pas fonctionner.</p>

<h2>4. Ce que nous ne faisons pas</h2>
<ul>
  <li>Aucune publicité, aucun tracking publicitaire.</li>
  <li>Aucun outil d'analyse ou de mesure d'audience tiers.</li>
  <li>Aucune vente, location ou partage de vos données à des tiers.</li>
</ul>

<h2>5. Sources de données externes</h2>
<p>Les informations sur les œuvres (titres, affiches, résumés, dates) proviennent
de services tiers : <a href="https://www.themoviedb.org" rel="noopener">TMDb</a>,
<a href="https://thetvdb.com" rel="noopener">TheTVDB</a> et
<a href="https://www.igdb.com" rel="noopener">IGDB</a>. Ces requêtes sont
effectuées par notre serveur : <strong>aucune donnée personnelle vous concernant
ne leur est transmise</strong>.</p>

<h2>6. Hébergement et sécurité</h2>
<p>Les données sont hébergées sur un serveur situé en <strong>France (Union
européenne)</strong>. Les échanges entre l'application et le serveur sont chiffrés
(HTTPS). L'accès à la base de données est restreint à l'administration du service.</p>

<h2>7. Durée de conservation</h2>
<ul>
  <li>Les données de votre compte sont conservées <strong>tant que le compte existe</strong>.</li>
  <li>À la suppression du compte, l'ensemble des données associées (bibliothèque,
  historique, commentaires, abonnements, réglages) est <strong>effacé immédiatement
  et définitivement</strong> (suppression en cascade, sans copie de rétention).</li>
  <li>Les journaux techniques du serveur sont conservés pour une courte durée
  (quelques semaines au maximum) à des fins de sécurité, puis supprimés.</li>
</ul>

<h2>8. Vos droits</h2>
<p>Conformément au RGPD, vous disposez des droits suivants :</p>
<ul>
  <li><strong>Accès et portabilité</strong> : l'application permet d'exporter
  l'intégralité de vos données au format JSON (Paramètres → Exporter mes données).</li>
  <li><strong>Rectification</strong> : votre profil et vos contenus sont modifiables
  directement dans l'application.</li>
  <li><strong>Effacement</strong> : la <a href="/legal/delete-account">suppression du
  compte</a> est disponible dans l'application (Paramètres → Supprimer le compte),
  avec effet immédiat.</li>
  <li><strong>Réclamation</strong> : vous pouvez saisir la CNIL (cnil.fr) si vous
  estimez que vos droits ne sont pas respectés.</li>
</ul>

<h2>9. Cookies et stockage local</h2>
<p>PlotTime n'utilise <strong>aucun cookie tiers</strong> ni traceur. La version web
utilise uniquement le stockage local du navigateur pour des besoins strictement
techniques : jeton de session et préférences d'affichage (thème). Ces éléments ne
servent à aucun profilage.</p>

<h2>10. Mineurs</h2>
<p>Le service n'est pas destiné aux enfants de moins de 13 ans. Le contenu réservé
aux adultes est masqué par défaut.</p>

<h2>11. Modifications</h2>
<p>Cette politique peut évoluer avec le service ; la date de mise à jour figure en
haut de page. En cas de changement substantiel, une information sera affichée dans
l'application.</p>`,
);

const TERMS_HTML = page(
  "Conditions d'utilisation",
  `<h1>Conditions d'utilisation</h1>
<p class="updated">Dernière mise à jour : ${LAST_UPDATE}</p>

<p>Les présentes conditions régissent l'utilisation de PlotTime (application mobile
et web). En créant un compte ou en utilisant le service, vous les acceptez.</p>

<h2>1. Le service</h2>
<p>PlotTime permet de suivre ses séries, films et jeux vidéo : progression,
bibliothèque, favoris, listes, statistiques, et fonctions sociales (profils,
abonnements, fil d'activité, commentaires). Le service est fourni gratuitement,
sans publicité, « en l'état » et sans garantie de disponibilité permanente.</p>

<h2>2. Votre compte</h2>
<ul>
  <li>Vous êtes responsable de la confidentialité de vos identifiants et de
  l'activité effectuée depuis votre compte.</li>
  <li>Un compte est personnel ; ne créez pas de compte au nom d'un tiers.</li>
  <li>Vous pouvez supprimer votre compte à tout moment dans l'application
  (Paramètres → Supprimer le compte) — l'effacement est immédiat et définitif.</li>
</ul>

<h2>3. Règles de communauté</h2>
<p>PlotTime héberge du contenu créé par ses utilisateurs (commentaires, réponses,
profils, listes). Pour que le service reste agréable et sûr, les règles suivantes
s'appliquent à tout contenu publié :</p>
<ul>
  <li><strong>Pas de haine ni de harcèlement</strong> : sont interdits les propos
  haineux, discriminatoires, menaçants, ainsi que le harcèlement ou l'intimidation
  d'autres utilisateurs.</li>
  <li><strong>Pas de contenu sexuel</strong> : les contenus sexuellement explicites
  ou pornographiques sont interdits dans les commentaires, profils et tout espace
  public de l'application.</li>
  <li><strong>Pas de contenu illégal</strong> : pas d'incitation à la violence, de
  contenu portant atteinte aux droits d'autrui, de spam ou d'usurpation d'identité.</li>
  <li><strong>Respect des spoilers</strong> : utilisez les mécanismes prévus par
  l'application pour ne pas gâcher l'expérience des autres.</li>
</ul>
<p><strong>Modération</strong> : un filtre automatique multilingue bloque les
contenus manifestement abusifs à la publication, et chaque utilisateur peut
<strong>signaler</strong> un contenu inapproprié depuis l'application. Les
signalements sont examinés ; en cas d'abus, PlotTime se réserve le droit de
<strong>supprimer les contenus concernés et de suspendre ou supprimer le compte</strong>
de leur auteur, sans préavis en cas de manquement grave.</p>

<h2>4. Contenus et propriété intellectuelle</h2>
<ul>
  <li>Vous conservez les droits sur les contenus que vous publiez et accordez à
  PlotTime la licence nécessaire pour les afficher dans le service.</li>
  <li>Les informations et visuels des œuvres (titres, affiches, résumés)
  proviennent de TMDb, TheTVDB et IGDB et restent la propriété de leurs ayants
  droit respectifs.
  <br>This product uses the TMDB API but is not endorsed or certified by TMDB.</li>
  <li>PlotTime est un service indépendant, non affilié à TV Time ni à Whip Media.</li>
</ul>

<h2>5. Usage acceptable</h2>
<p>Il est interdit de perturber le service (surcharge délibérée, tentative d'accès
non autorisé, extraction massive de données) ou d'utiliser le service à des fins
illégales.</p>

<h2>6. Responsabilité</h2>
<p>Le service est fourni gratuitement et à titre bénévole : dans les limites
permises par la loi, PlotTime ne saurait être tenu responsable des dommages
indirects liés à l'utilisation ou à l'indisponibilité du service. Vos données
peuvent être exportées à tout moment depuis l'application.</p>

<h2>7. Évolution des conditions</h2>
<p>Ces conditions peuvent évoluer avec le service ; la date de mise à jour figure
en haut de page. La poursuite de l'utilisation après modification vaut acceptation.</p>

<h2>8. Contact</h2>
<p>Pour toute question, contactez-nous ${CONTACT_HTML}.</p>`,
);

const DELETE_ACCOUNT_HTML = page(
  'Supprimer mon compte',
  `<h1>Supprimer mon compte PlotTime</h1>
<p class="updated">Dernière mise à jour : ${LAST_UPDATE}</p>

<p>La suppression de votre compte s'effectue <strong>directement dans
l'application</strong> (mobile ou web), en quelques secondes :</p>

<ol>
  <li>Connectez-vous à votre compte PlotTime.</li>
  <li>Ouvrez <strong>Paramètres</strong> (depuis votre profil).</li>
  <li>Dans l'onglet <strong>Compte</strong>, touchez <strong>Supprimer le compte</strong>.</li>
  <li>Confirmez en tapant <strong>SUPPRIMER</strong>.</li>
</ol>

<h2>Ce qui est supprimé</h2>
<p>La suppression est <strong>immédiate et définitive</strong>. Elle efface en
cascade l'ensemble des données associées au compte :</p>
<ul>
  <li>le compte lui-même (e-mail, nom d'affichage, avatar, bannière, comptes liés) ;</li>
  <li>l'historique de visionnage (séries, films, jeux) et la progression ;</li>
  <li>les favoris, listes, notes et réglages ;</li>
  <li>les commentaires, réponses et réactions ;</li>
  <li>les abonnements et abonnés.</li>
</ul>
<p>Aucune donnée n'est conservée après la suppression : il n'existe pas de délai de
rétention ni de possibilité de restauration. Pensez à <strong>exporter vos
données</strong> au préalable si vous souhaitez en garder une copie (Paramètres →
Exporter mes données PlotTime).</p>

<h2>Vous ne pouvez plus vous connecter ?</h2>
<p>Si vous n'avez plus accès à votre compte, contactez-nous ${CONTACT_HTML} en précisant
l'adresse e-mail ou le nom d'affichage du compte : la suppression sera effectuée
manuellement après vérification.</p>`,
);

export async function legalRoutes(app: FastifyInstance): Promise<void> {
  // Pas de preHandler requireAuth : routes publiques par construction.
  app.get('/legal/privacy', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(PRIVACY_HTML);
  });

  app.get('/legal/terms', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(TERMS_HTML);
  });

  app.get('/legal/delete-account', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(DELETE_ACCOUNT_HTML);
  });
}
