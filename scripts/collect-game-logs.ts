/**
 * Collect Game Logs Script
 * 
 * Collects game-by-game statistics for NHL players from the NHL API
 * and stores them in the GameLog table.
 * 
 * Usage:
 *   npm run collect-game-logs -- --season=20232024
 *   npm run collect-game-logs -- --season=20232024 --player-id=8471214
 *   npm run collect-game-logs -- --season=20232024 --dry-run --limit=10
 */

import { PrismaClient } from '@prisma/client';
import { fetchPlayerGameLogs, fetchGoalieGameLogs } from '../lib/nhl-api-service';

const prisma = new PrismaClient();

interface Args {
  season?: string;
  playerId?: number;
  dryRun?: boolean;
  limit?: number;
}

function parseArgs(): Args {
  const args: Args = {};
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--season=')) {
      args.season = arg.split('=')[1];
    } else if (arg.startsWith('--player-id=')) {
      args.playerId = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      args.limit = parseInt(arg.split('=')[1], 10);
    }
  }
  
  return args;
}

async function collectGameLogs() {
  const args = parseArgs();
  
  if (!args.season) {
    console.error('Error: --season parameter is required');
    console.log('Usage: npm run collect-game-logs -- --season=20232024 [--player-id=ID] [--dry-run] [--limit=N]');
    process.exit(1);
  }
  
  console.log(`\n🎯 Collecting game logs for season ${args.season}`);
  if (args.playerId) {
    console.log(`   Player ID: ${args.playerId}`);
  }
  if (args.dryRun) {
    console.log('   ⚠️  DRY RUN MODE - No data will be saved');
  }
  if (args.limit) {
    console.log(`   Limit: ${args.limit} players`);
  }
  console.log('');
  
  try {
    // Get players to process
    let players;
    if (args.playerId) {
      players = await prisma.player.findMany({
        where: { nhlId: args.playerId },
      });
    } else {
      players = await prisma.player.findMany({
        take: args.limit,
      });
    }
    
    if (players.length === 0) {
      console.log('No players found to process.');
      return;
    }
    
    console.log(`Found ${players.length} players to process.\n`);
    
    let totalCollected = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      console.log(`[${i + 1}/${players.length}] Processing ${player.fullName} (ID: ${player.nhlId})...`);
      
      try {
        // Determine if player is a goalie
        const isGoalie = player.position === 'G';
        
        // Fetch game logs
        const gameLogs = isGoalie
          ? await fetchGoalieGameLogs(player.nhlId, args.season!)
          : await fetchPlayerGameLogs(player.nhlId, args.season!);
        
        if (gameLogs.length === 0) {
          console.log(`   ⚠️  No game logs found for ${player.fullName}`);
          continue;
        }
        
        console.log(`   Found ${gameLogs.length} game logs`);
        
        if (!args.dryRun) {
          let collected = 0;
          let skipped = 0;
          
          for (const log of gameLogs) {
            try {
              await prisma.gameLog.upsert({
                where: {
                  playerId_gameId: {
                    playerId: player.id,
                    gameId: log.gameId,
                  },
                },
                update: {},
                create: {
                  playerId: player.id,
                  gameId: log.gameId,
                  gameDate: new Date(log.gameDate),
                  season: log.season,
                  gameType: log.gameType,
                  opponentTeam: log.opponentTeam,
                  isHome: log.isHome,
                  team: log.team,
                  goals: log.goals,
                  assists: log.assists,
                  points: log.points,
                  shots: log.shots,
                  shotsOnGoal: log.shotsOnGoal,
                  hits: log.hits,
                  blocks: log.blocks,
                  powerPlayPoints: log.powerPlayPoints,
                  plusMinus: log.plusMinus,
                  pim: log.pim,
                  timeOnIce: log.timeOnIce,
                  timeOnIceSeconds: log.timeOnIceSeconds,
                  wins: log.wins,
                  saves: log.saves,
                  shotsAgainst: log.shotsAgainst,
                  goalsAgainst: log.goalsAgainst,
                  savePct: log.savePct,
                  shutouts: log.shutouts,
                },
              });
              collected++;
            } catch (error: any) {
              if (error.code === 'P2002') {
                // Unique constraint violation - already exists
                skipped++;
              } else {
                throw error;
              }
            }
          }
          
          console.log(`   ✅ Collected: ${collected}, Skipped (duplicates): ${skipped}`);
          totalCollected += collected;
          totalSkipped += skipped;
        } else {
          console.log(`   📊 Would collect ${gameLogs.length} game logs`);
          totalCollected += gameLogs.length;
        }
      } catch (error: any) {
        console.error(`   ❌ Error processing ${player.name}:`, error.message);
        totalErrors++;
      }
      
      // Small delay between players
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Total collected: ${totalCollected}`);
    if (!args.dryRun) {
      console.log(`   Total skipped (duplicates): ${totalSkipped}`);
    }
    console.log(`   Total errors: ${totalErrors}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

collectGameLogs();

