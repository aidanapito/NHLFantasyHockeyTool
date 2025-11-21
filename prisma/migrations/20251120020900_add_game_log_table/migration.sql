-- CreateTable
CREATE TABLE "GameLog" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameId" INTEGER NOT NULL,
    "gameDate" TIMESTAMP(3) NOT NULL,
    "season" TEXT NOT NULL,
    "gameType" TEXT NOT NULL DEFAULT 'regular',
    "opponentTeam" TEXT NOT NULL,
    "isHome" BOOLEAN NOT NULL,
    "team" TEXT NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "shotsOnGoal" INTEGER NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "blocks" INTEGER NOT NULL DEFAULT 0,
    "powerPlayPoints" INTEGER NOT NULL DEFAULT 0,
    "plusMinus" INTEGER NOT NULL DEFAULT 0,
    "pim" INTEGER NOT NULL DEFAULT 0,
    "timeOnIce" TEXT,
    "timeOnIceSeconds" INTEGER,
    "wins" INTEGER,
    "saves" INTEGER,
    "shotsAgainst" INTEGER,
    "goalsAgainst" INTEGER,
    "savePct" DOUBLE PRECISION,
    "shutouts" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameLog_playerId_gameId_key" ON "GameLog"("playerId", "gameId");

-- CreateIndex
CREATE INDEX "GameLog_gameDate_idx" ON "GameLog"("gameDate");

-- CreateIndex
CREATE INDEX "GameLog_season_idx" ON "GameLog"("season");

-- CreateIndex
CREATE INDEX "GameLog_playerId_gameDate_idx" ON "GameLog"("playerId", "gameDate");

-- CreateIndex
CREATE INDEX "GameLog_gameId_idx" ON "GameLog"("gameId");

-- CreateIndex
CREATE INDEX "GameLog_team_gameDate_idx" ON "GameLog"("team", "gameDate");

-- AddForeignKey
ALTER TABLE "GameLog" ADD CONSTRAINT "GameLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

