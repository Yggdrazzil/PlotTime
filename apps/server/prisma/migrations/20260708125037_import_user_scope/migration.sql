-- Scope des imports TV Time par utilisateur (audit 2026-07-08) :
-- ajoute Import.userId, remplace l'unicité globale du fileHash par (userId, fileHash).

-- DropIndex
DROP INDEX "Import_fileHash_key";

-- AlterTable
ALTER TABLE "Import" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Import_userId_idx" ON "Import"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Import_userId_fileHash_key" ON "Import"("userId", "fileHash");
