-- CreateTable
CREATE TABLE "Word" (
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
    "collocations" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wordId" INTEGER NOT NULL,
    "dimension" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "questionPlain" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "explanationPlain" TEXT,
    "explanationZh" TEXT,
    CONSTRAINT "Question_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserWordState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wordId" INTEGER NOT NULL,
    "dimension" TEXT NOT NULL,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "due" DATETIME,
    "lastReview" DATETIME,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "fsrsState" INTEGER NOT NULL DEFAULT 0,
    "learnedAt" DATETIME,
    CONSTRAINT "UserWordState_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailySession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "results" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "dailyNewWords" INTEGER NOT NULL DEFAULT 4,
    "practiceLowFreqUsage" BOOLEAN NOT NULL DEFAULT false,
    "activeLevels" TEXT NOT NULL DEFAULT '[2]',
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "timeOffset" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "UserWordState_due_idx" ON "UserWordState"("due");

-- CreateIndex
CREATE UNIQUE INDEX "UserWordState_wordId_dimension_key" ON "UserWordState"("wordId", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "DailySession_date_key" ON "DailySession"("date");
