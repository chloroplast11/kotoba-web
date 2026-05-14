-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wordId" INTEGER NOT NULL,
    "dimension" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "question" TEXT,
    "options" TEXT NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "explanationZh" TEXT,
    CONSTRAINT "Question_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("correctIndex", "dimension", "explanation", "explanationZh", "id", "options", "question", "type", "wordId") SELECT "correctIndex", "dimension", "explanation", "explanationZh", "id", "options", "question", "type", "wordId" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
