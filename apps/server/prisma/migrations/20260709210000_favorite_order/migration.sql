-- Ordre personnalisé des favoris (drag & drop façon TV Time) + date d'ajout aux favoris.
ALTER TABLE "UserMediaStatus" ADD COLUMN "favoriteOrder" INTEGER;
ALTER TABLE "UserMediaStatus" ADD COLUMN "favoritedAt" DATETIME;
