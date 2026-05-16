/*
  Warnings:

  - Added the required column `questionId` to the `WrongAnswer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `wrongChoice` to the `WrongAnswer` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WrongAnswer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questionId" TEXT NOT NULL,
    "wordId" INTEGER NOT NULL,
    "dimension" TEXT NOT NULL,
    "wrongChoice" INTEGER NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "wrongCount" INTEGER NOT NULL DEFAULT 1,
    "firstWrongAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastWrongAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WrongAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WrongAnswer_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_WrongAnswer" ("dimension", "firstWrongAt", "id", "lastWrongAt", "resolved", "wordId", "wrongCount") SELECT "dimension", "firstWrongAt", "id", "lastWrongAt", "resolved", "wordId", "wrongCount" FROM "WrongAnswer";
DROP TABLE "WrongAnswer";
ALTER TABLE "new_WrongAnswer" RENAME TO "WrongAnswer";
CREATE UNIQUE INDEX "WrongAnswer_questionId_key" ON "WrongAnswer"("questionId");
CREATE INDEX "WrongAnswer_resolved_lastWrongAt_idx" ON "WrongAnswer"("resolved", "lastWrongAt");
CREATE INDEX "WrongAnswer_wordId_resolved_idx" ON "WrongAnswer"("wordId", "resolved");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
