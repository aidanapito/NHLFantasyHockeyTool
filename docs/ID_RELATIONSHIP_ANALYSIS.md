# ID Relationship Analysis

## Current State (INCONSISTENT!)

### Player Table
- `id` (Int, autoincrement) - Database primary key
- `nhlId` (Int, unique) - NHL's player ID

### Tables Using Database ID (`Player.id`):
✅ **PlayerStats** - `playerId` → `Player.id`
✅ **GameLog** - `playerId` → `Player.id`

### Tables Using NHL ID (`Player.nhlId`):
❌ **FantasyRoster** - `playerId` → `Player.nhlId` ⚠️ INCONSISTENT!

## The Problem

When you query:
- `FantasyRoster.playerId` = NHL ID (e.g., 8471214)
- `GameLog.playerId` = Database ID (e.g., 123)
- `PlayerStats.playerId` = Database ID (e.g., 123)

This makes it hard to join data across tables!

## Solution: Standardize to Database ID

We should change FantasyRoster to use `Player.id` instead of `Player.nhlId`.
This way all tables consistently use the database ID.

