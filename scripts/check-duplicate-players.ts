/**
 * Check for duplicate player entries and identify which ones need game logs
 * 
 * Usage:
 *   npm run check-duplicate-players
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDuplicates() {
  console.log('\n🔍 Checking for duplicate player entries...\n');

  // Find all players with duplicate names
  const duplicateNames = await prisma.$queryRaw<Array<{ fullName: string; count: bigint }>>`
    SELECT "fullName", COUNT(*) as count
    FROM "Player"
    GROUP BY "fullName"
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `;

  console.log(`Found ${duplicateNames.length} players with duplicate entries\n`);
  console.log('='.repeat(80));

  const playersNeedingCleanup: Array<{
    name: string;
    correctEntry: { dbId: number; nhlId: number; gameLogs: number };
    duplicateEntry: { dbId: number; nhlId: number; gameLogs: number };
  }> = [];

  for (const dup of duplicateNames.slice(0, 30)) {
    const name = dup.fullName;
    const players = await prisma.player.findMany({
      where: { fullName: name },
      include: {
        _count: {
          select: { gameLogs: true },
        },
      },
    });

    console.log(`\n${name} (${dup.count} entries):`);
    console.log('-'.repeat(80));

    // Sort by game log count (descending)
    const sorted = players.sort((a, b) => b._count.gameLogs - a._count.gameLogs);

    for (const player of sorted) {
      const status = player._count.gameLogs > 0 ? '✅' : '❌';
      console.log(
        `  ${status} DB ID: ${player.id}, NHL ID: ${player.nhlId}, Game Logs: ${player._count.gameLogs}, Team: ${player.team || 'N/A'}`
      );
    }

    // Identify if there's a clear duplicate (one with logs, one without)
    if (sorted.length === 2) {
      const [hasLogs, noLogs] = sorted;
      if (hasLogs._count.gameLogs > 0 && noLogs._count.gameLogs === 0) {
        playersNeedingCleanup.push({
          name,
          correctEntry: {
            dbId: hasLogs.id,
            nhlId: hasLogs.nhlId,
            gameLogs: hasLogs._count.gameLogs,
          },
          duplicateEntry: {
            dbId: noLogs.id,
            nhlId: noLogs.nhlId,
            gameLogs: noLogs._count.gameLogs,
          },
        });
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`Total duplicates: ${duplicateNames.length}`);
  console.log(`Clear duplicates (one with logs, one without): ${playersNeedingCleanup.length}`);

  if (playersNeedingCleanup.length > 0) {
    console.log('\n⚠️  Players that likely need cleanup:');
    console.log('-'.repeat(80));
    for (const p of playersNeedingCleanup) {
      console.log(
        `${p.name}: Keep DB ID ${p.correctEntry.dbId} (NHL ${p.correctEntry.nhlId}, ${p.correctEntry.gameLogs} logs), ` +
          `Remove DB ID ${p.duplicateEntry.dbId} (NHL ${p.duplicateEntry.nhlId}, ${p.duplicateEntry.gameLogs} logs)`
      );
    }
  }

  console.log('\n✅ Check complete!\n');
}

checkDuplicates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

