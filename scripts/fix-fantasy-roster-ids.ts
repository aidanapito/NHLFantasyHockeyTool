/**
 * Fix FantasyRoster playerId to use database IDs instead of NHL IDs
 * 
 * This script converts existing FantasyRoster entries from NHL IDs to database IDs
 * to match the schema change.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixFantasyRosterIds() {
  console.log('🔧 Fixing FantasyRoster playerId references...\n');

  try {
    // Get all FantasyRoster entries
    const rosters = await prisma.fantasyRoster.findMany({
      include: {
        player: true,
      },
    });

    console.log(`Found ${rosters.length} FantasyRoster entries`);

    let updated = 0;
    let deleted = 0;
    let errors = 0;

    for (const roster of rosters) {
      try {
        // Check if playerId is already a database ID (exists in Player table by id)
        const playerById = await prisma.player.findUnique({
          where: { id: roster.playerId },
        });

        if (playerById) {
          // Already using database ID, skip
          continue;
        }

        // playerId is an NHL ID, need to find the database ID
        const playerByNhlId = await prisma.player.findUnique({
          where: { nhlId: roster.playerId },
        });

        if (!playerByNhlId) {
          console.log(`⚠️  No player found for NHL ID ${roster.playerId}, deleting roster entry ${roster.id}`);
          await prisma.fantasyRoster.delete({
            where: { id: roster.id },
          });
          deleted++;
          continue;
        }

        // Update to use database ID
        await prisma.fantasyRoster.update({
          where: { id: roster.id },
          data: {
            playerId: playerByNhlId.id,
          },
        });

        updated++;
        if (updated % 10 === 0) {
          console.log(`  Updated ${updated} entries...`);
        }
      } catch (error: any) {
        console.error(`❌ Error processing roster ${roster.id}:`, error.message);
        errors++;
      }
    }

    console.log(`\n✅ Fix complete!`);
    console.log(`  - Updated: ${updated}`);
    console.log(`  - Deleted (orphaned): ${deleted}`);
    console.log(`  - Errors: ${errors}`);

    // Now we can update the schema
    console.log(`\n📝 Next step: Run 'npx prisma db push' to apply schema changes`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixFantasyRosterIds();

