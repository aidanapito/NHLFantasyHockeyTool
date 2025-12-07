# MoneyPuck Import Guide

## Overview
This guide explains how to import historical game-by-game data from MoneyPuck into your database.

## Prerequisites

1. **Install csv-parse package:**
   ```bash
   npm install csv-parse
   ```

2. **Apply database migration:**
   ```bash
   npx prisma migrate deploy
   ```
   Or if you need to accept data loss warnings:
   ```bash
   npx prisma db push --accept-data-loss
   ```

## Getting MoneyPuck Data

1. Visit https://moneypuck.com/data.htm
2. Download CSV files for the seasons you want:
   - 2021-22 season
   - 2022-23 season  
   - 2023-24 season
3. Save the files in a `data/` directory (or any location you prefer)

## Import Process

### Step 1: Test with Dry Run

First, test the import without actually inserting data:

```bash
npm run import-moneypuck ./data/moneypuck_2023-24.csv --season=20232024 --dry-run
```

This will:
- Parse the CSV file
- Match players to your database
- Show statistics without inserting data
- Help you identify any issues

### Step 2: Import Data

Once you're satisfied with the dry run, import the data:

```bash
npm run import-moneypuck ./data/moneypuck_2023-24.csv --season=20232024
```

### Step 3: Import Multiple Seasons

Repeat for each season:

```bash
# 2021-22 season
npm run import-moneypuck ./data/moneypuck_2021-22.csv --season=20212022

# 2022-23 season
npm run import-moneypuck ./data/moneypuck_2022-23.csv --season=20222023

# 2023-24 season
npm run import-moneypuck ./data/moneypuck_2023-24.csv --season=20232024
```

## Script Options

- `--season=YYYYYYYY` - Override season (e.g., 20232024)
- `--dry-run` - Validate without inserting data

## Expected Output

The script will show:
- Total rows processed
- Number of records inserted
- Players not found (will be skipped)
- Duplicate records (will be skipped)
- Any errors encountered

## Troubleshooting

### Players Not Found

If many players are not found:
- The player names in MoneyPuck might not match your database
- Check the console output for specific player names
- You may need to update player names in your database

### CSV Format Issues

MoneyPuck CSV files may have different column names. The script handles common variations:
- `player_name`, `playerName`, `name`
- `game_id`, `gameId`
- `date`, `gameDate`
- `shots`, `shotsOnGoal`
- `blocks`, `blockedShots`
- etc.

If you encounter issues, check the CSV column headers and adjust the script if needed.

### Database Connection

Make sure your `.env` file has the correct `DATABASE_URL`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/nhlstats"
```

## Next Steps

After importing game logs:
1. Verify data quality by checking a few players
2. Set up daily collection for ongoing games (see Phase 3)
3. Train your ML model with the game-by-game data

## Data Structure

The `GameLog` table stores:
- Player ID and game ID (unique combination)
- Game date and season
- Opponent and home/away status
- All fantasy-relevant stats (goals, assists, points, shots, hits, blocks, etc.)
- Goalie stats (if applicable)
- Time on ice information

## Performance Notes

- The script processes data in batches of 100 records
- Large CSV files (100k+ rows) may take 10-30 minutes
- Progress is shown every 1000 records
- Duplicate records are automatically skipped

