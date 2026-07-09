import React from 'react';
import { FavoritesPage } from '@/components/favorites';

// Page « Séries préférées » (copie TV Time) — logique partagée avec les films
// dans components/favorites.tsx : ajout/suppression (cœurs + recherche), tri,
// réordonnancement drag & drop, partage.
export default function FavoriteShowsScreen() {
  return <FavoritesPage kind="show" />;
}
