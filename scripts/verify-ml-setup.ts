/**
 * Verification Script for ML Model Setup
 * 
 * Checks that all requirements are met for the matchup analyzer ML model.
 * 
 * Usage:
 *   npm run verify-ml-setup
 *   (or: tsx scripts/verify-ml-setup.ts)
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface VerificationResult {
  check: string;
  status: '✅' | '❌' | '⚠️';
  message: string;
}

async function verifySetup(): Promise<void> {
  const results: VerificationResult[] = [];

  console.log('\n🔍 Verifying ML Model Setup...\n');

  // 1. Check model artifacts
  const artifactsDir = path.join(process.cwd(), 'analytics-service', 'modeling', 'artifacts');
  const requiredArtifacts = [
    'player_perf_v1.pt',
    'player_perf_v1.metadata.json',
    'player_perf_v1.encoders.json',
  ];
  
  for (const artifact of requiredArtifacts) {
    const artifactPath = path.join(artifactsDir, artifact);
    const exists = fs.existsSync(artifactPath);
    results.push({
      check: `Model artifact: ${artifact}`,
      status: exists ? '✅' : '❌',
      message: exists ? 'Found' : 'Missing - model needs to be trained',
    });
  }

  // 2. Check config includes 20252026 season
  const configPath = path.join(process.cwd(), 'analytics-service', 'modeling', 'config.py');
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const has20252026 = configContent.includes('"20252026"') || configContent.includes("'20252026'");
    results.push({
      check: 'Config includes 20252026 season',
      status: has20252026 ? '✅' : '❌',
      message: has20252026 ? '20252026 season configured' : 'Need to add 20252026 to seasons list',
    });
  } else {
    results.push({
      check: 'Config file exists',
      status: '❌',
      message: 'config.py not found',
    });
  }

  // 3. Check Python venv
  const venvPath = path.join(process.cwd(), 'analytics-service', 'venv', 'bin', 'python3');
  const venvExists = fs.existsSync(venvPath);
  results.push({
    check: 'Python virtual environment',
    status: venvExists ? '✅' : '❌',
    message: venvExists ? 'Found' : 'Need to create venv and install requirements',
  });

  // 4. Check database connection and GameLog data
  try {
    const seasonCounts = await prisma.$queryRaw<Array<{season: string, count: bigint}>>`
      SELECT season, COUNT(*)::bigint as count
      FROM "GameLog"
      GROUP BY season
      ORDER BY season
    `;

    const has20232024 = seasonCounts.some(s => s.season === '20232024');
    const has20252026 = seasonCounts.some(s => s.season === '20252026');

    results.push({
      check: 'GameLog: 2023-2024 season data',
      status: has20232024 ? '✅' : '❌',
      message: has20232024 
        ? `Found ${seasonCounts.find(s => s.season === '20232024')?.count || 0} games`
        : 'No 2023-2024 data - need to collect game logs',
    });

    results.push({
      check: 'GameLog: 2025-2026 season data',
      status: has20252026 ? '✅' : '❌',
      message: has20252026
        ? `Found ${seasonCounts.find(s => s.season === '20252026')?.count || 0} games`
        : 'No 2025-2026 data - need to run: npm run collect-game-logs -- --season=20252026',
    });

    // Show all seasons found
    if (seasonCounts.length > 0) {
      console.log('\n📊 GameLog Data by Season:');
      for (const row of seasonCounts) {
        console.log(`   ${row.season}: ${row.count} games`);
      }
    }
  } catch (error: any) {
    results.push({
      check: 'Database connection',
      status: '❌',
      message: `Error: ${error.message}`,
    });
  }

  // 5. Check Player table has entries
  try {
    const playerCount = await prisma.player.count();
    // Use raw query to avoid Prisma type issues with nullable fields
    const playersWithNhlIdResult = await prisma.$queryRaw<Array<{count: bigint}>>`
      SELECT COUNT(*)::bigint as count
      FROM "Player"
      WHERE "nhlId" IS NOT NULL
    `;
    const playersWithNhlId = Number(playersWithNhlIdResult[0]?.count || 0);

    results.push({
      check: 'Player table populated',
      status: playerCount > 0 ? '✅' : '❌',
      message: `${playerCount} players, ${playersWithNhlId} with NHL IDs`,
    });
  } catch (error: any) {
    results.push({
      check: 'Player table access',
      status: '❌',
      message: `Error: ${error.message}`,
    });
  }

  // 6. Check environment variable
  const hasDbUrl = !!process.env.DATABASE_URL;
  results.push({
    check: 'DATABASE_URL environment variable',
    status: hasDbUrl ? '✅' : '⚠️',
    message: hasDbUrl ? 'Set' : 'May be set in .env file',
  });

  // Print results
  console.log('\n📋 Verification Results:\n');
  for (const result of results) {
    console.log(`${result.status} ${result.check}`);
    console.log(`   ${result.message}\n`);
  }

  // Summary
  const passed = results.filter(r => r.status === '✅').length;
  const failed = results.filter(r => r.status === '❌').length;
  const warnings = results.filter(r => r.status === '⚠️').length;

  console.log('\n📊 Summary:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⚠️  Warnings: ${warnings}\n`);

  if (failed === 0) {
    console.log('🎉 All critical checks passed! The ML model should be ready to use.\n');
  } else {
    console.log('⚠️  Some checks failed. Please address the issues above.\n');
  }

  await prisma.$disconnect();
}

verifySetup().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

