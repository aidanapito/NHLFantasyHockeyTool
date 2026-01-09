-- CreateTable
CREATE TABLE "FantasyLeague" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "leagueName" TEXT NOT NULL,
    "season" TEXT NOT NULL DEFAULT '20252026',
    "scoringType" TEXT,
    "categories" TEXT[],
    "espnCookies" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FantasyLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTeam" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "ownerName" TEXT,
    "platformTeamId" TEXT NOT NULL,
    "isMyTeam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FantasyTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyRoster" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "slotPosition" TEXT NOT NULL,
    "addedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FantasyRoster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FantasyLeague_platform_platformId_idx" ON "FantasyLeague"("platform", "platformId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyLeague_platform_platformId_season_key" ON "FantasyLeague"("platform", "platformId", "season");

-- CreateIndex
CREATE INDEX "FantasyTeam_leagueId_idx" ON "FantasyTeam"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeam_leagueId_platformTeamId_key" ON "FantasyTeam"("leagueId", "platformTeamId");

-- CreateIndex
CREATE INDEX "FantasyRoster_teamId_idx" ON "FantasyRoster"("teamId");

-- CreateIndex
CREATE INDEX "FantasyRoster_playerId_idx" ON "FantasyRoster"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyRoster_teamId_playerId_key" ON "FantasyRoster"("teamId", "playerId");

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "FantasyLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyRoster" ADD CONSTRAINT "FantasyRoster_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyRoster" ADD CONSTRAINT "FantasyRoster_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("nhlId") ON DELETE CASCADE ON UPDATE CASCADE;


