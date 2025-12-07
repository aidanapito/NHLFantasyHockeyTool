/**
 * MoneyPuck Game Log Import Script
 * 
 * Imports historical game-by-game data from MoneyPuck CSV files.
 * 
 * Usage:
 *   tsx scripts/import-moneypuck.ts <csv-file-path> [--season=20232024] [--dry-run]
 * 
 * Example:
 *   tsx scripts/import-moneypuck.ts ./data/moneypuck_2023-24.csv --season=20232024
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

interface MoneyPuckRow {
  game_id?: string;
  gameId?: string;
  player_name?: string;
  playerName?: string;
  name?: string;
  team?: string;
  opponent?: string;
  date?: string;
  gameDate?: string;
  goals?: string;
  assists?: string;
  points?: string;
  shots?: string;
  shotsOnGoal?: string;
  hits?: string;
  blocks?: string;
  blockedShots?: string;
  powerPlayPoints?: string;
  ppp?: string;
  plusMinus?: string;
  pim?: string;
  penaltyMinutes?: string;
  timeOnIce?: string;
  toi?: string;
  timeOnIceSeconds?: string;
  wins?: string;
  saves?: string;
  shotsAgainst?: string;
  goalsAgainst?: string;
  savePct?: string;
  shutouts?: string;
  isHome?: string;
  home?: string;
  season?: string;
}

interface ImportStats {
  totalRows: number;
  processed: number;
  inserted: number;
  skipped: number;
  errors: number;
  playerNotFound: number;
  duplicates: number;
}

/**
 * Parse CSV file
 */
function parseCSV(filePath: string): MoneyPuckRow[] {
  console.log(`📖 Reading CSV file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  
  try {
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    }) as MoneyPuckRow[];
    
    console.log(`✓ Parsed ${records.length} rows from CSV`);
    return records;
  } catch (error) {
    console.error('❌ Error parsing CSV:', error);
    throw error;
  }
}

/**
 * Normalize player name for matching
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\./g, '') // Remove periods
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Find player in database by name
 */
async function findPlayerByName(playerName: string): Promise<{ id: number; nhlId: number } | null> {
  const normalized = normalizeName(playerName);
  
  // Try exact match first
  let player = await prisma.player.findFirst({
    where: {
      fullName: {
        equals: playerName,
        mode: 'insensitive',
      },
    },
    select: { id: true, nhlId: true },
  });

  if (player) return player;

  // Try normalized match
  const allPlayers = await prisma.player.findMany({
    where: { isActive: true },
    select: { id: true, nhlId: true, fullName: true },
  });

  for (const p of allPlayers) {
    if (normalizeName(p.fullName) === normalized) {
      return { id: p.id, nhlId: p.nhlId };
    }
  }

  return null;
}

/**
 * Parse date string to DateTime
 */
function parseDate(dateStr: string): Date {
  // Handle various date formats
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return date;
}

/**
 * Parse time on ice string to seconds
 */
function parseTimeOnIce(timeStr: string | undefined): { seconds: number | null; formatted: string | null } {
  if (!timeStr) return { seconds: null, formatted: null };
  
  // Handle "MM:SS" format
  const match = timeStr.match(/(\d+):(\d+)/);
  if (match) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const totalSeconds = minutes * 60 + seconds;
    return { seconds: totalSeconds, formatted: timeStr };
  }
  
  // Handle seconds as number
  const seconds = parseInt(timeStr, 10);
  if (!isNaN(seconds)) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return { seconds, formatted: `${mins}:${secs.toString().padStart(2, '0')}` };
  }
  
  return { seconds: null, formatted: null };
}

/**
 * Determine season from date
 */
function getSeasonFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  
  // NHL season starts in October (month 9)
  if (month >= 9) {
    // October-December: current year to next year
    return `${year}${year + 1}`;
  } else {
    // January-September: previous year to current year
    return `${year - 1}${year}`;
  }
}

/**
 * Convert MoneyPuck row to GameLog data
 */
async function convertRowToGameLog(
  row: MoneyPuckRow,
  seasonOverride?: string
): Promise<{
  playerId: number;
  gameId: number;
  gameDate: Date;
  season: string;
  gameType: string;
  opponentTeam: string;
  isHome: boolean;
  team: string;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shotsOnGoal: number;
  hits: number;
  blocks: number;
  powerPlayPoints: number;
  plusMinus: number;
  pim: number;
  timeOnIce: string | null;
  timeOnIceSeconds: number | null;
  wins: number | null;
  saves: number | null;
  shotsAgainst: number | null;
  goalsAgainst: number | null;
  savePct: number | null;
  shutouts: number | null;
} | null> {
  // Get player name from various possible column names
  const playerName = row.player_name || row.playerName || row.name;
  if (!playerName) {
    throw new Error('Missing player name');
  }

  // Find player in database
  const player = await findPlayerByName(playerName);
  if (!player) {
    return null; // Player not found
  }

  // Get game ID
  const gameId = parseInt(row.game_id || row.gameId || '0', 10);
  if (!gameId || isNaN(gameId)) {
    throw new Error(`Invalid game ID: ${row.game_id || row.gameId}`);
  }

  // Parse date
  const dateStr = row.date || row.gameDate;
  if (!dateStr) {
    throw new Error('Missing game date');
  }
  const gameDate = parseDate(dateStr);

  // Determine season
  const season = seasonOverride || row.season || getSeasonFromDate(gameDate);

  // Get team and opponent
  const team = row.team || '';
  const opponentTeam = row.opponent || '';
  
  // Determine if home game
  const isHomeStr = row.isHome || row.home || '';
  const isHome = isHomeStr === '1' || isHomeStr === 'true' || isHomeStr.toLowerCase() === 'home';

  // Parse stats (handle various column name variations)
  const goals = parseInt(row.goals || '0', 10) || 0;
  const assists = parseInt(row.assists || '0', 10) || 0;
  const points = parseInt(row.points || '0', 10) || (goals + assists);
  const shots = parseInt(row.shots || '0', 10) || 0;
  const shotsOnGoal = parseInt(row.shotsOnGoal || row.shots || '0', 10) || 0;
  const hits = parseInt(row.hits || '0', 10) || 0;
  const blocks = parseInt(row.blocks || row.blockedShots || '0', 10) || 0;
  const powerPlayPoints = parseInt(row.powerPlayPoints || row.ppp || '0', 10) || 0;
  const plusMinus = parseInt(row.plusMinus || '0', 10) || 0;
  const pim = parseInt(row.pim || row.penaltyMinutes || '0', 10) || 0;

  // Parse time on ice
  const toi = parseTimeOnIce(row.timeOnIce || row.toi || row.timeOnIceSeconds);

  // Goalie stats (nullable)
  const wins = row.wins ? parseInt(row.wins, 10) : null;
  const saves = row.saves ? parseInt(row.saves, 10) : null;
  const shotsAgainst = row.shotsAgainst ? parseInt(row.shotsAgainst, 10) : null;
  const goalsAgainst = row.goalsAgainst ? parseInt(row.goalsAgainst, 10) : null;
  const savePct = row.savePct ? parseFloat(row.savePct) : null;
  const shutouts = row.shutouts ? parseInt(row.shutouts, 10) : null;

  return {
    playerId: player.id,
    gameId,
    gameDate,
    season,
    gameType: 'regular', // Default to regular season
    opponentTeam,
    isHome,
    team,
    goals,
    assists,
    points,
    shots,
    shotsOnGoal,
    hits,
    blocks,
    powerPlayPoints,
    plusMinus,
    pim,
    timeOnIce: toi.formatted,
    timeOnIceSeconds: toi.seconds,
    wins,
    saves,
    shotsAgainst,
    goalsAgainst,
    savePct,
    shutouts,
  };
}

/**
 * Import game logs from CSV
 */
async function importGameLogs(
  csvPath: string,
  options: { season?: string; dryRun?: boolean } = {}
): Promise<ImportStats> {
  const stats: ImportStats = {
    totalRows: 0,
    processed: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    playerNotFound: 0,
    duplicates: 0,
  };

  console.log('\n🚀 Starting MoneyPuck import...\n');
  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No data will be inserted\n');
  }

  // Parse CSV
  const rows = parseCSV(csvPath);
  stats.totalRows = rows.length;

  console.log(`📊 Processing ${rows.length} rows...\n`);

  // Process in batches
  const batchSize = 100;
  let batch: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      const gameLogData = await convertRowToGameLog(row, options.season);
      
      if (!gameLogData) {
        stats.playerNotFound++;
        if (stats.playerNotFound <= 10) {
          console.log(`⚠️  Player not found: ${row.player_name || row.playerName || row.name}`);
        }
        stats.skipped++;
        continue;
      }

      // Check for duplicate
      const existing = await prisma.gameLog.findUnique({
        where: {
          playerId_gameId: {
            playerId: gameLogData.playerId,
            gameId: gameLogData.gameId,
          },
        },
      });

      if (existing) {
        stats.duplicates++;
        stats.skipped++;
        continue;
      }

      batch.push(gameLogData);
      stats.processed++;

      // Insert batch when full
      if (batch.length >= batchSize) {
        if (!options.dryRun) {
          await prisma.gameLog.createMany({
            data: batch,
            skipDuplicates: true,
          });
        }
        stats.inserted += batch.length;
        batch = [];
        
        // Progress update
        if (stats.processed % 1000 === 0) {
          console.log(`  Processed: ${stats.processed}/${stats.totalRows} (${Math.round(stats.processed / stats.totalRows * 100)}%)`);
        }
      }
    } catch (error: any) {
      stats.errors++;
      if (stats.errors <= 10) {
        console.error(`❌ Error processing row ${i + 1}:`, error.message);
      }
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    if (!options.dryRun) {
      await prisma.gameLog.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }
    stats.inserted += batch.length;
  }

  return stats;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: tsx scripts/import-moneypuck.ts <csv-file> [options]

Options:
  --season=YYYYYYYY    Override season (e.g., 20232024)
  --dry-run            Don't insert data, just validate

Example:
  tsx scripts/import-moneypuck.ts ./data/moneypuck_2023-24.csv --season=20232024
    `);
    process.exit(1);
  }

  const csvPath = args[0];
  const season = args.find(arg => arg.startsWith('--season='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  try {
    const stats = await importGameLogs(csvPath, { season, dryRun });

    console.log('\n' + '='.repeat(50));
    console.log('📊 Import Summary');
    console.log('='.repeat(50));
    console.log(`Total rows:        ${stats.totalRows}`);
    console.log(`Processed:         ${stats.processed}`);
    console.log(`Inserted:          ${stats.inserted}`);
    console.log(`Skipped:           ${stats.skipped}`);
    console.log(`  - Player not found: ${stats.playerNotFound}`);
    console.log(`  - Duplicates:       ${stats.duplicates}`);
    console.log(`Errors:            ${stats.errors}`);
    console.log('='.repeat(50) + '\n');

    if (dryRun) {
      console.log('⚠️  This was a dry run. Run without --dry-run to insert data.\n');
    } else {
      console.log('✅ Import completed!\n');
    }
  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { importGameLogs, parseCSV, findPlayerByName };

