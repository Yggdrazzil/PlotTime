-- AlterTable
ALTER TABLE "Media" ADD COLUMN "igdbId" TEXT;

-- AlterTable
ALTER TABLE "UserMediaStatus" ADD COLUMN "playtimeMinutes" INTEGER;

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaId" TEXT NOT NULL,
    "platforms" TEXT,
    "developer" TEXT,
    "publisher" TEXT,
    "gameModes" TEXT,
    "steamAppId" TEXT,
    "isDlc" BOOLEAN NOT NULL DEFAULT false,
    "parentGameId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Game_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Game_parentGameId_fkey" FOREIGN KEY ("parentGameId") REFERENCES "Media" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_mediaId_key" ON "Game"("mediaId");

-- CreateIndex
CREATE INDEX "Game_steamAppId_idx" ON "Game"("steamAppId");

-- CreateIndex
CREATE INDEX "Game_parentGameId_idx" ON "Game"("parentGameId");
