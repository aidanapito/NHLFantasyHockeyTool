/**
 * Comprehensive database validation script
 * 
 * Validates:
 * 1. Database connectivity (Prisma and direct SQL)
 * 2. Schema structure matches Prisma schema
 * 3. Foreign key relationships and integrity
 * 4. Data consistency (IDs, duplicates, orphans)
 * 5. Index presence
 * 6. Required constraints
 * 
 * Usage: npx tsx scripts/validate-database.ts
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ValidationResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

const results: ValidationResult[] = [];

function addResult(name: string, status: 'pass' | 'fail' | 'warning', message: string, details?: any) {
  results.push({ name, status, message, details });
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${name}: ${message}`);
  if (details && (status === 'fail' || status === 'warning')) {
    console.log(`   Details:`, JSON.stringify(details, null, 2));
  }
}

async function validateConnectivity() {
  try {
    await prisma.$connect();
    addResult('Database Connectivity', 'pass', 'Successfully connected to database via Prisma');
    
    // Test query
    const count = await prisma.player.count();
    addResult('Database Query Test', 'pass', `Successfully queried database (found ${count} players)`);
  } catch (error: any) {
    addResult('Database Connectivity', 'fail', `Failed to connect: ${error.message}`);
  }
}

async function validateSchema() {
  try {
    // Check that all expected tables exist
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    
    const tableNames = tables.map(t => t.tablename);
    const expectedTables = [
      'Player',
      'PlayerStats',
      'PlayerProjection',
      'GameLog',
      'FantasyLeague',
      'FantasyTeam',
      'FantasyRoster',
      'DataRefresh',
      '_prisma_migrations'
    ];
    
    const missingTables = expectedTables.filter(t => !tableNames.includes(t));
    const unexpectedTables = tableNames.filter(t => !expectedTables.includes(t));
    
    if (missingTables.length > 0) {
      addResult('Schema - Required Tables', 'fail', 
        `Missing tables: ${missingTables.join(', ')}`, { missing: missingTables });
    } else {
      addResult('Schema - Required Tables', 'pass', 'All required tables exist');
    }
    
    if (unexpectedTables.length > 0) {
      addResult('Schema - Unexpected Tables', 'warning', 
        `Found unexpected tables: ${unexpectedTables.join(', ')}`, { unexpected: unexpectedTables });
    }
  } catch (error: any) {
    addResult('Schema Validation', 'fail', `Error checking schema: ${error.message}`);
  }
}

async function validateForeignKeys() {
  try {
    // Check GameLog.playerId references Player.id
    const orphanedGameLogs = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "GameLog" gl
      LEFT JOIN "Player" p ON gl."playerId" = p.id
      WHERE p.id IS NULL
    `;
    
    const count = Number(orphanedGameLogs[0].count);
    if (count > 0) {
      addResult('Foreign Keys - GameLog.playerId', 'fail', 
        `Found ${count} GameLog entries with invalid playerId references`);
      
      // Get sample orphaned IDs
      const samples = await prisma.$queryRaw<Array<{ playerId: number }>>`
        SELECT DISTINCT gl."playerId"
        FROM "GameLog" gl
        LEFT JOIN "Player" p ON gl."playerId" = p.id
        WHERE p.id IS NULL
        LIMIT 5
      `;
      addResult('Foreign Keys - GameLog.playerId (samples)', 'fail', 
        'Sample orphaned playerIds', { samples: samples.map(s => s.playerId) });
    } else {
      addResult('Foreign Keys - GameLog.playerId', 'pass', 'All GameLog entries have valid player references');
    }
    
    // Check PlayerStats.playerId
    const orphanedPlayerStats = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "PlayerStats" ps
      LEFT JOIN "Player" p ON ps."playerId" = p.id
      WHERE p.id IS NULL
    `;
    
    const psCount = Number(orphanedPlayerStats[0].count);
    if (psCount > 0) {
      addResult('Foreign Keys - PlayerStats.playerId', 'fail', 
        `Found ${psCount} PlayerStats entries with invalid playerId references`);
    } else {
      addResult('Foreign Keys - PlayerStats.playerId', 'pass', 'All PlayerStats entries have valid player references');
    }
    
    // Check PlayerProjection.playerId
    const orphanedProjections = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "PlayerProjection" pp
      LEFT JOIN "Player" p ON pp."playerId" = p.id
      WHERE p.id IS NULL
    `;
    
    const ppCount = Number(orphanedProjections[0].count);
    if (ppCount > 0) {
      addResult('Foreign Keys - PlayerProjection.playerId', 'fail', 
        `Found ${ppCount} PlayerProjection entries with invalid playerId references`);
    } else {
      addResult('Foreign Keys - PlayerProjection.playerId', 'pass', 'All PlayerProjection entries have valid player references');
    }
    
    // Check FantasyRoster.playerId
    const orphanedRosters = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "FantasyRoster" fr
      LEFT JOIN "Player" p ON fr."playerId" = p.id
      WHERE p.id IS NULL
    `;
    
    const frCount = Number(orphanedRosters[0].count);
    if (frCount > 0) {
      addResult('Foreign Keys - FantasyRoster.playerId', 'fail', 
        `Found ${frCount} FantasyRoster entries with invalid playerId references`);
    } else {
      addResult('Foreign Keys - FantasyRoster.playerId', 'pass', 'All FantasyRoster entries have valid player references');
    }
    
    // Check FantasyTeam.leagueId
    const orphanedTeams = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "FantasyTeam" ft
      LEFT JOIN "FantasyLeague" fl ON ft."leagueId" = fl.id
      WHERE fl.id IS NULL
    `;
    
    const ftCount = Number(orphanedTeams[0].count);
    if (ftCount > 0) {
      addResult('Foreign Keys - FantasyTeam.leagueId', 'fail', 
        `Found ${ftCount} FantasyTeam entries with invalid leagueId references`);
    } else {
      addResult('Foreign Keys - FantasyTeam.leagueId', 'pass', 'All FantasyTeam entries have valid league references');
    }
    
    // Check FantasyRoster.teamId
    const orphanedRosterTeams = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "FantasyRoster" fr
      LEFT JOIN "FantasyTeam" ft ON fr."teamId" = ft.id
      WHERE ft.id IS NULL
    `;
    
    const frtCount = Number(orphanedRosterTeams[0].count);
    if (frtCount > 0) {
      addResult('Foreign Keys - FantasyRoster.teamId', 'fail', 
        `Found ${frtCount} FantasyRoster entries with invalid teamId references`);
    } else {
      addResult('Foreign Keys - FantasyRoster.teamId', 'pass', 'All FantasyRoster entries have valid team references');
    }
  } catch (error: any) {
    addResult('Foreign Key Validation', 'fail', `Error checking foreign keys: ${error.message}`);
  }
}

async function validateGameLogPlayerIds() {
  try {
    // Check if GameLog.playerId contains NHL IDs instead of database IDs
    // This query checks if any GameLog.playerId matches a Player.nhlId but not a Player.id
    const nhlIdMatches = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "GameLog" gl
      INNER JOIN "Player" p ON gl."playerId" = p."nhlId"
      LEFT JOIN "Player" p2 ON gl."playerId" = p2.id
      WHERE p2.id IS NULL
    `;
    
    const count = Number(nhlIdMatches[0].count);
    if (count > 0) {
      addResult('GameLog.playerId Type Check', 'fail', 
        `Found ${count} GameLog entries where playerId matches Player.nhlId but not Player.id. ` +
        `This suggests GameLog.playerId contains NHL IDs instead of database IDs.`);
      
      // Get samples
      const samples = await prisma.$queryRaw<Array<{ playerId: number; nhlId: number }>>`
        SELECT DISTINCT gl."playerId", p."nhlId"
        FROM "GameLog" gl
        INNER JOIN "Player" p ON gl."playerId" = p."nhlId"
        LEFT JOIN "Player" p2 ON gl."playerId" = p2.id
        WHERE p2.id IS NULL
        LIMIT 5
      `;
      addResult('GameLog.playerId Type Check (samples)', 'fail', 
        'Sample entries that match on nhlId but not id', { samples });
    } else {
      addResult('GameLog.playerId Type Check', 'pass', 
        'GameLog.playerId correctly uses database IDs (not NHL IDs)');
    }
  } catch (error: any) {
    addResult('GameLog.playerId Validation', 'fail', `Error checking GameLog.playerId: ${error.message}`);
  }
}

async function validatePlayerDuplicates() {
  try {
    // Check for duplicate players by name
    const duplicates = await prisma.$queryRaw<Array<{ fullName: string; count: bigint; ids: string }>>`
      SELECT 
        "fullName",
        COUNT(*) as count,
        STRING_AGG(id::text, ', ' ORDER BY id) as ids
      FROM "Player"
      GROUP BY "fullName"
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;
    
    if (duplicates.length > 0) {
      addResult('Player Duplicates', 'warning', 
        `Found ${duplicates.length} player names with multiple entries`, 
        { duplicates: duplicates.map(d => ({ name: d.fullName, count: Number(d.count), ids: d.ids })) });
    } else {
      addResult('Player Duplicates', 'pass', 'No duplicate player names found');
    }
    
    // Check for duplicate nhlIds
    const duplicateNhlIds = await prisma.$queryRaw<Array<{ nhlId: number; count: bigint; ids: string }>>`
      SELECT 
        "nhlId",
        COUNT(*) as count,
        STRING_AGG(id::text, ', ' ORDER BY id) as ids
      FROM "Player"
      WHERE "nhlId" IS NOT NULL
      GROUP BY "nhlId"
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;
    
    if (duplicateNhlIds.length > 0) {
      addResult('Player Duplicate NHL IDs', 'fail', 
        `Found ${duplicateNhlIds.length} NHL IDs with multiple Player entries (nhlId should be unique)`, 
        { duplicates: duplicateNhlIds.map(d => ({ nhlId: d.nhlId, count: Number(d.count), ids: d.ids })) });
    } else {
      addResult('Player Duplicate NHL IDs', 'pass', 'All NHL IDs are unique');
    }
  } catch (error: any) {
    addResult('Player Duplicate Check', 'fail', `Error checking duplicates: ${error.message}`);
  }
}

async function validateIndexes() {
  try {
    // Check for critical indexes
    const indexes = await prisma.$queryRaw<Array<{ indexname: string; tablename: string }>>`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `;
    
    const indexMap = new Map<string, Set<string>>();
    indexes.forEach(idx => {
      if (!indexMap.has(idx.tablename)) {
        indexMap.set(idx.tablename, new Set());
      }
      indexMap.get(idx.tablename)!.add(idx.indexname);
    });
    
    // Check critical indexes
    const criticalIndexes = [
      { table: 'Player', index: 'Player_nhlId_key' },
      { table: 'GameLog', index: 'GameLog_playerId_gameId_key' },
      { table: 'PlayerStats', index: 'PlayerStats_playerId_season_gameType_key' },
      { table: 'PlayerProjection', index: 'PlayerProjection_playerId_gameDate_modelVersion_key' },
      { table: 'FantasyRoster', index: 'FantasyRoster_teamId_playerId_key' },
    ];
    
    let allIndexesPresent = true;
    for (const { table, index } of criticalIndexes) {
      const tableIndexes = indexMap.get(table) || new Set();
      if (!tableIndexes.has(index)) {
        addResult(`Index - ${table}.${index}`, 'warning', `Index ${index} not found on ${table}`);
        allIndexesPresent = false;
      }
    }
    
    if (allIndexesPresent) {
      addResult('Critical Indexes', 'pass', 'All critical unique constraints/indexes are present');
    }
  } catch (error: any) {
    addResult('Index Validation', 'fail', `Error checking indexes: ${error.message}`);
  }
}

async function validateConstraints() {
  try {
    // Check for required constraints
    const constraints = await prisma.$queryRaw<Array<{ constraint_name: string; table_name: string; constraint_type: string }>>`
      SELECT 
        constraint_name,
        table_name,
        constraint_type
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
      AND constraint_type IN ('UNIQUE', 'PRIMARY KEY', 'FOREIGN KEY')
      ORDER BY table_name, constraint_type, constraint_name
    `;
    
    // Verify critical unique constraints
    const hasPlayerNhlIdUnique = constraints.some(
      c => c.table_name === 'Player' && c.constraint_name === 'Player_nhlId_key'
    );
    
    if (!hasPlayerNhlIdUnique) {
      addResult('Constraint - Player.nhlId unique', 'fail', 'Player.nhlId should have a unique constraint');
    } else {
      addResult('Constraint - Player.nhlId unique', 'pass', 'Player.nhlId has unique constraint');
    }
    
    const hasGameLogUnique = constraints.some(
      c => c.table_name === 'GameLog' && c.constraint_name === 'GameLog_playerId_gameId_key'
    );
    
    if (!hasGameLogUnique) {
      addResult('Constraint - GameLog unique', 'fail', 'GameLog should have unique constraint on (playerId, gameId)');
    } else {
      addResult('Constraint - GameLog unique', 'pass', 'GameLog has unique constraint on (playerId, gameId)');
    }
  } catch (error: any) {
    addResult('Constraint Validation', 'fail', `Error checking constraints: ${error.message}`);
  }
}

async function validateDataConsistency() {
  try {
    // Check for players with no game logs or stats
    const playersWithoutData = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Player" p
      WHERE p."isActive" = true
      AND NOT EXISTS (SELECT 1 FROM "GameLog" gl WHERE gl."playerId" = p.id)
      AND NOT EXISTS (SELECT 1 FROM "PlayerStats" ps WHERE ps."playerId" = p.id)
    `;
    
    const count = Number(playersWithoutData[0].count);
    if (count > 0) {
      addResult('Data Consistency - Active Players Without Data', 'warning', 
        `Found ${count} active players with no GameLog or PlayerStats entries`);
    } else {
      addResult('Data Consistency - Active Players Without Data', 'pass', 
        'All active players have associated data');
    }
    
    // Check for game logs with invalid game dates
    const invalidDates = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "GameLog"
      WHERE "gameDate" IS NULL OR "gameDate" > NOW() + INTERVAL '1 day'
    `;
    
    const dateCount = Number(invalidDates[0].count);
    if (dateCount > 0) {
      addResult('Data Consistency - GameLog Dates', 'warning', 
        `Found ${dateCount} GameLog entries with NULL or future dates`);
    } else {
      addResult('Data Consistency - GameLog Dates', 'pass', 'All GameLog entries have valid dates');
    }
  } catch (error: any) {
    addResult('Data Consistency Validation', 'fail', `Error checking data consistency: ${error.message}`);
  }
}

async function generateSummary() {
  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warnCount = results.filter(r => r.status === 'warning').length;
  const total = results.length;
  
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total checks: ${total}`);
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`⚠️  Warnings: ${warnCount}`);
  console.log('='.repeat(60));
  
  if (failCount > 0) {
    console.log('\n❌ FAILED CHECKS:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
  }
  
  if (warnCount > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.filter(r => r.status === 'warning').forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
  }
  
  if (failCount === 0 && warnCount === 0) {
    console.log('\n🎉 All checks passed! Your database is properly configured.');
  } else if (failCount === 0) {
    console.log('\n✅ All critical checks passed. Some warnings were found.');
  } else {
    console.log('\n⚠️  Some critical checks failed. Please review and fix the issues above.');
    process.exit(1);
  }
}

async function main() {
  console.log('Starting database validation...\n');
  
  await validateConnectivity();
  await validateSchema();
  await validateForeignKeys();
  await validateGameLogPlayerIds();
  await validatePlayerDuplicates();
  await validateIndexes();
  await validateConstraints();
  await validateDataConsistency();
  
  await generateSummary();
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

