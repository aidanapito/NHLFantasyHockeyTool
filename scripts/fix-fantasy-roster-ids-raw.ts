/**
 * Fix FantasyRoster playerId using raw SQL
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixFantasyRosterIds() {
  console.log('🔧 Fixing FantasyRoster playerId references using raw SQL...\n');

  try {
    // Step 1: Drop the foreign key constraint temporarily
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "FantasyRoster" 
      DROP CONSTRAINT IF EXISTS "FantasyRoster_playerId_fkey";
    `);
    console.log('✅ Dropped foreign key constraint');

    // Step 2: Add temporary column
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "FantasyRoster" 
      ADD COLUMN IF NOT EXISTS "playerDbId" INTEGER;
    `);
    console.log('✅ Added temporary column');

    // Step 3: Convert NHL IDs to database IDs
    const result = await prisma.$executeRawUnsafe(`
      UPDATE "FantasyRoster" fr
      SET "playerDbId" = p.id
      FROM "Player" p
      WHERE fr."playerId" = p."nhlId";
    `);
    console.log(`✅ Converted ${result} entries`);

    // Step 4: Delete orphaned records
    const deleted = await prisma.$executeRawUnsafe(`
      DELETE FROM "FantasyRoster" 
      WHERE "playerDbId" IS NULL;
    `);
    console.log(`✅ Deleted ${deleted} orphaned entries`);

    // Step 5: Swap columns
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "FantasyRoster" 
      RENAME COLUMN "playerId" TO "playerNhlId_old";
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "FantasyRoster" 
      RENAME COLUMN "playerDbId" TO "playerId";
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "FantasyRoster" 
      ALTER COLUMN "playerId" SET NOT NULL;
    `);
    console.log('✅ Swapped columns');

    // Step 6: Add new foreign key
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "FantasyRoster" 
      ADD CONSTRAINT "FantasyRoster_playerId_fkey" 
      FOREIGN KEY ("playerId") 
      REFERENCES "Player"("id") 
      ON DELETE CASCADE 
      ON UPDATE CASCADE;
    `);
    console.log('✅ Added new foreign key constraint');

    console.log(`\n✅ Fix complete!`);
    console.log(`\n📝 Now run: npx prisma generate`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixFantasyRosterIds();

