/**
 * Check game log coverage for players to understand data availability
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkGameLogCoverage() {
  console.log('📊 Checking GameLog Coverage\n');
  
  // Get total player count
  const totalPlayers = await prisma.player.count();
  console.log(`Total players in database: ${totalPlayers}\n`);
  
  // Get players with any game logs
  const playersWithLogs = await prisma.player.findMany({
    where: {
      gameLogs: {
        some: {}
      }
    },
    select: {
      id: true,
      nhlId: true,
      fullName: true,
    },
    take: 1000, // Sample size
  });
  
  console.log(`Players with at least 1 game log (sample of first 1000): ${playersWithLogs.length}`);
  
  // Check by season
  const seasons = ['20232024', '20252026'];
  
  for (const season of seasons) {
    console.log(`\n=== Season ${season} ===`);
    
    // Count unique players with logs in this season
    const playerIdsWithLogs = await prisma.gameLog.findMany({
      where: { season },
      select: { playerId: true },
      distinct: ['playerId'],
    });
    
    const count = playerIdsWithLogs.length;
    const totalGames = await prisma.gameLog.count({
      where: { season },
    });
    
    console.log(`  Unique players with game logs: ${count}`);
    console.log(`  Total game log entries: ${totalGames}`);
    
    // Get sample of players that DO have logs
    const samplePlayers = await prisma.gameLog.groupBy({
      by: ['playerId'],
      where: { season },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });
    
    if (samplePlayers.length > 0) {
      console.log(`  Top 5 players by game count:`);
      for (const player of samplePlayers) {
        const playerInfo = await prisma.player.findUnique({
          where: { id: player.playerId },
          select: { fullName: true, nhlId: true },
        });
        if (playerInfo) {
          console.log(`    - ${playerInfo.fullName} (ID: ${playerInfo.nhlId}): ${player._count.id} games`);
        }
      }
    }
  }
  
  // Check specific players from the matchup
  console.log(`\n=== Players from Matchup (Problem Players) ===`);
  const matchupPlayerIds = [3899952, 3114755, 3899933, 4271734, 5080230, 3988847, 3899972, 3042002, 3114766, 3020225];
  
  for (const nhlId of matchupPlayerIds) {
    const player = await prisma.player.findUnique({
      where: { nhlId },
      select: {
        id: true,
        nhlId: true,
        fullName: true,
        position: true,
      },
    });
    
    if (!player) {
      console.log(`  NHL ID ${nhlId}: NOT FOUND in Player table`);
      continue;
    }
    
    const totalLogs = await prisma.gameLog.count({
      where: { playerId: player.id },
    });
    
    const logs2023 = await prisma.gameLog.count({
      where: { playerId: player.id, season: '20232024' },
    });
    
    const logs2025 = await prisma.gameLog.count({
      where: { playerId: player.id, season: '20252026' },
    });
    
    console.log(`  ${player.fullName} (${player.position}, NHL ID: ${player.nhlId}):`);
    console.log(`    Total logs: ${totalLogs} | 2023-24: ${logs2023} | 2025-26: ${logs2025}`);
  }
  
  // Check random sample of players to see coverage
  console.log(`\n=== Random Sample of Players ===`);
  const randomPlayers = await prisma.player.findMany({
    take: 20,
    orderBy: { id: 'asc' },
    select: {
      id: true,
      nhlId: true,
      fullName: true,
      position: true,
    },
  });
  
  for (const player of randomPlayers) {
    const totalLogs = await prisma.gameLog.count({
      where: { playerId: player.id },
    });
    
    const logs2023 = await prisma.gameLog.count({
      where: { playerId: player.id, season: '20232024' },
    });
    
    const logs2025 = await prisma.gameLog.count({
      where: { playerId: player.id, season: '20252026' },
    });
    
    const status = totalLogs > 0 ? '✅' : '❌';
    console.log(`  ${status} ${player.fullName} (${player.position}): ${totalLogs} total (2023-24: ${logs2023}, 2025-26: ${logs2025})`);
  }
  
  // Overall statistics
  console.log(`\n=== Overall Statistics ===`);
  const playersWithAnyLogs = await prisma.player.count({
    where: {
      gameLogs: {
        some: {}
      }
    },
  });
  
  const playersWith2023Logs = await prisma.player.count({
    where: {
      gameLogs: {
        some: {
          season: '20232024'
        }
      }
    },
  });
  
  const playersWith2025Logs = await prisma.player.count({
    where: {
      gameLogs: {
        some: {
          season: '20252026'
        }
      }
    },
  });
  
  console.log(`Players with any game logs: ${playersWithAnyLogs} / ${totalPlayers} (${((playersWithAnyLogs / totalPlayers) * 100).toFixed(1)}%)`);
  console.log(`Players with 2023-24 logs: ${playersWith2023Logs} / ${totalPlayers} (${((playersWith2023Logs / totalPlayers) * 100).toFixed(1)}%)`);
  console.log(`Players with 2025-26 logs: ${playersWith2025Logs} / ${totalPlayers} (${((playersWith2025Logs / totalPlayers) * 100).toFixed(1)}%)`);
  
  await prisma.$disconnect();
}

checkGameLogCoverage().catch(console.error);


