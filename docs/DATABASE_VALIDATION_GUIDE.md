# Database Validation Guide

This guide explains how to validate your database setup and ensure data integrity across both the Node.js/Next.js application and the Python analytics service.

## Overview

Both services connect to the same PostgreSQL database:
- **Node.js/Next.js**: Uses Prisma ORM via `DATABASE_URL` environment variable
- **Python Analytics Service**: Uses SQLAlchemy via `DATABASE_URL` environment variable

## Running Validation

### Option 1: TypeScript Validation Script (Recommended)

From the project root:

```bash
npm run validate-db
```

Or directly:

```bash
npx tsx scripts/validate-database.ts
```

### Option 2: Python Validation Script

From the project root:

```bash
cd analytics-service
source venv/bin/activate
python validate_database.py
```

## What Gets Validated

### 1. Database Connectivity
- ✅ Verifies connection to PostgreSQL database
- ✅ Tests basic query execution
- ✅ Confirms both Prisma and SQLAlchemy can connect

### 2. Schema Structure
- ✅ Checks all required tables exist:
  - `Player`
  - `PlayerStats`
  - `PlayerProjection`
  - `GameLog`
  - `FantasyLeague`
  - `FantasyTeam`
  - `FantasyRoster`
  - `DataRefresh`
- ⚠️ Warns about unexpected tables

### 3. Foreign Key Relationships
- ✅ Validates `GameLog.playerId` → `Player.id`
- ✅ Validates `PlayerStats.playerId` → `Player.id`
- ✅ Validates `PlayerProjection.playerId` → `Player.id`
- ✅ Validates `FantasyRoster.playerId` → `Player.id`
- ✅ Validates `FantasyRoster.teamId` → `FantasyTeam.id`
- ✅ Validates `FantasyTeam.leagueId` → `FantasyLeague.id`

### 4. Data Type Validation
- ✅ **Critical**: Checks if `GameLog.playerId` uses database IDs (correct) or NHL IDs (incorrect)
  - This is a common issue where GameLog entries were created with NHL IDs instead of database IDs
  - If found, you'll need to run a migration script to fix this

### 5. Data Integrity
- ✅ Checks for duplicate players (by name and by NHL ID)
- ✅ Validates unique constraints
- ✅ Checks for orphaned records
- ✅ Validates date consistency

### 6. Indexes and Constraints
- ✅ Verifies critical unique constraints exist
- ✅ Checks primary keys
- ✅ Validates indexes for performance

## Common Issues and Fixes

### Issue: GameLog.playerId contains NHL IDs instead of database IDs

**Symptom**: Validation shows "GameLog.playerId matches Player.nhlId but not Player.id"

**Fix**: Run a migration script to update GameLog.playerId values:

```sql
-- This is an example - actual fix script should be created based on your data
UPDATE "GameLog" gl
SET "playerId" = p.id
FROM "Player" p
WHERE gl."playerId" = p."nhlId"
AND gl."playerId" != p.id;
```

### Issue: Duplicate Players

**Symptom**: Validation shows duplicate player names or NHL IDs

**Fix**: Identify and merge duplicates using a deduplication script. The validation will show which player IDs need to be merged.

### Issue: Orphaned Foreign Keys

**Symptom**: Validation shows orphaned records (e.g., GameLog entries with invalid playerId)

**Fix**: Either:
1. Delete the orphaned records
2. Create missing Player records
3. Update foreign keys to point to valid records

### Issue: Missing Tables

**Symptom**: Validation fails because required tables don't exist

**Fix**: Run Prisma migrations:

```bash
npx prisma migrate deploy
```

Or for development:

```bash
npx prisma migrate dev
```

## Environment Setup

Make sure your `.env` file (in the project root) contains:

```env
DATABASE_URL="postgresql://user:password@host:port/database"
```

**Important**: 
- The Python service automatically removes Prisma-specific schema parameters (`?schema=...`) from the connection string
- Both services should use the same `DATABASE_URL` value

## Integration with CI/CD

You can add validation to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Validate Database
  run: npm run validate-db
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Regular Maintenance

Run validation:
1. **After migrations**: To ensure schema changes were applied correctly
2. **After data imports**: To catch any data integrity issues
3. **Before deployments**: To catch issues early
4. **Periodically**: As part of regular maintenance

## Getting Help

If validation fails:
1. Review the detailed error messages
2. Check the database schema: `npx prisma db pull`
3. Verify environment variables are set correctly
4. Check database connection permissions
5. Review recent migrations or data imports

## Expected Output

A successful validation run should show:

```
Starting database validation...

✅ Database Connectivity: Successfully connected to database via Prisma
✅ Database Query Test: Successfully queried database (found X players)
✅ Schema - Required Tables: All required tables exist
✅ Foreign Keys - GameLog.playerId: All GameLog entries have valid player references
✅ GameLog.playerId Type Check: GameLog.playerId correctly uses database IDs (not NHL IDs)
✅ Player Duplicates: No duplicate player names found
✅ Player Duplicate NHL IDs: All NHL IDs are unique
✅ Critical Indexes: All critical unique constraints/indexes are present
...

============================================================
VALIDATION SUMMARY
============================================================
Total checks: XX
✅ Passed: XX
❌ Failed: 0
⚠️  Warnings: 0
============================================================

🎉 All checks passed! Your database is properly configured.
```

