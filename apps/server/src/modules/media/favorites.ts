import { prisma } from '../../db/client.js';

// Prochaine position dans l'ordre personnalisé des favoris (drag & drop) :
// un nouvel ajout arrive en fin de liste, comme TV Time.
export async function nextFavoriteOrder(userId: string, type: 'show' | 'movie' | 'game'): Promise<number> {
  const last = await prisma.userMediaStatus.findFirst({
    where: { userId, isFavorite: true, media: { type } },
    orderBy: { favoriteOrder: 'desc' },
    select: { favoriteOrder: true },
  });
  return (last?.favoriteOrder ?? -1) + 1;
}
