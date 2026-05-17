-- CreateTable
CREATE TABLE "Word" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "word" TEXT NOT NULL,
    "furigana" TEXT NOT NULL,
    "meaningZh" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "pos" TEXT NOT NULL,
    "exampleSentences" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL,
    "pitchAccent" TEXT,
    "homophones" TEXT,
    "audioFile" TEXT,
    "qualityScore" INTEGER,
    "needsReview" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Question" (
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
CREATE TABLE "WrongAnswer" (
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
    "activeLevels" TEXT NOT NULL DEFAULT '[2]',
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "timeOffset" INTEGER NOT NULL DEFAULT 0,
    "cramSize" INTEGER NOT NULL DEFAULT 50,
    "audioAutoplay" BOOLEAN NOT NULL DEFAULT true,
    "listeningRatio" INTEGER NOT NULL DEFAULT 30
);

-- CreateIndex
CREATE INDEX "UserWordState_due_idx" ON "UserWordState"("due");

-- CreateIndex
CREATE UNIQUE INDEX "UserWordState_wordId_dimension_key" ON "UserWordState"("wordId", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "WrongAnswer_questionId_key" ON "WrongAnswer"("questionId");

-- CreateIndex
CREATE INDEX "WrongAnswer_resolved_lastWrongAt_idx" ON "WrongAnswer"("resolved", "lastWrongAt");

-- CreateIndex
CREATE INDEX "WrongAnswer_wordId_resolved_idx" ON "WrongAnswer"("wordId", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "DailySession_date_key" ON "DailySession"("date");
