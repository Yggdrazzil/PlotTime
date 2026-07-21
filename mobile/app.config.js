// Config dynamique Expo : identique à app.json, mais permet de « baker » l'URL
// du serveur au moment d'un build/export via la variable d'environnement
// SERIETIME_SERVER_URL, sans toucher app.json (le dev local garde l'écran
// « URL du serveur » tant que la variable n'est pas définie).
//
//   SERIETIME_SERVER_URL=https://serietime.studio-vives.fr npx expo export -p web
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    // Code-splitting web (Async Routes d'expo-router) : chaque route devient un
    // chunk chargé à la demande au lieu d'un bundle monolithique. Web uniquement
    // (natif : non supporté en production, comportement inchangé). NB : c'est la
    // forme supportée par expo-router 6 / SDK 54 — le plugin « expo-router »
    // fusionne ses options dans `extra.router`, que lit @expo/cli
    // (getAsyncRoutesFromExpoConfig) ; il n'existe pas d'`experiments.asyncRoutes`.
    router: {
      ...(config.extra?.router ?? {}),
      asyncRoutes: { web: true },
    },
    serverUrl: process.env.SERIETIME_SERVER_URL ?? config.extra?.serverUrl ?? '',
  },
});
