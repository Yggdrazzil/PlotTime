import React from 'react';
import { FavoritesPage } from '@/components/favorites';

// Page « Films préférés » (copie TV Time) — voir components/favorites.tsx.
export default function FavoriteMoviesScreen() {
  return <FavoritesPage kind="movie" />;
}
