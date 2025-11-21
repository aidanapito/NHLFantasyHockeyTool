-- Fix FantasyRoster to use Player.id instead of Player.nhlId
-- This standardizes all player references to use database IDs

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE "FantasyRoster" DROP CONSTRAINT IF EXISTS "FantasyRoster_playerId_fkey";

-- Step 2: Add temporary column to store database IDs
ALTER TABLE "FantasyRoster" ADD COLUMN "playerDbId" INTEGER;

-- Step 3: Populate playerDbId by looking up Player.id from Player.nhlId
-- This converts NHL IDs to database IDs
UPDATE "FantasyRoster" fr
SET "playerDbId" = p.id
FROM "Player" p
WHERE fr."playerId" = p."nhlId";

-- Step 4: Delete any FantasyRoster entries that couldn't be matched (orphaned records)
DELETE FROM "FantasyRoster" WHERE "playerDbId" IS NULL;

-- Step 5: Rename columns (swap them)
ALTER TABLE "FantasyRoster" RENAME COLUMN "playerId" TO "playerNhlId_old";
ALTER TABLE "FantasyRoster" RENAME COLUMN "playerDbId" TO "playerId";

-- Step 6: Make playerId NOT NULL (since we deleted nulls)
ALTER TABLE "FantasyRoster" ALTER COLUMN "playerId" SET NOT NULL;

-- Step 7: Add new foreign key constraint pointing to Player.id
ALTER TABLE "FantasyRoster" 
  ADD CONSTRAINT "FantasyRoster_playerId_fkey" 
  FOREIGN KEY ("playerId") 
  REFERENCES "Player"("id") 
  ON DELETE CASCADE 
  ON UPDATE CASCADE;

-- Step 8: Update unique constraint (drop and recreate to ensure it's correct)
ALTER TABLE "FantasyRoster" DROP CONSTRAINT IF EXISTS "FantasyRoster_teamId_playerId_key";
ALTER TABLE "FantasyRoster" 
  ADD CONSTRAINT "FantasyRoster_teamId_playerId_key" 
  UNIQUE ("teamId", "playerId");

-- Note: We keep playerNhlId_old column for reference, but you can drop it later if needed:
-- ALTER TABLE "FantasyRoster" DROP COLUMN "playerNhlId_old";

