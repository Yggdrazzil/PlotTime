-- DropIndex
DROP INDEX "CommentReaction_commentId_userId_key";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "episodeId" TEXT,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Comment" ("body", "createdAt", "episodeId", "id", "mediaId", "updatedAt", "userId") SELECT "body", "createdAt", "episodeId", "id", "mediaId", "updatedAt", "userId" FROM "Comment";
DROP TABLE "Comment";
ALTER TABLE "new_Comment" RENAME TO "Comment";
CREATE INDEX "Comment_mediaId_idx" ON "Comment"("mediaId");
CREATE INDEX "Comment_episodeId_idx" ON "Comment"("episodeId");
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CommentReaction_commentId_userId_emoji_key" ON "CommentReaction"("commentId", "userId", "emoji");

