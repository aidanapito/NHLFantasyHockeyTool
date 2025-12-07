-- CreateTable
CREATE TABLE "DraftPosition" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "leagueId" TEXT,
    "season" TEXT NOT NULL,
    "draftPick" INTEGER NOT NULL,
    "draftRound" INTEGER NOT NULL,
    "teamName" TEXT,
    "expectedValue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftPosition_draftPick_idx" ON "DraftPosition"("draftPick");

-- CreateIndex
CREATE INDEX "DraftPosition_leagueId_idx" ON "DraftPosition"("leagueId");

-- CreateIndex
CREATE INDEX "DraftPosition_season_idx" ON "DraftPosition"("season");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPosition_playerId_leagueId_season_key" ON "DraftPosition"("playerId", "leagueId", "season");

-- AddForeignKey
ALTER TABLE "DraftPosition" ADD CONSTRAINT "DraftPosition_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("nhlId") ON DELETE RESTRICT ON UPDATE CASCADE;
