import { router, type Href } from 'expo-router';

// Retour arrière SÛR : après un rechargement de la web app (changement de
// thème, F5, lien direct/partagé), la pile de navigation est vide et
// `router.back()` ne fait rien — le chevron semblait mort. On retombe alors
// sur un écran de repli adapté à la page (profil, onglet Séries…).
export function goBack(fallback: Href = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
