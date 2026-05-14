-- CreateTable
CREATE TABLE "WrongAnswer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wordId" INTEGER NOT NULL,
    "dimension" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "wrongCount" INTEGER NOT NULL DEFAULT 1,
    "firstWrongAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastWrongAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WrongAnswer_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WrongAnswer_resolved_lastWrongAt_idx" ON "WrongAnswer"("resolved", "lastWrongAt");

-- CreateIndex
CREATE UNIQUE INDEX "WrongAnswer_wordId_dimension_key" ON "WrongAnswer"("wordId", "dimension");
