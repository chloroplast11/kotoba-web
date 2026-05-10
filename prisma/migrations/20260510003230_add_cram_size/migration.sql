-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "dailyNewWords" INTEGER NOT NULL DEFAULT 4,
    "practiceLowFreqUsage" BOOLEAN NOT NULL DEFAULT false,
    "activeLevels" TEXT NOT NULL DEFAULT '[2]',
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "timeOffset" INTEGER NOT NULL DEFAULT 0,
    "cramSize" INTEGER NOT NULL DEFAULT 50
);
INSERT INTO "new_AppSettings" ("activeLevels", "dailyNewWords", "id", "practiceLowFreqUsage", "streak", "timeOffset", "totalReviews") SELECT "activeLevels", "dailyNewWords", "id", "practiceLowFreqUsage", "streak", "timeOffset", "totalReviews" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
