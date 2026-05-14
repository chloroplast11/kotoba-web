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
    "qualityScore" INTEGER,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Question_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("correctIndex", "dimension", "explanation", "explanationZh", "id", "options", "question", "type", "wordId") SELECT "correctIndex", "dimension", "explanation", "explanationZh", "id", "options", "question", "type", "wordId" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
CREATE TABLE "new_Word" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "word" TEXT NOT NULL,
    "furigana" TEXT NOT NULL,
    "romaji" TEXT NOT NULL,
    "meaningZh" TEXT NOT NULL,
    "meaningEn" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "pos" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "usageNotes" TEXT NOT NULL,
    "exampleSentences" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL,
    "antonyms" TEXT NOT NULL,
    "collocations" TEXT NOT NULL,
    "qualityScore" INTEGER,
    "needsReview" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Word" ("antonyms", "collocations", "exampleSentences", "frequency", "furigana", "id", "level", "meaningEn", "meaningZh", "pos", "romaji", "synonyms", "usageNotes", "word") SELECT "antonyms", "collocations", "exampleSentences", "frequency", "furigana", "id", "level", "meaningEn", "meaningZh", "pos", "romaji", "synonyms", "usageNotes", "word" FROM "Word";
DROP TABLE "Word";
ALTER TABLE "new_Word" RENAME TO "Word";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
