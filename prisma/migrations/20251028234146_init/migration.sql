-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "nhlId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "team" TEXT,
    "jerseyNumber" INTEGER,
    "height" TEXT,
    "weight" INTEGER,
    "birthDate" TIMESTAMP(3),
    "birthCity" TEXT,
    "birthCountry" TEXT,
    "nationality" TEXT,
    "headshot" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStats" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "gameType" TEXT NOT NULL DEFAULT 'regular',
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "plusMinus" INTEGER NOT NULL DEFAULT 0,
    "pim" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "shotsOnGoal" INTEGER,
    "shootingPct" DOUBLE PRECISION,
    "powerPlayGoals" INTEGER NOT NULL DEFAULT 0,
    "powerPlayPoints" INTEGER NOT NULL DEFAULT 0,
    "evGoals" INTEGER NOT NULL DEFAULT 0,
    "evPoints" INTEGER NOT NULL DEFAULT 0,
    "shGoals" INTEGER NOT NULL DEFAULT 0,
    "shPoints" INTEGER NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "blockedShots" INTEGER NOT NULL DEFAULT 0,
    "takeaways" INTEGER NOT NULL DEFAULT 0,
    "giveaways" INTEGER NOT NULL DEFAULT 0,
    "totalFaceoffs" INTEGER NOT NULL DEFAULT 0,
    "faceoffsWon" INTEGER NOT NULL DEFAULT 0,
    "faceoffsLost" INTEGER NOT NULL DEFAULT 0,
    "faceoffPct" DOUBLE PRECISION,
    "timeOnIce" TEXT,
    "timeOnIcePerGame" TEXT,
    "wins" INTEGER,
    "losses" INTEGER,
    "otLosses" INTEGER,
    "saves" INTEGER,
    "shotsAgainst" INTEGER,
    "goalsAgainst" INTEGER,
    "savePct" DOUBLE PRECISION,
    "gaa" DOUBLE PRECISION,
    "shutouts" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRefresh" (
    "id" SERIAL NOT NULL,
    "refreshType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastRefresh" TIMESTAMP(3) NOT NULL,
    "recordCount" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRefresh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_nhlId_key" ON "Player"("nhlId");

-- CreateIndex
CREATE INDEX "Player_nhlId_idx" ON "Player"("nhlId");

-- CreateIndex
CREATE INDEX "Player_fullName_idx" ON "Player"("fullName");

-- CreateIndex
CREATE INDEX "Player_position_idx" ON "Player"("position");

-- CreateIndex
CREATE INDEX "Player_team_idx" ON "Player"("team");

-- CreateIndex
CREATE INDEX "PlayerStats_season_idx" ON "PlayerStats"("season");

-- CreateIndex
CREATE INDEX "PlayerStats_points_idx" ON "PlayerStats"("points");

-- CreateIndex
CREATE INDEX "PlayerStats_goals_idx" ON "PlayerStats"("goals");

-- CreateIndex
CREATE INDEX "PlayerStats_assists_idx" ON "PlayerStats"("assists");

-- CreateIndex
CREATE INDEX "PlayerStats_gamesPlayed_idx" ON "PlayerStats"("gamesPlayed");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStats_playerId_season_gameType_key" ON "PlayerStats"("playerId", "season", "gameType");

-- CreateIndex
CREATE INDEX "DataRefresh_refreshType_idx" ON "DataRefresh"("refreshType");

-- CreateIndex
CREATE INDEX "DataRefresh_lastRefresh_idx" ON "DataRefresh"("lastRefresh");

-- AddForeignKey
ALTER TABLE "PlayerStats" ADD CONSTRAINT "PlayerStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
